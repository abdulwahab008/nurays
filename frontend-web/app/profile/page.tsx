'use client';

import { useEffect, useRef, useState } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { userProfileService, UserProfile, type Address } from '@/lib/services/user-profile.service';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useAuthStore, hasSession } from '@/lib/store/auth-store';
import { RiderVehicleCard } from '@/components/profile/RiderVehicleCard';
import { PersonalInfoSection } from '@/components/account/PersonalInfoSection';
import { LanguageSection } from '@/components/account/LanguageSection';
import { AppearanceSection } from '@/components/account/AppearanceSection';
import { AccountSecuritySection } from '@/components/account/AccountSecuritySection';
import { SignOutCard } from '@/components/account/SignOutCard';
import { DangerZoneSection } from '@/components/account/DangerZoneSection';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS, RIDER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import {
  Store,
  Bike,
  ShoppingCart,
  Camera,
  MapPin,
  BarChart3,
  Check,
  Heart,
  Wallet,
  Bell,
  LifeBuoy,
  ChevronRight,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user, logout: s.logout })));
  // Set when this page signs the person out itself (the button, or closing the account): the page is then already on its way to the
  // home page, and the "sign in to see your profile" redirect below must not send it to the sign-in page instead.
  const leaving = useRef(false);
  const leaveSignedOut = () => {
    leaving.current = true;
    logout();
    router.push('/');
  };

  const { showToast } = useToast();
  const t = useT(accountMessages);
  const roleLabel = (type?: string) => {
    const key = `role.${type || 'customer'}` as keyof typeof accountMessages.en;
    return key in accountMessages.en ? t(key) : (type as string);
  };
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Why the profile could not be read; shown instead of a blank profile ("Not provided", "Not set"), which Edit would then save.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [defaultAddress, setDefaultAddress] = useState<Address | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isRider = (user?.userType ?? user?.user_type) === 'rider';
  const sidebarItems = isRider ? RIDER_SIDEBAR_ITEMS : CUSTOMER_SIDEBAR_ITEMS;
  const layoutRole = isRider ? 'rider' : 'customer';

  // A new photo is uploaded (resized by the server), then set as the profile picture.
  const changePhoto = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append('avatar', file);
      const uploaded = await apiClient.post<{ data: { url: string } }>('/upload/avatar', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      await userProfileService.updateAvatar(uploaded.data.data.url);
      showToast(t('photoUpdated'), 'success');
      loadProfile();
    } catch (err) {
      showToast(apiErrorMessage(err, t('photoUpdateFailed')), 'error');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    setLoadError(null);
    // Where the person gets food delivered is their default address, not the city typed on the profile.
    userProfileService
      .getAddresses()
      .then((res) => setDefaultAddress(res.data.find((a) => a.isDefault) ?? res.data[0] ?? null))
      .catch(() => setDefaultAddress(null));
    try {
      const response = await userProfileService.getProfile();
      setProfile(response.data);
    } catch (error) {
      console.error('Failed to load profile:', error);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leaving.current) return;
    if (!hasSession()) {
      router.replace(loginUrlHere());
      return;
    }
    loadProfile();
  }, [isAuthenticated]);

  if (loading) {
    return (
      <DashboardLayout
        title={t('myProfile')}
        subtitle={t('manageAccount')}
        sidebarItems={sidebarItems}
        userType={layoutRole}
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto mb-4"></div>
            <p className="text-muted">{t('loadingProfile')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loadError && !profile) {
    return (
      <DashboardLayout title={t('myProfile')} subtitle={t('manageAccount')} sidebarItems={sidebarItems} userType={layoutRole}>
        <div className="max-w-xl mx-auto my-12">
          <LoadError error={loadError} onRetry={loadProfile} title={t('profileLoadFailed')} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={t('myProfile')}
      subtitle={t('manageAccountSettings')}
      sidebarItems={sidebarItems}
      userType={layoutRole}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card - Left Side */}
        <div className="lg:col-span-1">
          <div className="bg-surface rounded-[20px] border border-line overflow-hidden">
            {/* Avatar & Basic Info */}
            <div className="px-6 py-6 text-center">
              <div className="w-20 h-20 bg-surface rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden">
                {profile?.profile?.avatarUrl ? (
                  <img
                    src={profile.profile.avatarUrl}
                    alt={profile.profile.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-brand flex items-center justify-center">
                    <span className="text-3xl font-extrabold text-on-brand">
                      {profile?.profile?.fullName?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="text-xl font-extrabold text-ink mb-1">
                {profile?.profile?.fullName || t('user')}
              </h3>
              <p className="text-muted text-sm mb-4">
                {profile?.email || profile?.phone || t('role.customer')}
              </p>
              <div className="flex items-center justify-center gap-2 mb-4">
                {profile?.userType && profile.userType !== 'customer' && (
                <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                  profile?.userType === 'seller'
                    ? 'bg-accent-soft text-accent-soft-ink'
                    : profile?.userType === 'rider'
                    ? 'bg-frozen-soft text-frozen-ink'
                    : 'bg-brand-soft text-brand-soft-ink'
                }`}>
                  {profile?.userType === 'seller' ? <Store className="w-3.5 h-3.5" /> : profile?.userType === 'rider' ? <Bike className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                  <span className="capitalize">{roleLabel(profile?.userType)}</span>
                </span>
                )}
                {profile?.emailVerified && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand text-on-brand flex items-center gap-1">
                    <Check className="w-3 h-3" /> {t('verified')}
                  </span>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void changePhoto(file);
                }}
              />
              <Button
                variant="outline"
                className="w-full min-h-11"
                disabled={uploadingPhoto}
                onClick={() => photoInputRef.current?.click()}
              >
                <Camera className="w-4 h-4" /> {uploadingPhoto ? t('uploadingPhoto') : t('changePhoto')}
              </Button>
            </div>
          </div>

          {/* Everything else a customer keeps here: on a phone the tab bar has only Home, Orders, Tray and Profile. */}
          <nav aria-labelledby="quick-links" className="bg-surface rounded-[20px] border border-line p-2 mt-6">
            <h3 id="quick-links" className="sr-only">{t('quickLinks')}</h3>
            <ul className="divide-y divide-line">
              {(isRider ? [
                { href: '/riders/dashboard', icon: Bike, label: t('riderDeliveries') },
                { href: '/notifications/settings', icon: Bell, label: t('notifications') },
                { href: '/support', icon: LifeBuoy, label: t('helpSupport') },
              ] : [
                { href: '/profile/addresses', icon: MapPin, label: t('addresses') },
                { href: '/favorites', icon: Heart, label: t('savedKitchens') },
                { href: '/wallet', icon: Wallet, label: t('walletLink') },
                { href: '/notifications', icon: Bell, label: t('notifications') },
                { href: '/support', icon: LifeBuoy, label: t('helpSupport') },
                profile?.userType === 'seller'
                  ? { href: '/sellers/dashboard', icon: BarChart3, label: t('sellerDashboard') }
                  : { href: '/sellers/register', icon: Store, label: t('becomeSeller') },
              ]).map(({ href, icon: Icon, label }) => (
                <li key={href}>
                  <Link href={href} className="flex items-center gap-3 min-h-12 px-3 rounded-xl hover:bg-raised transition-colors">
                    <Icon className="w-5 h-5 text-muted shrink-0" aria-hidden />
                    <span className="flex-1 font-medium text-ink">{label}</span>
                    <ChevronRight className="rtl:-scale-x-100 w-4 h-4 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Main Content - Right Side */}
        <div className="lg:col-span-2 space-y-6">
          {profile && <PersonalInfoSection profile={profile} defaultAddress={defaultAddress} onReload={loadProfile} onSaved={setProfile} />}

          {isRider && <RiderVehicleCard />}

          <LanguageSection />

          <AppearanceSection />

          {profile && <AccountSecuritySection profile={profile} />}

          <SignOutCard onSignOut={leaveSignedOut} />

          <DangerZoneSection onClosed={leaveSignedOut} />
        </div>
      </div>
    </DashboardLayout>
  );
}
