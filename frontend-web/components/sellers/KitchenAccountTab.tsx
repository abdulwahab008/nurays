'use client';

import { LoadError } from '@/components/ui/LoadError';
import { PersonalInfoSection } from '@/components/account/PersonalInfoSection';
import { LanguageSection } from '@/components/account/LanguageSection';
import { AppearanceSection } from '@/components/account/AppearanceSection';
import { AccountSecuritySection } from '@/components/account/AccountSecuritySection';
import { NotificationsLinkCard } from '@/components/account/NotificationsLinkCard';
import { SignOutCard } from '@/components/account/SignOutCard';
import { DangerZoneSection } from '@/components/account/DangerZoneSection';
import { useLeaveSignedOut, useOwnProfile } from '@/components/account/use-account';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { kitchenSettingsMessages } from '@/lib/i18n/messages/kitchen-settings';

/** The kitchen owner's own account on the settings page: their details, the app, security, and leaving. */
export function KitchenAccountTab() {
  const t = useT(kitchenSettingsMessages);
  const ta = useT(accountMessages);
  const { profile, setProfile, error, reload } = useOwnProfile();
  const leave = useLeaveSignedOut();

  return (
    <div className="mt-5 space-y-6">
      {profile ? (
        <PersonalInfoSection profile={profile} onReload={reload} onSaved={setProfile} showLocation={false} />
      ) : error ? (
        <LoadError error={error} onRetry={reload} title={t('accountLoadFailed')} />
      ) : (
        <div className="h-40 rounded-[20px] bg-raised animate-pulse" />
      )}
      <LanguageSection />
      <AppearanceSection note={ta('appearanceLightOnly')} />
      <NotificationsLinkCard />
      {profile && <AccountSecuritySection profile={profile} />}
      <SignOutCard onSignOut={leave} />
      <DangerZoneSection onClosed={leave} />
    </div>
  );
}
