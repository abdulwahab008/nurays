'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { SocialProof } from '@/lib/native-shell';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorCode, apiErrorDetails } from '@/lib/api-client';
import { BrandLockup } from '@/components/ui/Mark';
import { useT } from '@/lib/i18n';
import { useRequestErrorMessage } from '@/components/ui/LoadError';
import { authMessages } from '@/lib/i18n/messages/auth';
import { weakPasswordMessage } from '@/lib/password-errors';
import { useShallow } from 'zustand/react/shallow';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore(useShallow((s) => ({ setUser: s.setUser })));
  const { showToast } = useToast();
  const t = useT(authMessages);
  const requestError = useRequestErrorMessage();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    phone: '',
    city: '',
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

  const handleGoogleSuccess = async (proof: SocialProof) => {
    setLoading(true);
    setError('');
    
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
    } catch (err) {
      const errorMessage = requestError(err, t(proof.provider === 'apple' ? 'appleFailed' : 'googleFailed'));
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
      setError(t('passwordsNoMatch'));
      return;
    }

    if (formData.password.length < 8) {
      setError(t('passwordMin6'));
      return;
    }

    // Validate business name for sellers
    if (formData.user_type === 'seller' && !formData.business_name.trim()) {
      setError(t('errBusinessName'));
      return;
    }

    if (!formData.termsAccepted) {
      setError(t('errTerms'));
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
          showToast(t('toastSellerCreated'), 'success');
        } else if (formData.user_type === 'rider') {
          showToast(t('toastRiderSubmitted'), 'success');
        } else {
          showToast(t('toastRegistered'), 'success');
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
        throw new Error(t('errInvalidResponse'));
      }
    } catch (err) {
      const errorMessage = requestError(err, t('errRegistrationFailed'));
      const errorCode = apiErrorCode(err);
      
      // Provide more specific error messages
      const weak = weakPasswordMessage(err, t);
      if (weak) {
        setError(weak);
      } else if (errorCode === 'EMAIL_EXISTS' || errorMessage.includes('already registered')) {
        setError(t('errEmailExists'));
      } else if (errorCode === 'PHONE_EXISTS' || errorMessage.includes('Phone number already')) {
        setError(t('errPhoneExists'));
      } else if (errorCode === 'VALIDATION_ERROR') {
        const validationErrors = apiErrorDetails(err);
        if (validationErrors && Array.isArray(validationErrors)) {
          setError((validationErrors as Array<{ message?: string }>).map((e) => e.message).join(', '));
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
  const labelClass = 'text-sm font-bold text-ink block mb-1.5';
  const helperClass = 'text-xs mt-1.5 text-muted';
  const helperStyle = {} as const;

  return (
    <div className="min-h-screen flex items-center justify-center py-8 sm:py-12 px-4 bg-page">
      <div className="nuray-w-card-md sm:bg-surface sm:rounded-[24px] sm:p-10 sm:border sm:border-line">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <BrandLockup markSize={36} wordSize={26} />
          </Link>
          <h1 className="text-[28px] sm:text-[32px] leading-tight font-extrabold text-ink mt-6 tracking-tight">
            {t('createYourAccount')}
          </h1>
          <p className="mt-1.5 text-[15px] text-muted">
            {t('registerSubtitle')}
          </p>
        </div>

        {/* User Type Selection */}
        <div className="mb-6">
          <label className={labelClass}>{t('iWantTo')}</label>
          <div role="group" className="grid grid-cols-3 gap-1 p-1 rounded-[14px] bg-raised">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, user_type: 'customer' })}
              aria-pressed={formData.user_type === 'customer'}
              className={`h-11 rounded-[11px] text-sm transition-all ${
                formData.user_type === 'customer'
                  ? 'bg-surface text-ink font-extrabold shadow-xs'
                  : 'text-muted font-bold hover:text-ink'
              }`}
            >
              {t('orderFood')}
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, user_type: 'seller' })}
              aria-pressed={formData.user_type === 'seller'}
              className={`h-11 rounded-[11px] text-sm transition-all ${
                formData.user_type === 'seller'
                  ? 'bg-surface text-ink font-extrabold shadow-xs'
                  : 'text-muted font-bold hover:text-ink'
              }`}
            >
              {t('cookAndSell')}
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, user_type: 'rider' })}
              aria-pressed={formData.user_type === 'rider'}
              className={`h-11 rounded-[11px] text-sm transition-all ${
                formData.user_type === 'rider'
                  ? 'bg-surface text-ink font-extrabold shadow-xs'
                  : 'text-muted font-bold hover:text-ink'
              }`}
            >
              {t('deliverRide')}
            </button>
          </div>
          {formData.user_type === 'seller' && (
            <div className="mt-3 p-4 rounded-2xl bg-accent-soft text-accent-soft-ink">
              <p className="text-sm">
                <strong className="font-semibold">{t('sellerRegistration')}</strong> {t('sellerRegistrationBody')}
              </p>
              <ul className="text-sm mt-2 ms-4 list-disc">
                <li>{t('sellerStep1')}</li>
                <li>{t('sellerStep2')}</li>
                <li>{t('sellerStep3')}</li>
              </ul>
            </div>
          )}
          {formData.user_type === 'rider' && (
            <div className="mt-3 p-4 rounded-2xl bg-accent-soft text-accent-soft-ink">
              <p className="text-sm">
                <strong className="font-semibold">{t('riderApplication')}</strong> {t('riderApplicationBody')}
              </p>
              <ul className="text-sm mt-2 ms-4 list-disc">
                <li>{t('riderStep1')}</li>
                <li>{t('riderStep2')}</li>
                <li>{t('riderStep3')}</li>
              </ul>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister}>
          <div className="mb-4">
            <label htmlFor="email" className={labelClass}>
              {t('emailRequired')}
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="your@email.com"
              dir="ltr"
              required
              className={inputClass}
              style={inputStyle}
            />
            <p className={helperClass} style={helperStyle}>
              {t('emailHelper')}
            </p>
          </div>

          <div className="mb-4">
            <label htmlFor="password" className={labelClass}>
              {t('passwordRequired')}
            </label>
            <input
              type="password"
              id="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={t('atLeast6')}
              required
              minLength={8}
              className={inputClass}
              style={inputStyle}
            />
            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-1 flex-1 rounded-full transition-colors"
                style={{
                  background:
                    formData.password.length >= 8
                      ? '#41DAC7'
                      : formData.password.length > 0
                      ? '#FFC83D'
                      : 'var(--border-rule)',
                }}
              />
              <span className={helperClass} style={helperStyle}>{formData.password.length}/8</span>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="confirmPassword" className={labelClass}>
              {t('confirmPasswordRequired')}
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder={t('confirmYourPassword')}
              required
              minLength={8}
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="full_name" className={labelClass}>
              {t('fullNameRequired')}
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
                {t('businessNameRequired')}
              </label>
              <input
                type="text"
                id="business_name"
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                placeholder={t('businessNamePlaceholder')}
                required
                className={inputClass}
              style={inputStyle}
              />
              <p className={helperClass} style={helperStyle}>
                {t('businessNameHelper')}
              </p>
            </div>
          )}

          <div className="mb-4">
            <label htmlFor="phone" className={labelClass}>
              {t('phoneNumber')} <span className="text-muted text-xs">{t('optionalRecommended')}</span>
            </label>
            <input
              type="tel"
              id="phone"
              value={formData.phone}
              onChange={(e) => {
                // A code was issued for the old number: it means nothing for the new one.
                setFormData({ ...formData, phone: e.target.value });
                if (phoneOtpSent || phoneOtp || phoneOtpMessage) {
                  setPhoneOtp('');
                  setPhoneOtpSent(false);
                  setPhoneOtpMessage('');
                }
              }}
              placeholder="+923001234567"
              dir="ltr"
              className={inputClass}
              style={inputStyle}
            />
            <p className={helperClass} style={helperStyle}>
              {t('phoneHelper')}
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
                      setPhoneOtpMessage(t('codeSent'));
                    } catch (err) {
                      setPhoneOtpMessage(requestError(err, t('codeSendFailed')));
                    } finally {
                      setSendingPhoneOtp(false);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-line-strong hover:bg-raised disabled:opacity-50"
                >
                  {sendingPhoneOtp ? t('sendingEllipsis') : phoneOtpSent ? t('resendCode') : t('sendVerificationCode')}
                </button>
                {phoneOtpSent && (
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('sixDigitCode')}
                    dir="ltr"
                    className="w-32 px-3 py-1.5 text-sm border border-line-strong rounded-lg"
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
              {t('city')}
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

          <div className="mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="termsAccepted"
                checked={formData.termsAccepted}
                onChange={(e) => setFormData({ ...formData, termsAccepted: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-line-strong text-brand-ink focus:ring-brand"
                required
              />
              <span className="text-xs text-muted leading-relaxed">
                {t('agreeTo')}{' '}
                <Link href="/terms" className="text-brand-ink font-semibold hover:underline">
                  {t('termsOfService')}
                </Link>
                {t('comma')}{' '}
                <Link href="/privacy" className="text-brand-ink font-semibold hover:underline">
                  {t('privacyPolicy')}
                </Link>
                {t('andWord')}{' '}
                <span className="text-ink font-semibold">
                  {t('foodSafetyGuidelines')}
                </span>
                {t('agreeSuffix')}
              </span>
            </label>
          </div>

          <Button variant="primary" type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                {t('creatingAccount')}
              </span>
            ) : (
              t('createAccount')
            )}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-3 text-xs font-semibold text-muted bg-page sm:bg-surface"
              >
                {t('orContinueWith')}
              </span>
            </div>
          </div>

          <GoogleSignInButton onSuccess={handleGoogleSuccess} text={t('continueWithGoogle')} />

          <p className="text-xs text-center mt-4 text-muted">
            {t('byCreating')}
          </p>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-muted">
            {t('haveAccount')}{' '}
            <Link href="/login" className="font-bold text-brand-ink hover:underline">
              {t('signInLink')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function RegisterFallback() {
  const t = useT(authMessages);
  return <p className="text-muted">{t('loading')}</p>;
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-page">
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-16 w-16 border-b-2 border-brand mx-auto mb-4"
            />
            <RegisterFallback />
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
