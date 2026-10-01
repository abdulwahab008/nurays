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
    city: 'Karachi',
    community: 'Askari 11',
    house_apt: '',
    area: '',
    user_type: 'customer',
    business_name: '',
    termsAccepted: false,
  });
  // Optional phone proof: send a code to the number, enter it, and the phone is saved verified.
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [sendingPhoneOtp, setSendingPhoneOtp] = useState(false);
  const [phoneOtpMessage, setPhoneOtpMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check URL params for user_type (e.g., ?user_type=seller, ?user_type=rider)
  useEffect(() => {
    const userTypeParam = searchParams.get('user_type');
    if (userTypeParam === 'seller' || userTypeParam === 'rider') {
      setFormData(prev => ({ ...prev, user_type: userTypeParam }));
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
        } else {
          const uType = response.data.user?.userType || response.data.user?.user_type;
          if (uType === 'seller') {
            router.push('/sellers/dashboard');
          } else if (uType === 'rider') {
            router.push('/riders/dashboard');
          } else if (uType === 'admin') {
            router.push('/admin/dashboard');
          } else {
            router.push('/dashboard');
          }
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

    if (!formData.termsAccepted) {
      setError('Please agree to the Terms of Service and Community Guidelines to proceed');
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
        phone_otp: formData.phone && phoneOtp.trim() ? phoneOtp.trim() : undefined,
        city: formData.city ? formData.city.trim() : undefined,
        area: formData.area ? formData.area.trim() : undefined,
        business_name: formData.user_type === 'seller' ? formData.business_name.trim() : undefined,
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
        } else if (formData.user_type === 'rider') {
          showToast('Rider application submitted! It\'s pending admin approval.', 'success');
        } else {
          showToast('Registration successful! Welcome to Nuray!', 'success');
        }

        // Redirect based on user type
        const dashboardByType: Record<string, string> = {
          customer: '/dashboard',
          seller: '/sellers/dashboard?onboarding=true',
          rider: '/riders/dashboard',
        };
        if (response.data.requiresEmailVerification) {
          // Email verification required - redirect to pending page
          const redirectUrl = dashboardByType[formData.user_type]
            ? `/verify-email-pending?next=${encodeURIComponent(dashboardByType[formData.user_type])}`
            : '/verify-email-pending';
          router.push(redirectUrl);
        } else if (dashboardByType[formData.user_type]) {
          router.push(dashboardByType[formData.user_type]);
        } else {
          // Default to customer dashboard
          router.push('/dashboard');
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
  const labelClass = 'text-xs font-black uppercase tracking-wider text-slate-500 block mb-2';
  const helperClass = 'text-xs mt-1.5 text-slate-500';
  const helperStyle = {} as const;

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-[#FAFAFA]">
      <div className="nuray-w-card-md bg-white rounded-3xl p-8 sm:p-10 border border-slate-200/80 shadow-xl">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <BrandLockup markSize={44} wordSize={30} />
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-6 tracking-tight">
            Create Your Account
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
            Join Pakistan's premier food &amp; cold-chain marketplace.
          </p>
        </div>

        {/* User Type Selection */}
        <div className="mb-6">
          <label className={labelClass}>I want to</label>
          <div className="flex gap-1 p-1 rounded-full bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, user_type: 'customer' })}
              className={`flex-1 h-11 rounded-full font-bold transition-all text-xs ${
                formData.user_type === 'customer'
                  ? 'bg-gradient-to-r from-[#FF5500] to-[#FF2A00] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Order Food
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, user_type: 'seller' })}
              className={`flex-1 h-11 rounded-full font-bold transition-all text-xs ${
                formData.user_type === 'seller'
                  ? 'bg-[#0F172A] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cook &amp; Sell
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, user_type: 'rider' })}
              className={`flex-1 h-11 rounded-full font-bold transition-all text-xs ${
                formData.user_type === 'rider'
                  ? 'bg-[#0F172A] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Deliver / Ride
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
          {formData.user_type === 'rider' && (
            <div className="mt-3 p-4 rounded-lg" style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-200)' }}>
              <p className="text-sm" style={{ color: 'var(--ink-800)' }}>
                <strong className="font-semibold">Rider application:</strong> your account is reviewed before you can accept deliveries.
              </p>
              <ul className="text-sm mt-2 ml-4 list-disc" style={{ color: 'var(--ink-700)' }}>
                <li>Submit your application below</li>
                <li>Our team verifies your details</li>
                <li>Once approved, you can start claiming deliveries</li>
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
              Verify your phone to enable quick OTP login. Without verification the number is only kept as a contact.
            </p>
            {formData.phone.trim().length >= 10 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={sendingPhoneOtp}
                  onClick={async () => {
                    setSendingPhoneOtp(true);
                    setPhoneOtpMessage('');
                    try {
                      await authService.registerSendPhoneOtp(formData.phone.trim());
                      setPhoneOtpSent(true);
                      setPhoneOtpMessage('Code sent. Enter it below to verify this number.');
                    } catch (err: any) {
                      setPhoneOtpMessage(err.response?.data?.error?.message || 'Could not send the code. Try again.');
                    } finally {
                      setSendingPhoneOtp(false);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  {sendingPhoneOtp ? 'Sending…' : phoneOtpSent ? 'Resend code' : 'Send verification code'}
                </button>
                {phoneOtpSent && (
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit code"
                    className="w-32 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  />
                )}
              </div>
            )}
            {phoneOtpMessage && (
              <p className={helperClass} style={helperStyle}>
                {phoneOtpMessage}
              </p>
            )}
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
            <label htmlFor="community" className={labelClass}>
              Hyperlocal Community *
            </label>
            <select
              id="community"
              value={formData.community}
              onChange={(e) => setFormData({ ...formData, community: e.target.value })}
              className={inputClass}
              style={inputStyle}
              required
            >
              <option value="Askari 11">Askari 11 (Sector A/B/C)</option>
              <option value="Askari 10">Askari 10 (Main / Sector D)</option>
              <option value="DHA Phase 6">DHA Phase 6</option>
              <option value="DHA Phase 5">DHA Phase 5 (Commercial & Residential)</option>
              <option value="Bahria Town">Bahria Town Karachi</option>
              <option value="Gulshan-e-Iqbal">Gulshan-e-Iqbal</option>
              <option value="Clifton">Clifton (Blocks 1-9)</option>
              <option value="Other">Other Community</option>
            </select>
            <p className={helperClass} style={helperStyle}>
              Used to show your nearest home kitchens and fastest delivery riders
            </p>
          </div>

          <div className="mb-4">
            <label htmlFor="house_apt" className={labelClass}>
              House / Apartment / Street #
            </label>
            <input
              type="text"
              id="house_apt"
              value={formData.house_apt}
              onChange={(e) => setFormData({ ...formData, house_apt: e.target.value })}
              placeholder="e.g. Apt 402, Block B, Street 7"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="termsAccepted"
                checked={formData.termsAccepted}
                onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF5500] focus:ring-[#FF5500]"
                required
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                I agree to the{' '}
                <Link href="/terms" className="text-[#FF5500] font-semibold hover:underline">
                  Terms of Service
                </Link>
                ,{' '}
                <Link href="/privacy" className="text-[#FF5500] font-semibold hover:underline">
                  Privacy Policy
                </Link>
                , and{' '}
                <span className="text-slate-900 font-semibold">
                  Community Food Safety Guidelines
                </span>
                .
              </span>
            </label>
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
