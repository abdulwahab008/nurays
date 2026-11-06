'use client';

import { useState } from 'react';
import { StaffSecondStep } from '@/components/auth/StaffSecondStep';
import { homeFor } from '@/lib/utils';
import { landingAfterLogin } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { SocialProof } from '@/lib/native-shell';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorCode } from '@/lib/api-client';
import { AuthLogo, AuthSocial, PasswordInput, authColumn, authFieldError, authHeading, authHelper, authInput, authLabel, authLede, authLink, authSegment, authShell, authSubmit, focusNextOnEnter } from '@/components/auth/AuthLayout';
import { useT } from '@/lib/i18n';
import { useRequestErrorMessage } from '@/components/ui/LoadError';
import { authMessages } from '@/lib/i18n/messages/auth';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { mergeGuestTray, type GuestTrayMerge } from '@/lib/store/cart-store';
import { useShallow } from 'zustand/react/shallow';

// The one-click demo accounts live in their own file, which only a build that switches them on loads (next.config.ts sets
// NEXT_PUBLIC_DEMO_LOGIN): elsewhere the condition is a constant false, the require is dropped, and no demo e-mail address or
// password reaches the browser.
/* eslint-disable @typescript-eslint/no-require-imports */
const demo: typeof import('@/components/auth/DemoLoginPanel') | null =
  process.env.NEXT_PUBLIC_DEMO_LOGIN === 'true' ? require('@/components/auth/DemoLoginPanel') : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const SHOW_DEMO_LOGIN = demo !== null;
const LOOKS_LIKE_EMAIL = /^\S+@\S+\.\S+$/;

type LoginField = 'email' | 'password' | 'phone' | 'otp';

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
  // The field an error is about; with none, a refused sign-in marks every field of the form.
  const [errorField, setErrorField] = useState<LoginField | null>(null);
  // A staff account's password was right and its second step is next (SEC-3).
  const [staffStep, setStaffStep] = useState<{ mode: 'code' | 'setup'; challengeToken: string } | null>(null);
  const ts = useT(shellMessages);
  // A tray filled before signing in that clashes with the account's tray: the customer picks one before going on.
  const [trayChoice, setTrayChoice] = useState<(Extract<GuestTrayMerge, { kind: 'conflict' }> & { dest: string }) | null>(null);
  const [trayBusy, setTrayBusy] = useState(false);

  // A customer's dishes added while signed out go into their account's tray before they move on (to checkout, often).
  const goAfterSignIn = async (dest: string, userType?: string) => {
    if (!userType || userType === 'customer') {
      const merge = await mergeGuestTray();
      if (merge.kind === 'conflict') {
        setTrayChoice({ ...merge, dest });
        return;
      }
    }
    router.push(dest);
  };
  const chooseTray = async (keepGuest: boolean) => {
    if (!trayChoice) return;
    setTrayBusy(true);
    if (keepGuest) await trayChoice.keepGuest();
    else trayChoice.keepAccount();
    setTrayBusy(false);
    router.push(trayChoice.dest);
  };

  const handleGoogleSuccess = async (proof: SocialProof) => {
    setLoading(true);
    clearError();
    
    try {
      const response = await authService.loginWithSocial(proof);
      
      if (response && response.data) {
        if (response.data.tokens) {
          apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
        }
        
        if (response.data.user) {
          setUser(response.data.user);
        }
        
        showToast(t(proof.provider === 'apple' ? 'appleSuccess' : 'googleSuccess'), 'success');
        
        if (response.data.requiresEmailVerification && !response.data.user?.emailVerified) {
          router.push('/verify-email-pending');
        } else {
          const userType = response.data.user?.userType || response.data.user?.user_type;
          await goAfterSignIn(landingAfterLogin(homeFor(userType)), userType);
        }
      }
    } catch (err) {
      const errorMessage = requestError(err, t(proof.provider === 'apple' ? 'appleFailed' : 'googleFailed'));
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const showError = (message: string, field: LoginField | null = null) => {
    setError(message);
    setErrorField(field);
    if (field) document.getElementById(field)?.focus();
  };
  const clearError = () => {
    setError('');
    setErrorField(null);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!phoneOrEmail.trim()) return showError(t('errEnterPhone'), 'phone');
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
    clearError();
    if (!otp.trim()) return showError(t('errEnterCode'), 'otp');
    setLoading(true);

    try {
      const response = await authService.loginVerifyOtp({ phone: phoneOrEmail, otp });
      apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
      setUser(response.data.user);
      
      const userType = response.data.user?.userType || response.data.user?.user_type;
      await goAfterSignIn(landingAfterLogin(homeFor(userType)), userType);
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

  // Password sign-in, shared by the form and (in development) the demo accounts. `target` overrides where the role
  // normally lands. A staff account goes on to the two-step check before it gets tokens.
  const signInWithPassword = async (email: string, pw: string, target?: string) => {
    clearError();
    setLoading(true);
    try {
      const response = await authService.loginWithEmail(email, pw);
      const step = response.data as typeof response.data & { challengeToken?: string; twoFactorSetupRequired?: boolean };
      if (step.challengeToken) {
        setStaffStep({ mode: step.twoFactorSetupRequired ? 'setup' : 'code', challengeToken: step.challengeToken });
        return;
      }
      apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
      setUser(response.data.user);

      if (response.data.requiresEmailVerification) {
        router.push('/verify-email-pending');
      } else {
        const userType = response.data.user?.userType || response.data.user?.user_type;
        await goAfterSignIn(target ?? landingAfterLogin(homeFor(userType)), userType);
      }
    } catch (err) {
      const errorMessage = requestError(err, t('errLoginFailed'));
      const errorCode = apiErrorCode(err);

      if (errorCode === 'ACCOUNT_SUSPENDED') {
        setError(t('errAccountSuspended'));
      } else if (errorCode === 'INVALID_CREDENTIALS' || errorCode === 'VALIDATION_ERROR' || errorMessage.includes('Invalid email or password')) {
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

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!phoneOrEmail.trim()) return showError(t('errEnterEmail'), 'email');
    if (!LOOKS_LIKE_EMAIL.test(phoneOrEmail.trim())) return showError(t('errEmailInvalid'), 'email');
    if (!password) return showError(t('errEnterPassword'), 'password');
    await signInWithPassword(phoneOrEmail, password);
  };

  const errorLine = error ? (
    <p id="login-error" role="alert" className="text-sm text-red-700">
      {error}
    </p>
  ) : null;
  // An empty or malformed email or password is said under that field; a refused sign-in stays above the button.
  const fieldError = (field: 'email' | 'password') =>
    error && errorField === field ? (
      <p id="login-error" role="alert" className={authFieldError}>
        {error}
      </p>
    ) : null;
  const invalid = (field: LoginField) =>
    error && (errorField === null || errorField === field) ? { 'aria-invalid': true, 'aria-describedby': 'login-error' } : {};

  if (staffStep) {
    return (
      <main className={authShell}>
        <div className={authColumn}>
          <AuthLogo />
          <div className="mt-8">
            <StaffSecondStep
              mode={staffStep.mode}
              challengeToken={staffStep.challengeToken}
              onDone={(result) => {
                apiClient.setTokens(result.tokens.access_token, result.tokens.refresh_token);
                setUser(result.user);
                router.push(landingAfterLogin(homeFor(result.user.userType || result.user.user_type)));
              }}
              onRestart={(message) => {
                setStaffStep(null);
                setPassword('');
                setError(message);
              }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={authShell}>
      <div className={SHOW_DEMO_LOGIN ? 'mx-auto w-full max-w-sm lg:max-w-5xl' : authColumn}>
        <div className="flex items-center justify-between gap-4">
          <AuthLogo />
          {demo && <demo.DemoDevLink />}
        </div>

        <div className={SHOW_DEMO_LOGIN ? 'grid grid-cols-1 items-start gap-10 lg:mt-8 lg:grid-cols-12' : ''}>
          {/* Development builds only (see the require above). */}
          {demo && (
            <demo.DemoLoginPanel
              busy={loading}
              onFill={(email, pw) => {
                setLoginMethod('email');
                setPhoneOrEmail(email);
                setPassword(pw);
              }}
              onSignIn={(email, pw, target) => {
                setLoginMethod('email');
                setPhoneOrEmail(email);
                setPassword(pw);
                return signInWithPassword(email, pw, target);
              }}
            />
          )}

          {/* On a phone the form comes before the demo cards; on a wide screen the cards sit on the left. */}
          <div className={SHOW_DEMO_LOGIN ? 'order-first lg:order-none lg:col-span-5' : ''}>
            <h1 className={`${SHOW_DEMO_LOGIN ? 'lg:mt-0 ' : ''}mt-8 ${authHeading}`}>{t('welcomeBack')}</h1>
            <p className={authLede}>{t('loginSubtitle')}</p>

            <div role="group" aria-label={t('signInWith')} className="mt-7 grid grid-cols-2 gap-1 rounded-xl bg-raised p-1">
              {(['email', 'otp'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => {
                    setLoginMethod(method);
                    setStep('input');
                    clearError();
                  }}
                  aria-pressed={loginMethod === method}
                  className={authSegment(loginMethod === method)}
                >
                  {method === 'email' ? t('tabEmail') : t('tabOtp')}
                </button>
              ))}
            </div>

            {loginMethod === 'otp' ? (
              step === 'input' ? (
                <form onSubmit={handleSendOtp} noValidate className="mt-6 space-y-5">
                  <div>
                    <label htmlFor="phone" className={authLabel}>
                      {t('phoneNumber')}
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      value={phoneOrEmail}
                      onChange={(e) => setPhoneOrEmail(e.target.value)}
                      placeholder="03xx xxxxxxx"
                      autoComplete="tel"
                      inputMode="tel"
                      enterKeyHint="send"
                      dir="ltr"
                      required
                      className={authInput}
                      {...invalid('phone')}
                    />
                  </div>
                  {errorLine}
                  <Button type="submit" className={authSubmit} disabled={loading}>
                    {loading ? t('sendingEllipsis') : t('sendOtp')}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} noValidate className="mt-6 space-y-5">
                  <div>
                    <label htmlFor="otp" className={authLabel}>
                      {t('enterOtp')}
                    </label>
                    <input
                      type="text"
                      id="otp"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="000000"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      enterKeyHint="go"
                      dir="ltr"
                      maxLength={6}
                      required
                      autoFocus
                      aria-invalid={invalid('otp')['aria-invalid']}
                      aria-describedby={error ? 'login-error otp-sent' : 'otp-sent'}
                      className={`${authInput} font-mono text-lg tracking-[0.3em]`}
                    />
                    <p id="otp-sent" className={authHelper}>
                      {t('otpSentTo', { phone: '⁦' + phoneOrEmail + '⁩' })}
                    </p>
                  </div>
                  {errorLine}
                  <Button type="submit" className={authSubmit} disabled={loading}>
                    {loading ? t('verifying') : t('login')}
                  </Button>
                  <button type="button" onClick={() => setStep('input')} className={`${authLink} inline-flex min-h-11 items-center text-sm`}>
                    {t('changePhone')}
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleEmailLogin} noValidate className="mt-6 space-y-5">
                <div>
                  <label htmlFor="email" className={authLabel}>
                    {t('emailAddress')}
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={phoneOrEmail}
                    onChange={(e) => setPhoneOrEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="username"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="next"
                    dir="ltr"
                    required
                    className={authInput}
                    {...invalid('email')}
                    {...focusNextOnEnter('password')}
                  />
                  {fieldError('email')}
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor="password" className="text-sm font-medium text-ink">
                      {t('password')}
                    </label>
                    {/* The link keeps a 44px target without making the label row taller. */}
                    <Link href="/forgot-password" className={`${authLink} -my-3 inline-flex min-h-11 items-center text-sm`}>
                      {t('forgotPassword')}
                    </Link>
                  </div>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    required
                    showLabel={t('showPassword')}
                    hideLabel={t('hidePassword')}
                    {...invalid('password')}
                  />
                  {fieldError('password')}
                  {demo && (
                    <div className="mt-1.5">
                      <demo.DemoPasswordHint />
                    </div>
                  )}
                </div>
                {errorField !== 'email' && errorField !== 'password' && errorLine}
                <Button type="submit" className={authSubmit} disabled={loading}>
                  {loading ? t('loggingIn') : t('login')}
                </Button>
              </form>
            )}

            <AuthSocial label={t('orContinueWith')}>
              <GoogleSignInButton onSuccess={handleGoogleSuccess} text={t('continueWithGoogle')} />
            </AuthSocial>

            <p className="mt-8 text-sm text-muted">
              {t('noAccount')}{' '}
              <Link href="/register" className={authLink}>
                {t('signUpLink')}
              </Link>
            </p>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={!!trayChoice}
        title={ts('trayMergeTitle')}
        message={trayChoice ? ts('trayMergeBody', { guest: trayChoice.guestKitchen, account: trayChoice.accountKitchen }) : ''}
        confirmText={trayChoice ? ts('trayMergeUseNew', { guest: trayChoice.guestKitchen }) : ''}
        cancelText={trayChoice ? ts('trayMergeKeepOld', { account: trayChoice.accountKitchen }) : ''}
        variant="info"
        loading={trayBusy}
        onConfirm={() => void chooseTray(true)}
        onCancel={() => void chooseTray(false)}
      />
    </main>
  );
}
