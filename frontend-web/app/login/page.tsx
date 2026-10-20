'use client';

import { useState } from 'react';
import { homeFor } from '@/lib/utils';
import { landingAfterLogin } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorCode } from '@/lib/api-client';
import { BrandLockup } from '@/components/ui/Mark';
import { useT } from '@/lib/i18n';
import { useRequestErrorMessage } from '@/components/ui/LoadError';
import { authMessages } from '@/lib/i18n/messages/auth';
import { useShallow } from 'zustand/react/shallow';

// The one-click demo accounts live in their own file, which only a build that switches them on loads (next.config.ts sets
// NEXT_PUBLIC_DEMO_LOGIN): elsewhere the condition is a constant false, the require is dropped, and no demo e-mail address or
// password reaches the browser.
/* eslint-disable @typescript-eslint/no-require-imports */
const demo: typeof import('@/components/auth/DemoLoginPanel') | null =
  process.env.NEXT_PUBLIC_DEMO_LOGIN === 'true' ? require('@/components/auth/DemoLoginPanel') : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const SHOW_DEMO_LOGIN = demo !== null;

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore(useShallow((s) => ({ setUser: s.setUser })));
  const { showToast } = useToast();
  const t = useT(authMessages);
  const requestError = useRequestErrorMessage();
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
        
        showToast(t('googleSuccess'), 'success');
        
        if (response.data.requiresEmailVerification && !response.data.user?.emailVerified) {
          router.push('/verify-email-pending');
        } else {
          const userType = response.data.user?.userType || response.data.user?.user_type;
          router.push(landingAfterLogin(homeFor(userType)));
        }
      }
    } catch (err) {
      const errorMessage = requestError(err, t('googleFailed'));
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
    } catch (err) {
      const errorMessage = requestError(err, t('errSendOtp'));
      const errorCode = apiErrorCode(err);
      
      if (errorCode === 'USER_NOT_FOUND') {
        setError(t('errNoAccountPhone'));
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
      
      const userType = response.data.user?.userType || response.data.user?.user_type;
      router.push(landingAfterLogin(homeFor(userType)));
    } catch (err) {
      const errorMessage = requestError(err, t('errOtpFailed'));
      const errorCode = apiErrorCode(err);
      
      if (errorCode === 'ACCOUNT_SUSPENDED') {
        setError(t('errAccountSuspended'));
      } else if (errorCode === 'INVALID_OTP' || errorMessage.includes('Invalid OTP')) {
        setError(t('errInvalidOtp'));
      } else if (errorCode === 'OTP_EXPIRED') {
        setError(t('errOtpExpired'));
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
      
      if (response.data.requiresEmailVerification) {
        router.push('/verify-email-pending');
      } else {
        const userType = response.data.user?.userType || response.data.user?.user_type;
        router.push(landingAfterLogin(homeFor(userType)));
      }
    } catch (err) {
      const errorMessage = requestError(err, t('errLoginFailed'));
      const errorCode = apiErrorCode(err);
      
      if (errorCode === 'ACCOUNT_SUSPENDED') {
        setError(t('errAccountSuspended'));
      } else if (errorCode === 'INVALID_CREDENTIALS' || errorMessage.includes('Invalid email or password')) {
        setError(t('errInvalidCredentials'));
      } else if (errorCode === 'USER_NOT_FOUND') {
        setError(t('errNoAccountEmail'));
      } else if (errorCode === 'PASSWORD_NOT_SET') {
        setError(t('errPasswordNotSet'));
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const tabBase = 'flex-1 h-11 rounded-full font-bold transition-all';
  const tabActive: React.CSSProperties = { background: 'linear-gradient(135deg, #FF5500 0%, #FF2A00 100%)', color: '#FFFFFF', fontSize: 13 };
  const tabInactive: React.CSSProperties = { background: 'transparent', color: '#64748B', fontSize: 13 };
  const inputClass = 'nuray-input';
  const inputStyle: React.CSSProperties = {};
  const labelClass = 'text-xs font-black uppercase tracking-wider text-slate-500 block mb-2';

  return (
    <div className="min-h-screen py-10 px-4 bg-gradient-to-br from-slate-50 via-orange-50/20 to-slate-100 flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl bg-white rounded-3xl p-6 sm:p-10 border border-slate-200/90 shadow-2xl">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between pb-8 mb-8 border-b border-slate-100 gap-4">
          <Link href="/" className="inline-block">
            <BrandLockup markSize={40} wordSize={28} />
          </Link>
          <div className="flex items-center gap-3">
            {demo && <demo.DemoDevLink />}
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
            >
              <span>{t('newAccountSignUp')}</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Column: Quick Role Login Area (development only) */}
          {demo && (
            <demo.DemoLoginPanel
              busy={loading}
              onError={setError}
              onAutofill={(email, pw) => {
                setLoginMethod('email');
                setPhoneOrEmail(email);
                setPassword(pw);
              }}
            />
          )}

          {/* Right Column: Standard Login Form */}
          <div className={SHOW_DEMO_LOGIN ? 'lg:col-span-5 flex flex-col justify-center' : 'lg:col-span-12 max-w-md mx-auto w-full flex flex-col justify-center'}>
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                {t('welcomeBack')}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                {t('loginSubtitle')}
              </p>
            </div>

            {/* Login Method Toggle */}
            <div className="flex gap-1 mb-6 p-1 rounded-full bg-slate-100 border border-slate-200">
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
                {t('tabOtp')}
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
                {t('tabEmail')}
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-700 font-medium">
                {error}
              </div>
            )}

            {loginMethod === 'otp' ? (
              step === 'input' ? (
                <form onSubmit={handleSendOtp}>
                  <div className="mb-4">
                    <label htmlFor="phone" className={labelClass}>
                      {t('phoneNumber')}
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      value={phoneOrEmail}
                      onChange={(e) => setPhoneOrEmail(e.target.value)}
                      placeholder="+923001234567"
                      dir="ltr"
                      required
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <Button variant="primary" type="submit" className="w-full h-12 text-sm font-bold shadow-md" disabled={loading}>
                    {loading ? t('sending') : t('sendOtp')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp}>
                  <div className="mb-4">
                    <label htmlFor="otp" className={labelClass}>
                      {t('enterOtp')}
                    </label>
                    <input
                      type="text"
                      id="otp"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="123456"
                      dir="ltr"
                      maxLength={6}
                      required
                      className={`${inputClass} text-center text-2xl tracking-widest font-mono`}
                      style={inputStyle}
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      {t('otpSentTo', { phone: '\u2066' + phoneOrEmail + '\u2069' })}
                    </p>
                  </div>
                  <Button variant="primary" type="submit" className="w-full h-12 text-sm font-bold shadow-md" disabled={loading}>
                    {loading ? t('verifying') : t('verifyAndLogin')}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setStep('input')}
                    className="w-full mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700"
                  >
                    {t('changePhone')}
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleEmailLogin}>
                <div className="mb-4">
                  <label htmlFor="email" className={labelClass}>
                    {t('emailAddress')}
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={phoneOrEmail}
                    onChange={(e) => setPhoneOrEmail(e.target.value)}
                    placeholder="your@email.com"
                    dir="ltr"
                    required
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className={labelClass}>
                      {t('password')}
                    </label>
                    {demo && <demo.DemoPasswordHint />}
                  </div>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('enterPassword')}
                    required
                    className={inputClass}
                    style={inputStyle}
                  />
                  <div className="mt-1.5 text-end">
                    <Link href="/forgot-password" className="text-xs font-semibold text-slate-500 underline hover:text-slate-800">
                      {t('forgotPassword')}
                    </Link>
                  </div>
                </div>
                <Button variant="primary" type="submit" className="w-full h-12 text-sm font-bold shadow-md" disabled={loading}>
                  {loading ? t('loggingIn') : t('login')}
                </Button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 text-[11px] uppercase tracking-[0.18em] font-bold text-slate-500 bg-white">
                      {t('orContinueWith')}
                    </span>
                  </div>
                </div>

                <GoogleSignInButton onSuccess={handleGoogleSuccess} text={t('continueWithGoogle')} />
              </form>
            )}

            <div className="mt-6 text-center">
              <p className="text-xs text-slate-500">
                {t('noAccount')}{' '}
                <Link href="/register" className="font-bold text-orange-600 hover:text-orange-700">
                  {t('signUpLink')}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
