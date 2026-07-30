'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { BrandLockup, Mark } from '@/components/ui/Mark';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const { showToast } = useToast();
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [loginMethod, setLoginMethod] = useState<'otp' | 'email'>('email');
  const [step, setStep] = useState<'input' | 'verify'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          // Redirect to appropriate dashboard based on user type
          const userType = response.data.user?.userType || response.data.user?.user_type;
          if (userType === 'admin') {
            router.push('/admin/dashboard');
          } else if (userType === 'seller') {
            router.push('/sellers/dashboard');
          } else if (userType === 'rider') {
            router.push('/riders/dashboard');
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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.loginSendOtp({ phone: phoneOrEmail });
      setStep('verify');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to send OTP';
      const errorCode = err.response?.data?.error?.code;
      
      if (errorCode === 'USER_NOT_FOUND') {
        setError('No account found with this phone number. Please register first.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.loginVerifyOtp({ phone: phoneOrEmail, otp });
      apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
      setUser(response.data.user);
      
      // Redirect to appropriate dashboard based on user type
      const userType = response.data.user?.userType || response.data.user?.user_type;
      if (userType === 'admin') {
        router.push('/admin/dashboard');
      } else if (userType === 'seller') {
        router.push('/sellers/dashboard');
      } else if (userType === 'rider') {
        router.push('/riders/dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'OTP verification failed';
      const errorCode = err.response?.data?.error?.code;
      
      if (errorCode === 'INVALID_OTP' || errorMessage.includes('Invalid OTP')) {
        setError('Invalid OTP code. Please check and try again.');
      } else if (errorCode === 'OTP_EXPIRED') {
        setError('OTP has expired. Please request a new one.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.loginWithEmail(phoneOrEmail, password);
      apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
      setUser(response.data.user);
      
      // Show email verification reminder if needed
      if (response.data.requiresEmailVerification) {
        router.push('/verify-email-pending');
      } else {
        // Redirect to appropriate dashboard based on user type
        const userType = response.data.user?.userType || response.data.user?.user_type;
        if (userType === 'admin') {
          router.push('/admin/dashboard');
        } else if (userType === 'seller') {
          router.push('/sellers/dashboard');
        } else if (userType === 'rider') {
          router.push('/riders/dashboard');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Login failed';
      const errorCode = err.response?.data?.error?.code;
      
      // Provide more specific error messages
      if (errorCode === 'INVALID_CREDENTIALS' || errorMessage.includes('Invalid email or password')) {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else if (errorCode === 'USER_NOT_FOUND') {
        setError('No account found with this email. Please register first.');
      } else if (errorCode === 'PASSWORD_NOT_SET') {
        setError('Password not set for this account. Please use OTP login or reset your password.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };


  const tabBase = 'flex-1 h-11 rounded-full font-medium transition-colors';
  const tabActive: React.CSSProperties = { background: 'var(--forest-500)', color: 'var(--cream-50)', fontSize: 13 };
  const tabInactive: React.CSSProperties = { background: 'transparent', color: 'var(--ink-700)', fontSize: 13 };
  const inputClass = 'nuray-input';
  const inputStyle: React.CSSProperties = {};
  const labelClass = 'eyebrow block mb-2';

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 nuray-bg-cream">
      <div className="nuray-w-card-sm nuray-card p-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <BrandLockup markSize={44} wordSize={32} />
          </Link>
          <h1 className="font-display mt-6 text-[40px]" style={{ color: 'var(--ink-900)' }}>
            Welcome back.
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-500)' }}>
            Sign in to your kitchen.
          </p>
        </div>

        {/* Login Method Toggle */}
        <div className="flex gap-1 mb-6 p-1 rounded-full" style={{ background: 'var(--cream-100)' }}>
          <button
            type="button"
            onClick={() => {
              setLoginMethod('otp');
              setStep('input');
              setError('');
            }}
            className={tabBase}
            style={loginMethod === 'otp' ? tabActive : tabInactive}
          >
            OTP
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginMethod('email');
              setStep('input');
              setError('');
            }}
            className={tabBase}
            style={loginMethod === 'email' ? tabActive : tabInactive}
          >
            Email
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm"
               style={{ background: 'var(--anar-50)', border: '1px solid var(--anar-200)', color: 'var(--anar-700)' }}>
            {error}
          </div>
        )}

        {loginMethod === 'otp' ? (
          step === 'input' ? (
            <form onSubmit={handleSendOtp}>
              <div className="mb-4">
                <label htmlFor="phone" className={labelClass}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={phoneOrEmail}
                  onChange={(e) => setPhoneOrEmail(e.target.value)}
                  placeholder="+923001234567"
                  required
                  className={inputClass}
                style={inputStyle}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send OTP'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <div className="mb-4">
                <label htmlFor="otp" className={labelClass}>
                  Enter OTP
                </label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  className={`${inputClass} text-center text-2xl tracking-widest`}
                style={inputStyle}
                />
                <p className="text-sm text-gray-500 mt-2">
                  OTP sent to {phoneOrEmail}
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify & Login'}
              </Button>
              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-full mt-3 text-sm font-medium"
                style={{ color: 'var(--forest-600)' }}
              >
                Change Phone Number
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleEmailLogin}>
            <div className="mb-4">
              <label htmlFor="email" className={labelClass}>
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={phoneOrEmail}
                onChange={(e) => setPhoneOrEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className={inputClass}
                style={inputStyle}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full" style={{ borderTop: '1px solid var(--ink-200)' }} />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 text-[11px] uppercase tracking-[0.18em] font-medium"
                      style={{ background: 'var(--paper-0)', color: 'var(--ink-500)' }}>
                  Or continue with
                </span>
              </div>
            </div>

            <GoogleSignInButton onSuccess={handleGoogleSuccess} text="Continue with Google" />
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-sm" style={{ color: 'var(--ink-500)' }}>
            Don't have an account?{' '}
            <Link href="/register" className="font-medium" style={{ color: 'var(--forest-700)' }}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

