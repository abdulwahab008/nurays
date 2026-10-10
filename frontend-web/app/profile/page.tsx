'use client';

import { useEffect, useState } from 'react';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { userProfileService, UserProfile } from '@/lib/services/user-profile.service';
import { formatPhoneNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { PasswordCard } from '@/components/profile/PasswordCard';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useT, useLocale, LOCALES, LOCALE_NAMES } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { accountMessages } from '@/lib/i18n/messages/account';
import {
  Store,
  Bike,
  ShoppingCart,
  Camera,
  Zap,
  MapPin,
  Package,
  BarChart3,
  User,
  Pencil,
  Phone,
  Mail,
  Lock,
  AlertTriangle,
  Check,
  ArrowRight,
  Globe,
  ShieldCheck,
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser, logout } = useAuthStore();
  const [deleting, setDeleting] = useState(false);

  // Closing the account: typed confirmation, then the password if the server asks for one.
  const handleDeleteAccount = async () => {
    if (window.prompt(t('deleteConfirmPrompt')) !== 'DELETE') return;
    const attempt = async (password?: string) => {
      await userProfileService.deleteAccount(password);
      showToast(t('accountDeleted'), 'success');
      logout();
      router.push('/');
    };
    try {
      setDeleting(true);
      try {
        await attempt();
      } catch (error: any) {
        if (error?.response?.data?.error?.code !== 'PASSWORD_REQUIRED') throw error;
        const password = window.prompt(t('deletePasswordPrompt'));
        if (!password) return;
        await attempt(password);
      }
    } catch (error: any) {
      showToast(error?.response?.data?.error?.message || error?.message || 'Could not close the account', 'error');
    } finally {
      setDeleting(false);
    }
  };
  const { showToast } = useToast();
  const t = useT(accountMessages);
  const tc = useT(commonMessages);
  const { locale, setLocale } = useLocale();
  const roleLabel = (type?: string) => {
    const key = `role.${type || 'customer'}` as keyof typeof accountMessages.en;
    return key in accountMessages.en ? t(key) : (type as string);
  };
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Phone verification: a number only counts (for OTP login) once its owner has proven it.
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    city: '',
    area: '',
    languagePreference: 'en',
  });

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.push('/login');
      return;
    }
    loadProfile();
  }, [isAuthenticated]);

  const hasRealPhone = !!profile?.phone && !profile.phone.startsWith('+999');

  const sendPhoneCode = async () => {
    const number = (phoneInput || (hasRealPhone ? profile!.phone : '')).trim();
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
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('codeSendFailed'), 'error');
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
      loadProfile();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('codeDidNotWork'), 'error');
    } finally {
      setPhoneBusy(false);
    }
  };

  // The account's e-mail address is only trusted once its owner has clicked the link sent to it.
  const sendVerificationLink = async () => {
    setSendingVerification(true);
    try {
      await authService.resendVerificationEmail();
      showToast(t('verificationEmailSent'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, t('verificationEmailFailed')), 'error');
    } finally {
      setSendingVerification(false);
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const response = await userProfileService.getProfile();
      setProfile(response.data);
      setFormData({
        fullName: response.data.profile?.fullName || '',
        email: response.data.email || '',
        city: response.data.profile?.city || '',
        area: response.data.profile?.area || '',
        languagePreference: response.data.profile?.languagePreference || 'en',
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Changing the email re-points the account: the server asks for the password when there is one.
      const emailChanged = !!profile && formData.email.trim().toLowerCase() !== (profile.email || '').toLowerCase();
      const submit = (currentPassword?: string) => userProfileService.updateProfile(currentPassword ? { ...formData, currentPassword } : formData);
      let response;
      try {
        response = await submit();
      } catch (error: any) {
        if (!emailChanged || error?.response?.data?.error?.code !== 'PASSWORD_REQUIRED') throw error;
        const currentPassword = window.prompt(t('emailChangePasswordPrompt'));
        if (!currentPassword) return;
        response = await submit(currentPassword);
      }
      setProfile(response.data);
      // The profile answer has no staff role or permissions: keep the signed-in user's, and take the rest from the answer.
      setUser(user ? { ...user, ...response.data } : null);
      setEditing(false);
      showToast(t('profileUpdated'), 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('profileUpdateFailed'), 'error');
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        title={t('myProfile')}
        subtitle={t('manageAccount')}
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t('loadingProfile')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={t('myProfile')}
      subtitle={t('manageAccountSettings')}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card - Left Side */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header Banner */}
            <div className="h-24 bg-gradient-to-r from-green-500 to-emerald-600"></div>
            
            {/* Avatar & Basic Info */}
            <div className="px-6 pb-6 -mt-12 text-center">
              <div className="w-24 h-24 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center overflow-hidden shadow-lg border-4 border-white">
                {profile?.profile?.avatarUrl ? (
                  <img
                    src={profile.profile.avatarUrl}
                    alt={profile.profile.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">
                      {profile?.profile?.fullName?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {profile?.profile?.fullName || t('user')}
              </h3>
              <p className="text-gray-500 text-sm mb-4">
                {profile?.email || profile?.phone || t('role.customer')}
              </p>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                  profile?.userType === 'seller'
                    ? 'bg-purple-100 text-purple-800'
                    : profile?.userType === 'rider'
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {profile?.userType === 'seller' ? <Store className="w-3.5 h-3.5" /> : profile?.userType === 'rider' ? <Bike className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                  <span className="capitalize">{roleLabel(profile?.userType)}</span>
                </span>
                {profile?.emailVerified && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex items-center gap-1">
                    <Check className="w-3 h-3" /> {t('verified')}
                  </span>
                )}
              </div>
              <Button variant="outline" className="w-full mb-3 flex items-center justify-center gap-2" size="sm">
                <Camera className="w-4 h-4" /> {t('changePhoto')}
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> {t('quickLinks')}
            </h3>
            <div className="space-y-2">
              <Link href="/profile/addresses" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{t('addresses')}</p>
                  <p className="text-xs text-gray-500">{t('addressesDesc')}</p>
                </div>
                <ArrowRight className="rtl:-scale-x-100 w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/orders" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
                  <Package className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{t('orderHistory')}</p>
                  <p className="text-xs text-gray-500">{t('orderHistoryDesc')}</p>
                </div>
                <ArrowRight className="rtl:-scale-x-100 w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              {profile?.userType !== 'seller' && (
                <Link href="/sellers/register" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{t('becomeSeller')}</p>
                    <p className="text-xs text-gray-500">{t('becomeSellerDesc')}</p>
                  </div>
                  <ArrowRight className="rtl:-scale-x-100 w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
              {profile?.userType === 'seller' && (
                <Link href="/sellers/dashboard" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{t('sellerDashboard')}</p>
                    <p className="text-xs text-gray-500">{t('sellerDashboardDesc')}</p>
                  </div>
                  <ArrowRight className="rtl:-scale-x-100 w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Main Content - Right Side */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-[#FF5500]" /> {t('personalInfo')}
                </h2>
                <p className="text-sm text-gray-500">{t('personalInfoDesc')}</p>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('fullName')}
                    </label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      required
                      placeholder={t('enterName')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('email')}</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder={t('enterEmail')}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('city')}</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder={t('cityPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('area')}</label>
                    <input
                      type="text"
                      value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder={t('areaPlaceholder')}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('languagePreference')}
                    </label>
                    <select
                      value={formData.languagePreference}
                      onChange={(e) =>
                        setFormData({ ...formData, languagePreference: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                    >
                      <option value="en">{t('langEnglish')}</option>
                      <option value="ur">{t('langUrdu')}</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <Button type="submit" className="bg-green-600 hover:bg-green-700 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> {t('saveChanges')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      loadProfile();
                    }}
                  >
                    {tc('cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('phoneNumber')}</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-500" />
                    {hasRealPhone ? <span data-ltr>{formatPhoneNumber(profile!.phone)}</span> : t('notProvided')}
                    {hasRealPhone && (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          profile?.phoneVerified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {profile?.phoneVerified ? t('verified') : t('notVerified')}
                      </span>
                    )}
                  </p>
                  {!(hasRealPhone && profile?.phoneVerified) && !verifyingPhone && (
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyingPhone(true);
                        setPhoneInput(hasRealPhone ? profile!.phone : '');
                      }}
                      className="mt-2 text-xs font-bold text-[#FF5500] hover:underline"
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
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
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
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                      )}
                      <div className="flex gap-2">
                        {!phoneCodeSent ? (
                          <button type="button" disabled={phoneBusy} onClick={sendPhoneCode} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white disabled:opacity-50">
                            {phoneBusy ? t('sending') : t('sendCode')}
                          </button>
                        ) : (
                          <button type="button" disabled={phoneBusy || phoneCode.length !== 6} onClick={confirmPhoneCode} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white disabled:opacity-50">
                            {phoneBusy ? t('verifying') : t('verify')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setVerifyingPhone(false); setPhoneCode(''); setPhoneCodeSent(false); }}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300"
                        >
                          {tc('cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('emailAddress')}</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    {profile?.email ? <span data-ltr>{profile.email}</span> : t('notProvided')}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('fullName')}</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    {profile?.profile?.fullName || t('notSet')}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('location')}</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-500" />
                    {profile?.profile?.area && profile?.profile?.city
                      ? `${profile.profile.area}, ${profile.profile.city}`
                      : t('notSet')}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('accountType')}</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    {profile?.userType === 'seller' ? <Store className="w-4 h-4 text-purple-600" /> : profile?.userType === 'rider' ? <Bike className="w-4 h-4 text-orange-600" /> : <ShoppingCart className="w-4 h-4 text-green-600" />}
                    <span className="capitalize">{roleLabel(profile?.userType)}</span>
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('language')}</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    {profile?.profile?.languagePreference === 'ur' ? t('langUrdu') : t('langEnglish')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Language */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6" data-testid="language-setting">
            <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600" /> {t('appLanguage')}
            </h2>
            <p className="text-sm text-gray-500 mb-4">{t('appLanguageDesc')}</p>
            <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('appLanguage')}>
              {LOCALES.map((code) => {
                const selected = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    lang={code}
                    onClick={() => setLocale(code)}
                    data-testid={`language-option-${code}`}
                    className={`flex items-center justify-between gap-2 p-4 rounded-xl border-2 text-start font-semibold transition-colors ${
                      selected
                        ? 'border-[#FF5500] bg-orange-50 text-gray-900'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span>{LOCALE_NAMES[code]}</span>
                    {selected && <Check className="w-4 h-4 text-[#FF5500]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Security & Account */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-slate-700" /> {t('accountSecurity')}
            </h2>
            <div className="space-y-3">
              <PasswordCard hasPassword={profile?.hasPassword !== false} email={profile?.email} emailVerified={!!profile?.emailVerified} />
              {profile?.email && (
                <div className="flex items-center justify-between gap-3 p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{t('emailVerification')}</p>
                      <p className="text-xs text-gray-500">
                        {profile.emailVerified ? t('emailIsVerified') : t('verifyEmailAddress')}
                      </p>
                    </div>
                  </div>
                  {!profile.emailVerified && (
                    <Button variant="outline" size="sm" className="shrink-0" disabled={sendingVerification} onClick={sendVerificationLink} data-testid="send-verification">
                      {sendingVerification ? t('sending') : t('verify')}
                    </Button>
                  )}
                  {profile.emailVerified && (
                    <span className="text-green-600 font-medium text-sm flex items-center gap-1 shrink-0">
                      <Check className="w-4 h-4" /> {t('verified')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
            <h2 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" /> {t('dangerZone')}
            </h2>
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl">
              <div>
                <p className="font-medium text-gray-900">{t('signOut')}</p>
                <p className="text-xs text-gray-500">{t('signOutDesc')}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => {
                  logout();
                  router.push('/');
                }}
              >
                {t('signOut')}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 p-4 bg-red-50 rounded-xl mt-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{t('deleteAccount')}</p>
                <p className="text-xs text-gray-500">{t('deleteAccountDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-100 shrink-0"
                data-testid="delete-account"
                disabled={deleting}
                onClick={handleDeleteAccount}
              >
                {t('deleteAccount')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

