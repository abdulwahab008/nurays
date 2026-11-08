'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Mail, MapPin, Pencil, Phone, User } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { apiErrorCode, apiErrorMessage } from '@/lib/api-client';
import { authService } from '@/lib/services/auth.service';
import { userProfileService, type Address, type UserProfile } from '@/lib/services/user-profile.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { formatPhoneNumber } from '@/lib/utils';
import { useT, useLocale } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { accountMessages } from '@/lib/i18n/messages/account';

const formFrom = (profile: UserProfile) => ({
  fullName: profile.profile?.fullName || '',
  email: profile.email || '',
  city: profile.profile?.city || '',
  area: profile.profile?.area || '',
  languagePreference: profile.profile?.languagePreference || 'en',
});

interface PersonalInfoSectionProps {
  profile: UserProfile;
  /** Read the profile again from the server (after a phone is verified, or an edit is cancelled). */
  onReload: () => void;
  onSaved: (profile: UserProfile) => void;
  /** The customer's delivery area and a link to their saved addresses; kitchens and riders keep theirs elsewhere. */
  showLocation?: boolean;
  defaultAddress?: Address | null;
}

/** Name, e-mail, phone (verified by a code) and city: the details every account has, shown and edited in place. */
export function PersonalInfoSection({ profile, onReload, onSaved, showLocation = true, defaultAddress = null }: PersonalInfoSectionProps) {
  const t = useT(accountMessages);
  const tc = useT(commonMessages);
  const { locale } = useLocale();
  const { showToast } = useToast();
  const { ask: askDialog } = useDialogs();
  const { user, setUser } = useAuthStore(useShallow((s) => ({ user: s.user, setUser: s.setUser })));
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(() => formFrom(profile));
  // Phone verification: a number only counts (for OTP login) once its owner has proven it.
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);

  useEffect(() => {
    setFormData(formFrom(profile));
  }, [profile]);

  // Switching the language (here or in the header) already saved it to the profile: the form follows, so saving the
  // other details does not put the old language back.
  useEffect(() => {
    setFormData((prev) => (prev.languagePreference === locale ? prev : { ...prev, languagePreference: locale }));
  }, [locale]);

  const hasRealPhone = !!profile.phone && !profile.phone.startsWith('+999');

  const sendPhoneCode = async () => {
    const number = (phoneInput || (hasRealPhone ? profile.phone : '')).trim();
    if (number.length < 10) {
      showToast(t('enterValidPhone'), 'error');
      return;
    }
    setPhoneBusy(true);
    try {
      await authService.requestPhoneVerification(number);
      setPhoneInput(number);
      setPhoneCodeSent(true);
      showToast(t('codeSent'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, t('codeSendFailed')), 'error');
    } finally {
      setPhoneBusy(false);
    }
  };

  const confirmPhoneCode = async () => {
    setPhoneBusy(true);
    try {
      await authService.verifyPhone(phoneInput, phoneCode.trim());
      showToast(t('phoneVerified'), 'success');
      setVerifyingPhone(false);
      setPhoneCode('');
      setPhoneCodeSent(false);
      onReload();
    } catch (err) {
      showToast(apiErrorMessage(err, t('codeDidNotWork')), 'error');
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Changing the email re-points the account: the server asks for the password when there is one.
      const emailChanged = formData.email.trim().toLowerCase() !== (profile.email || '').toLowerCase();
      const { fullName, email, languagePreference } = formData;
      const payload = showLocation ? formData : { fullName, email, languagePreference };
      const submit = (currentPassword?: string) => userProfileService.updateProfile(currentPassword ? { ...payload, currentPassword } : payload);
      let response;
      try {
        response = await submit();
      } catch (error) {
        if (!emailChanged || apiErrorCode(error) !== 'PASSWORD_REQUIRED') throw error;
        const currentPassword = (await askDialog({ title: t('password'), message: t('emailChangePasswordPrompt'), type: 'password' }));
        if (!currentPassword) return;
        response = await submit(currentPassword);
      }
      onSaved(response.data);
      // The profile answer has no staff role or permissions: keep the signed-in user's, and take the rest from the answer.
      setUser(user ? { ...user, ...response.data } : null);
      setEditing(false);
      showToast(t('profileUpdated'), 'success');
    } catch (error) {
      showToast(apiErrorMessage(error, t('profileUpdateFailed')), 'error');
    }
  };

  return (
    <div className="bg-surface rounded-[20px] border border-line p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <User className="w-5 h-5 text-brand-ink" /> {t('personalInfo')}
          </h2>
          <p className="text-sm text-muted">{t('personalInfoDesc')}</p>
        </div>
        {!editing && (
          <Button variant="outline" onClick={() => setEditing(true)} size="sm" className="flex items-center gap-1.5">
            <Pencil className="w-4 h-4" /> {tc('edit')}
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleUpdateProfile}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                {t('fullName')}
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full px-4 py-3 border border-line rounded-xl bg-surface text-ink focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                required
                placeholder={t('enterName')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-2">{t('email')}</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-line rounded-xl bg-surface text-ink focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                placeholder={t('enterEmail')}
                dir="ltr"
              />
            </div>
            {showLocation && (
              <>
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">{t('city')}</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-3 border border-line rounded-xl bg-surface text-ink focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                    placeholder={t('cityPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">{t('area')}</label>
                  <input
                    type="text"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    className="w-full px-4 py-3 border border-line rounded-xl bg-surface text-ink focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
                    placeholder={t('areaPlaceholder')}
                  />
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-ink mb-2">
                {t('languagePreference')}
              </label>
              <select
                value={formData.languagePreference}
                onChange={(e) =>
                  setFormData({ ...formData, languagePreference: e.target.value })
                }
                className="w-full px-4 py-3 border border-line rounded-xl bg-surface text-ink focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
              >
                <option value="en">{t('langEnglish')}</option>
                <option value="ur">{t('langUrdu')}</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button type="submit" className="flex items-center gap-1.5">
              <Check className="w-4 h-4" /> {t('saveChanges')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(false);
                onReload();
              }}
            >
              {tc('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6 divide-y divide-line md:divide-y-0 border-t border-line md:border-t-0">
          <div className="py-3 md:py-0">
            <p className="text-xs text-muted mb-1">{t('phoneNumber')}</p>
            <p className="font-semibold text-ink flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted" />
              {hasRealPhone ? <span data-ltr>{formatPhoneNumber(profile.phone)}</span> : t('notProvided')}
              {hasRealPhone && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    profile.phoneVerified ? 'bg-brand-soft text-brand-soft-ink' : 'bg-accent-soft text-accent-soft-ink'
                  }`}
                >
                  {profile.phoneVerified ? t('verified') : t('notVerified')}
                </span>
              )}
            </p>
            {!(hasRealPhone && profile.phoneVerified) && !verifyingPhone && (
              <button
                type="button"
                onClick={() => {
                  setVerifyingPhone(true);
                  setPhoneInput(hasRealPhone ? profile.phone : '');
                }}
                className="mt-1 inline-flex items-center min-h-11 text-sm font-semibold text-brand-ink hover:underline"
              >
                {hasRealPhone ? t('verifyThisNumber') : t('addVerifyPhone')}
              </button>
            )}
            {verifyingPhone && (
              <div className="mt-3 space-y-2">
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+923001234567"
                  dir="ltr"
                  disabled={phoneCodeSent}
                  className="w-full h-11 px-3 text-sm border border-line-strong rounded-xl bg-surface text-ink"
                />
                {phoneCodeSent && (
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('sixDigitCode')}
                    dir="ltr"
                    className="w-full h-11 px-3 text-sm border border-line-strong rounded-xl bg-surface text-ink"
                  />
                )}
                <div className="flex gap-2">
                  {!phoneCodeSent ? (
                    <button type="button" disabled={phoneBusy} onClick={sendPhoneCode} className="min-h-11 px-4 text-sm font-semibold rounded-xl bg-brand text-on-brand disabled:opacity-50">
                      {phoneBusy ? t('sending') : t('sendCode')}
                    </button>
                  ) : (
                    <button type="button" disabled={phoneBusy || phoneCode.length !== 6} onClick={confirmPhoneCode} className="min-h-11 px-4 text-sm font-semibold rounded-xl bg-brand text-on-brand disabled:opacity-50">
                      {phoneBusy ? t('verifying') : t('verify')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setVerifyingPhone(false); setPhoneCode(''); setPhoneCodeSent(false); }}
                    className="min-h-11 px-4 text-sm font-semibold rounded-xl border border-line-strong text-ink"
                  >
                    {tc('cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="py-3 md:py-0">
            <p className="text-xs text-muted mb-1">{t('emailAddress')}</p>
            <p className="font-semibold text-ink flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted" />
              {profile.email ? <span data-ltr>{profile.email}</span> : t('notProvided')}
            </p>
          </div>
          <div className="py-3 md:py-0">
            <p className="text-xs text-muted mb-1">{t('fullName')}</p>
            <p className="font-semibold text-ink flex items-center gap-2">
              <User className="w-4 h-4 text-muted" />
              {profile.profile?.fullName || t('notSet')}
            </p>
          </div>
          {showLocation && (
            <div className="py-3 md:py-0">
              <p className="text-xs text-muted mb-1">{t('location')}</p>
              <p className="font-semibold text-ink flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted shrink-0" />
                <span className="min-w-0">
                  {defaultAddress
                    ? [defaultAddress.area, defaultAddress.city].filter(Boolean).join(', ')
                    : profile.profile?.area && profile.profile?.city
                      ? `${profile.profile.area}, ${profile.profile.city}`
                      : t('notSet')}
                </span>
              </p>
              <Link href="/profile/addresses" className="inline-flex items-center min-h-11 text-xs font-semibold text-brand-ink hover:underline">
                {defaultAddress ? t('editAddresses') : t('addAnAddress')}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
