'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { BrandLockup } from '@/components/ui/Mark';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    phone: '',
    city: '',
    area: '',
    user_type: 'customer',
    business_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check URL params for user_type (e.g., ?user_type=seller)
  useEffect(() => {
    const userTypeParam = searchParams.get('user_type');
    if (userTypeParam === 'seller') {
      setFormData(prev => ({ ...prev, user_type: 'seller' }));
    }
  }, [searchParams]);

  const handleGoogleSuccess = async (accessToken: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await authService.loginWithGoogle(accessToken);
      
      if (response && response.data) {
        if (response.data.tokens) {
          apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
        }
        
        if (response.data.user) {
          setUser(response.data.user);
        }
        
        showToast('Successfully signed in with Google!', 'success');
        
        // Google OAuth users are always email verified, so skip email verification page
        // Only redirect to email verification if explicitly required AND not a Google OAuth user
        if (response.data.requiresEmailVerification && !response.data.user?.emailVerified) {
          router.push('/verify-email-pending');
        } else if (response.data.user?.user_type === 'seller') {
          // TODO: Create seller dashboard page
          router.push('/products');
        } else {
          router.push('/products');
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Google sign-in failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    // Validate business name for sellers
    if (formData.user_type === 'seller' && !formData.business_name.trim()) {
      setError('Business name is required for sellers');
      return;
    }

    setLoading(true);

    try {
      // Normalize email (trim and lowercase) before sending
      const normalizedEmail = formData.email.trim().toLowerCase();
      
      const response = await authService.register({
        email: normalizedEmail,
        password: formData.password,
        full_name: formData.full_name.trim(),
        user_type: formData.user_type,
        phone: formData.phone ? formData.phone.trim() : undefined,
        city: formData.city ? formData.city.trim() : undefined,
        area: formData.area ? formData.area.trim() : undefined,
        business_name: formData.user_type === 'seller' ? formData.business_name.trim() : undefined,
        referral_code: searchParams.get('ref')?.trim() || undefined,
      });
      
      // Check if response has data (successful registration)
      if (response && response.data) {
        // Store tokens if provided
        if (response.data.tokens) {
          apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
        }
        
        // Set user if provided
        if (response.data.user) {
          setUser(response.data.user);
        }
        
        // Show success message based on user type
        setError(''); // Clear any errors
        
        if (formData.user_type === 'seller') {
          showToast('Seller account created! Your account is pending admin approval.', 'success');
        } else {
          showToast('Registration successful! Welcome to Nuray!', 'success');
        }
        
        // Redirect based on user type
        if (response.data.requiresEmailVerification) {
          // Email verification required - redirect to pending page
          const redirectUrl = formData.user_type === 'seller' 
            ? '/verify-email-pending?next=/sellers/dashboard?onboarding=true'
            : '/verify-email-pending';
          router.push(redirectUrl);
        } else if (formData.user_type === 'seller') {
          // Seller - go to dashboard with onboarding modal
          router.push('/sellers/dashboard?onboarding=true');
        } else {
          // Customer - go to browse products
          router.push('/products');
        }
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Registration failed';
      const errorCode = err.response?.data?.error?.code;
      
      // Provide more specific error messages
      if (errorCode === 'EMAIL_EXISTS' || errorMessage.includes('already registered')) {
        setError('This email is already registered. Please login instead or use a different email.');
      } else if (errorCode === 'PHONE_EXISTS' || errorMessage.includes('Phone number already')) {
        setError('This phone number is already registered. Please login instead or use a different phone number.');
      } else if (errorCode === 'VALIDATION_ERROR') {
        const validationErrors = err.response?.data?.error?.details;
        if (validationErrors && Array.isArray(validationErrors)) {
          setError(validationErrors.map((e: any) => e.message).join(', '));
        } else {
          setError(errorMessage);
        }
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'nuray-input';
  const inputStyle: React.CSSProperties = {};
  const labelClass = 'eyebrow block mb-2';
  const helperClass = 'text-xs mt-1.5';
  const helperStyle = { color: 'var(--ink-500)' } as const;

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 nuray-bg-cream">
      <div className="nuray-w-card-md nuray-card p-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <BrandLockup markSize={44} wordSize={32} />
          </Link>
          <h1 className="font-display mt-6 text-[40px]" style={{ color: 'var(--ink-900)' }}>
            Join Nuray.
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-500)' }}>
            The taste of home, delivered cold.
          </p>
        </div>

        {/* User Type Selection */}
        <div className="mb-6">
          <label className={labelClass}>I want to</label>
          <div className="flex gap-1 p-1 rounded-full" style={{ background: 'var(--cream-100)' }}>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, user_type: 'customer' })}
              className="flex-1 h-11 rounded-full font-medium transition-colors"
              style={
                formData.user_type === 'customer'
                  ? { background: 'var(--forest-500)', color: 'var(--cream-50)', fontSize: 13 }
                  : { background: 'transparent', color: 'var(--ink-700)', fontSize: 13 }
              }
            >
              Buy food
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, user_type: 'seller' })}
              className="flex-1 h-11 rounded-full font-medium transition-colors"
              style={
                formData.user_type === 'seller'
                  ? { background: 'var(--ink-900)', color: 'var(--cream-50)', fontSize: 13 }
                  : { background: 'transparent', color: 'var(--ink-700)', fontSize: 13 }
              }
            >
              Sell food
            </button>
          </div>
          {formData.user_type === 'seller' && (
            <div className="mt-3 p-4 rounded-lg" style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-200)' }}>
              <p className="text-sm" style={{ color: 'var(--ink-800)' }}>
                <strong className="font-semibold">Seller registration:</strong> your account will be reviewed before going live.
              </p>
              <ul className="text-sm mt-2 ml-4 list-disc" style={{ color: 'var(--ink-700)' }}>
                <li>Enter your kitchen name below</li>
                <li>We'll visit, taste, and verify</li>
                <li>Once approved, you can start listing dishes</li>
              </ul>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm"
               style={{ background: 'var(--anar-50)', border: '1px solid var(--anar-200)', color: 'var(--anar-700)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div className="mb-4">
            <label htmlFor="email" className={labelClass}>
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="your@email.com"
              required
              className={inputClass}
              style={inputStyle}
            />
            <p className={helperClass} style={helperStyle}>
              We'll send a verification link to this email
            </p>
          </div>

          <div className="mb-4">
            <label htmlFor="password" className={labelClass}>
              Password *
            </label>
            <input
              type="password"
              id="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="At least 6 characters"
              required
              minLength={6}
              className={inputClass}
              style={inputStyle}
            />
            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-1 flex-1 rounded-full transition-colors"
                style={{
                  background:
                    formData.password.length >= 6
                      ? 'var(--forest-500)'
                      : formData.password.length > 0
                      ? 'var(--gold-400)'
                      : 'var(--ink-200)',
                }}
              />
              <span className={helperClass} style={helperStyle}>{formData.password.length}/6</span>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="confirmPassword" className={labelClass}>
              Confirm Password *
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="Confirm your password"
              required
              minLength={6}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="full_name" className={labelClass}>
              Full Name *
            </label>
            <input
              type="text"
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="Ahmed Khan"
              required
              className={inputClass}
              style={inputStyle}
            />
          </div>

          {/* Business Name - Only for Sellers */}
          {formData.user_type === 'seller' && (
            <div className="mb-4">
              <label htmlFor="business_name" className={labelClass}>
                Business/Kitchen Name *
              </label>
              <input
                type="text"
                id="business_name"
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                placeholder="e.g., Ammi's Kitchen, Lahori Delights"
                required
                className={inputClass}
              style={inputStyle}
              />
              <p className={helperClass} style={helperStyle}>
                This will be displayed to customers
              </p>
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="phone" className={labelClass}>
              Phone Number <span className="text-gray-500 text-xs">(Optional but recommended)</span>
            </label>
            <input
              type="tel"
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+923001234567"
              className={inputClass}
              style={inputStyle}
            />
            <p className={helperClass} style={helperStyle}>
              Add phone for quick OTP login option
            </p>
          </div>

          <div className="mb-4">
            <label htmlFor="city" className={labelClass}>
              City
            </label>
            <input
              type="text"
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Karachi"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="area" className={labelClass}>
              Area
            </label>
            <input
              type="text"
              id="area"
              value={formData.area}
              onChange={(e) => setFormData({ ...formData, area: e.target.value })}
              placeholder="DHA Phase 5"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Creating Account...
              </span>
            ) : (
              'Create Account'
            )}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" style={{ borderTop: '1px solid var(--ink-200)' }} />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-3 text-[11px] uppercase tracking-[0.18em] font-medium"
                style={{ background: 'var(--paper-0)', color: 'var(--ink-500)' }}
              >
                Or continue with
              </span>
            </div>
          </div>

          <GoogleSignInButton onSuccess={handleGoogleSuccess} text="Continue with Google" />

          <p className="text-xs text-center mt-4" style={{ color: 'var(--ink-500)' }}>
            By creating an account, you agree to our Terms and Privacy Policy
          </p>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm" style={{ color: 'var(--ink-500)' }}>
            Already have an account?{' '}
            <Link href="/login" className="font-medium" style={{ color: 'var(--forest-700)' }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream-50)' }}>
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-16 w-16 border-b-2 mx-auto mb-4"
              style={{ borderColor: 'var(--forest-500)' }}
            />
            <p style={{ color: 'var(--ink-500)' }}>Loading…</p>
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
