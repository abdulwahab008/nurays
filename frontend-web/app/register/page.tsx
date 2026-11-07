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
import { AuthLogo, AuthSocial, PasswordInput, authColumn, authFieldError, authHeading, authHelper, authInput, authLabel, authLede, authLink, authSegment, authShell, authSubmit, focusNextOnEnter } from '@/components/auth/AuthLayout';
import { useT } from '@/lib/i18n';
import { useRequestErrorMessage } from '@/components/ui/LoadError';
import { authMessages } from '@/lib/i18n/messages/auth';
import { weakPasswordMessage } from '@/lib/password-errors';
import { useShallow } from 'zustand/react/shallow';
import { longEnough, usesPersonalDetails } from './password-hints';

type Field = 'full_name' | 'email' | 'password' | 'confirmPassword' | 'business_name' | 'phone' | 'termsAccepted';

const ROLES = [
  { value: 'customer', label: 'orderFood' },
  { value: 'seller', label: 'cookAndSell' },
  { value: 'rider', label: 'deliverRide' },
] as const;

const LOOKS_LIKE_EMAIL = /^\S+@\S+\.\S+$/;
// iOS's strong-password suggestion follows this; the browser's own length check is off (noValidate) so the errors stay ours.
const PASSWORD_RULES = { passwordrules: 'minlength: 8;' };

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
  const [phoneOtpError, setPhoneOtpError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});

  const fail = (field: Field, message: string) => {
    setFieldErrors({ [field]: message });
    document.getElementById(field)?.focus();
  };
  const owner = { name: formData.full_name, email: formData.email, phone: formData.phone };
  const update = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field as Field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

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
            router.push('/');
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
    setFieldErrors({});

    // Every problem at once, in the order of the form; the first one gets the focus.
    const problems: Array<[Field, string]> = [];
    if (!formData.full_name.trim()) problems.push(['full_name', t('errEnterName')]);
    if (formData.user_type === 'seller' && !formData.business_name.trim()) problems.push(['business_name', t('errBusinessName')]);
    if (!formData.email.trim()) problems.push(['email', t('errEnterEmail')]);
    else if (!LOOKS_LIKE_EMAIL.test(formData.email.trim())) problems.push(['email', t('errEmailInvalid')]);
    if (!longEnough(formData.password)) problems.push(['password', t('passwordMin6')]);
    else if (usesPersonalDetails(formData.password, owner)) problems.push(['password', t('weakPasswordPersonal')]);
    if (formData.password !== formData.confirmPassword) problems.push(['confirmPassword', t('passwordsNoMatch')]);
    if (!formData.termsAccepted) problems.push(['termsAccepted', t('errTerms')]);
    if (problems.length > 0) {
      setFieldErrors(Object.fromEntries(problems));
      document.getElementById(problems[0][0])?.focus();
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
          customer: '/',
          seller: '/sellers/register',
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
          router.push('/');
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
        fail('password', weak);
      } else if (errorCode === 'EMAIL_EXISTS' || errorMessage.includes('already registered')) {
        fail('email', t('errEmailExists'));
      } else if (errorCode === 'PHONE_EXISTS' || errorMessage.includes('Phone number already')) {
        fail('phone', t('errPhoneExists'));
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

  const fieldError = (field: Field) =>
    fieldErrors[field] ? (
      <p id={`${field}-error`} role="alert" className={authFieldError}>
        {fieldErrors[field]}
      </p>
    ) : null;
  const invalid = (field: Field, describedBy?: string) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': [fieldErrors[field] ? `${field}-error` : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined,
  });
  const passwordLongEnough = longEnough(formData.password);
  const passwordPersonal = usesPersonalDetails(formData.password, owner);
  const roleNote = formData.user_type === 'seller' ? t('sellerNote') : formData.user_type === 'rider' ? t('riderNote') : '';

  return (
    <main className={authShell}>
      <div className={authColumn}>
        <AuthLogo />
        <h1 className={`mt-8 ${authHeading}`}>{t('createYourAccount')}</h1>
        <p className={authLede}>{t('registerSubtitle')}</p>

        <div className="mt-7">
          <p id="role-label" className={authLabel}>
            {t('iWantTo')}
          </p>
          <div role="group" aria-labelledby="role-label" className="grid grid-cols-3 gap-1 rounded-xl bg-raised p-1">
            {ROLES.map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => setFormData({ ...formData, user_type: role.value })}
                aria-pressed={formData.user_type === role.value}
                className={authSegment(formData.user_type === role.value)}
              >
                {t(role.label)}
              </button>
            ))}
          </div>
          {roleNote && <p className={authHelper}>{roleNote}</p>}
        </div>

        <form onSubmit={handleRegister} noValidate className="mt-6 space-y-5">
          <div>
            <label htmlFor="full_name" className={authLabel}>
              {t('fullName')}
            </label>
            <input
              type="text"
              id="full_name"
              value={formData.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              placeholder={t('namePlaceholder')}
              autoComplete="name"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              className={authInput}
              {...invalid('full_name')}
              {...focusNextOnEnter(formData.user_type === 'seller' ? 'business_name' : 'email')}
            />
            {fieldError('full_name')}
          </div>

          {formData.user_type === 'seller' && (
            <div>
              <label htmlFor="business_name" className={authLabel}>
                {t('businessName')}
              </label>
              <input
                type="text"
                id="business_name"
                value={formData.business_name}
                onChange={(e) => update('business_name', e.target.value)}
                autoComplete="organization"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                required
                className={authInput}
                {...invalid('business_name', 'business_name-help')}
                {...focusNextOnEnter('email')}
              />
              {fieldError('business_name') ?? (
                <p id="business_name-help" className={authHelper}>
                  {t('businessNameHelper')}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="email" className={authLabel}>
              {t('emailAddress')}
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
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
            <label htmlFor="password" className={authLabel}>
              {t('password')}
            </label>
            <PasswordInput
              id="password"
              value={formData.password}
              onChange={(e) => update('password', e.target.value)}
              autoComplete="new-password"
              enterKeyHint="next"
              required
              showLabel={t('showPassword')}
              hideLabel={t('hidePassword')}
              {...PASSWORD_RULES}
              {...invalid('password', 'password-rule')}
              {...focusNextOnEnter('confirmPassword')}
            />
            {fieldError('password') ?? (
              <ul id="password-rule" className={`${authHelper} space-y-1`}>
                {[
                  { ok: passwordLongEnough, text: t('passwordRule'), bad: false },
                  { ok: formData.password.length > 0 && !passwordPersonal, text: t('passwordNotPersonal'), bad: passwordPersonal },
                ].map(({ ok, text, bad }) => (
                  <li key={text} className={`flex items-center gap-1.5 ${ok ? 'text-brand-ink' : bad ? 'text-red-700' : ''}`}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={ok ? '' : 'opacity-40'}>
                      {bad ? <path d="M18 6 6 18M6 6l12 12" /> : <polyline points="20 6 9 17 4 12" />}
                    </svg>
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className={authLabel}>
              {t('confirmPassword')}
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={formData.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              autoComplete="new-password"
              enterKeyHint="next"
              required
              className={authInput}
              {...PASSWORD_RULES}
              {...invalid('confirmPassword')}
              {...focusNextOnEnter('phone')}
            />
            {fieldError('confirmPassword')}
          </div>

          <div>
            <label htmlFor="phone" className={authLabel}>
              {t('phoneNumber')} <span className="font-normal text-muted">{t('optional')}</span>
            </label>
            <input
              type="tel"
              id="phone"
              value={formData.phone}
              onChange={(e) => {
                // A code was issued for the old number: it means nothing for the new one.
                update('phone', e.target.value);
                if (phoneOtpSent || phoneOtp || phoneOtpError) {
                  setPhoneOtp('');
                  setPhoneOtpSent(false);
                  setPhoneOtpError('');
                }
              }}
              placeholder="03xx xxxxxxx"
              autoComplete="tel"
              inputMode="tel"
              enterKeyHint="next"
              dir="ltr"
              className={authInput}
              {...invalid('phone', phoneOtpError ? 'phone-otp-error' : 'phone-help')}
              {...focusNextOnEnter('city')}
            />
            {fieldError('phone') ??
              (phoneOtpError ? (
                <p id="phone-otp-error" role="alert" className={authFieldError}>
                  {phoneOtpError}
                </p>
              ) : (
                <p id="phone-help" className={authHelper}>
                  {phoneOtpSent ? t('codeSent') : t('phoneHelper')}
                </p>
              ))}
            {formData.phone.trim().length >= 10 && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={sendingPhoneOtp}
                  onClick={async () => {
                    setSendingPhoneOtp(true);
                    setPhoneOtpError('');
                    try {
                      await authService.registerSendPhoneOtp(formData.phone.trim());
                      setPhoneOtpSent(true);
                    } catch (err) {
                      setPhoneOtpError(requestError(err, t('codeSendFailed')));
                    } finally {
                      setSendingPhoneOtp(false);
                    }
                  }}
                  className="h-11 shrink-0 px-4"
                >
                  {sendingPhoneOtp ? t('sendingEllipsis') : phoneOtpSent ? t('resendCode') : t('sendOtp')}
                </Button>
                {phoneOtpSent && (
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    enterKeyHint="next"
                    maxLength={6}
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('sixDigitCode')}
                    aria-label={t('sixDigitCode')}
                    dir="ltr"
                    className={`${authInput} min-w-0 flex-1`}
                  />
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="city" className={authLabel}>
              {t('city')} <span className="font-normal text-muted">{t('optional')}</span>
            </label>
            <input
              type="text"
              id="city"
              value={formData.city}
              onChange={(e) => update('city', e.target.value)}
              placeholder={t('cityPlaceholder')}
              autoComplete="address-level2"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className={authInput}
            />
          </div>

          <div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
              <span className="relative grid shrink-0 place-items-center">
                <input
                  type="checkbox"
                  id="termsAccepted"
                  checked={formData.termsAccepted}
                  onChange={(e) => update('termsAccepted', e.target.checked)}
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-line-strong bg-surface transition-colors checked:border-brand checked:bg-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 aria-invalid:border-red-600 [:root[data-theme=dark]_&]:aria-invalid:border-[#FFB4AC]"
                  required
                  {...invalid('termsAccepted')}
                />
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute hidden text-on-brand peer-checked:block">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span className="text-sm leading-snug text-muted">
                {t('agreeTo')}{' '}
                <Link href="/terms" className={authLink}>
                  {t('termsOfService')}
                </Link>
                {t('andWord')}{' '}
                <Link href="/privacy" className={authLink}>
                  {t('privacyPolicy')}
                </Link>
                {t('agreeSuffix')}
              </span>
            </label>
            {fieldError('termsAccepted')}
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" className={authSubmit} disabled={loading}>
            {loading ? t('creatingAccount') : t('createAccount')}
          </Button>
        </form>

        <AuthSocial label={t('orContinueWith')}>
          <GoogleSignInButton onSuccess={handleGoogleSuccess} text={t('continueWithGoogle')} />
        </AuthSocial>

        <p className="mt-8 text-sm text-muted">
          {t('haveAccount')}{' '}
          <Link href="/login" className={authLink}>
            {t('signInLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}

function RegisterFallback() {
  const t = useT(authMessages);
  return <p className="text-sm text-muted">{t('loading')}</p>;
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center gap-3 bg-page">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
          <RegisterFallback />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
