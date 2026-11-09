'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bike, ChevronRight, FileText, LifeBuoy, MapPin, Star, Wallet } from 'lucide-react';
import { DashboardLayout, RIDER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { RiderVehicleCard } from '@/components/profile/RiderVehicleCard';
import { PersonalInfoSection } from '@/components/account/PersonalInfoSection';
import { LanguageSection } from '@/components/account/LanguageSection';
import { AppearanceSection } from '@/components/account/AppearanceSection';
import { AccountSecuritySection } from '@/components/account/AccountSecuritySection';
import { NotificationsLinkCard } from '@/components/account/NotificationsLinkCard';
import { SignOutCard } from '@/components/account/SignOutCard';
import { DangerZoneSection } from '@/components/account/DangerZoneSection';
import { useLeaveSignedOut, useOwnProfile } from '@/components/account/use-account';
import { riderService, type RiderApplication, type RiderProfile } from '@/lib/services/rider.service';
import { riderDocumentRows } from '@/lib/rider-documents';
import { cn, formatDate, formatPhoneNumber, formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { riderMessages, type RiderMessageKey } from '@/lib/i18n/messages/rider';

const DOCUMENT_LABELS: Record<string, RiderMessageKey> = {
  cnic_front: 'app.cnicFront',
  cnic_back: 'app.cnicBack',
  license: 'app.license',
};

const VERIFICATION_BADGE: Record<RiderApplication['verificationStatus'], string> = {
  approved: 'bg-brand-soft text-brand-soft-ink',
  pending: 'bg-accent-soft text-accent-soft-ink',
  rejected: 'bg-red-50 text-red-700',
};

const cardClass = 'bg-surface rounded-[20px] border border-line p-6';
const headingClass = 'text-lg font-bold text-ink flex items-center gap-2';
const inlineLinkClass = 'inline-flex items-center gap-1 min-h-11 text-sm font-semibold text-brand-ink hover:underline';

/**
 * A rider's settings: who they are to Nuray (rating, verification, documents, work area, cash limit), their vehicle,
 * the app, and their account. Only what the rider endpoints already return is shown: there is no hub or payout account
 * here because no endpoint gives the rider theirs.
 */
export default function RiderSettingsPage() {
  const t = useT(riderMessages);
  const ta = useT(accountMessages);
  const leave = useLeaveSignedOut();
  const { profile, setProfile, error: profileError, reload: reloadProfile } = useOwnProfile();
  const [application, setApplication] = useState<RiderApplication | null>(null);
  const [applicationError, setApplicationError] = useState<unknown>(null);
  // Rating and deliveries come from GET /riders/me, which answers only an approved, active rider.
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [cash, setCash] = useState<{ held: number; limit: number } | null>(null);
  const [cashError, setCashError] = useState<unknown>(null);

  const loadApplication = useCallback(async () => {
    setApplicationError(null);
    try {
      setApplication(await riderService.getApplication());
    } catch (err) {
      setApplicationError(err);
    }
  }, []);

  const loadCash = useCallback(async () => {
    setCashError(null);
    try {
      const earnings = await riderService.getEarnings(1);
      setCash({ held: earnings.cashHeld, limit: earnings.cashLimit });
    } catch (err) {
      setCashError(err);
    }
  }, []);

  useEffect(() => {
    void loadApplication();
    void loadCash();
    riderService
      .getRiderProfile()
      .then((res) => setRider(res.data ?? null))
      .catch(() => setRider(null));
  }, [loadApplication, loadCash]);

  const loadError = profileError ?? applicationError;
  const retry = () => {
    if (profileError) void reloadProfile();
    if (applicationError) void loadApplication();
  };

  return (
    <DashboardLayout title={t('settings.title')} subtitle={t('settings.subtitle')} sidebarItems={RIDER_SIDEBAR_ITEMS} userType="rider">
      <div className="max-w-3xl mx-auto space-y-6 pb-16" data-testid="rider-settings">
        {loadError ? (
          <LoadError error={loadError} onRetry={retry} title={t('settings.loadFailed')} />
        ) : !profile || !application ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted" role="status">
            <span className="h-5 w-5 rounded-full border-2 border-line-strong border-t-brand-600 motion-safe:animate-spin" aria-hidden="true" />
            {t('settings.loading')}
          </div>
        ) : (
          <>
            <SummaryCard profileName={profile.profile?.fullName} phone={profile.phone} email={profile.email} application={application} rider={rider} />
            <PersonalInfoSection profile={profile} onReload={reloadProfile} onSaved={setProfile} showLocation={false} />
            <RiderVehicleCard />
            <DocumentsCard application={application} />
            <section className={cardClass} aria-labelledby="rider-work-area">
              <h2 id="rider-work-area" className={headingClass}>
                <MapPin className="w-5 h-5 text-brand-ink" aria-hidden /> {t('settings.workArea')}
              </h2>
              <p className="text-sm text-muted">{t('settings.workAreaDesc')}</p>
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-xs text-muted mb-1">{t('app.city')}</p>
                <p className="font-semibold text-ink">{application.city && application.city !== 'Unspecified' ? application.city : t('notSet')}</p>
              </div>
              <p className="mt-3 text-sm text-muted">{t('settings.workAreaChange')}</p>
              <Link href="/support" className={inlineLinkClass}>
                <LifeBuoy className="w-4 h-4" aria-hidden /> {t('settings.contactSupport')}
              </Link>
            </section>
            <CashCard cash={cash} error={cashError} onRetry={loadCash} />
            <LanguageSection />
            <AppearanceSection note={ta('appearanceLightOnly')} />
            <NotificationsLinkCard />
            <AccountSecuritySection profile={profile} />
            <SignOutCard onSignOut={leave} />
            <DangerZoneSection onClosed={leave} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function SummaryCard({
  profileName,
  phone,
  email,
  application,
  rider,
}: {
  profileName?: string;
  phone: string;
  email?: string;
  application: RiderApplication;
  rider: RiderProfile | null;
}) {
  const t = useT(riderMessages);
  const name = profileName || rider?.name || null;
  const realPhone = phone && !phone.startsWith('+999') ? phone : null;
  const status = application.verificationStatus;
  return (
    <section className={cardClass} aria-labelledby="rider-summary" data-testid="rider-summary">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 shrink-0 rounded-full bg-brand flex items-center justify-center text-2xl font-extrabold text-on-brand" aria-hidden>
          {name?.charAt(0).toUpperCase() || <Bike className="w-6 h-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="rider-summary" className="text-xl font-extrabold text-ink truncate">{name || t('nameNotSet')}</h2>
          {realPhone && <p className="text-sm text-muted truncate"><span data-ltr>{formatPhoneNumber(realPhone)}</span></p>}
          {email && <p className="text-sm text-muted truncate"><span data-ltr>{email}</span></p>}
        </div>
      </div>

      <dl className={cn('mt-5 grid gap-3', rider ? 'grid-cols-3' : 'grid-cols-1')}>
        {rider && (
          <>
            <div className="rounded-xl bg-raised p-3">
              <dt className="text-xs text-muted">{t('settings.rating')}</dt>
              <dd className="mt-1 font-semibold text-ink flex items-center gap-1 tabular-nums">
                {rider.ratingAverage > 0 ? (
                  <>
                    <Star className="w-4 h-4 text-accent-soft-ink" aria-hidden /> {rider.ratingAverage.toFixed(1)}
                  </>
                ) : (
                  <span className="text-sm font-medium text-muted">{t('settings.noRating')}</span>
                )}
              </dd>
            </div>
            <div className="rounded-xl bg-raised p-3">
              <dt className="text-xs text-muted">{t('settings.deliveries')}</dt>
              <dd className="mt-1 font-semibold text-ink tabular-nums">{rider.totalDeliveries}</dd>
            </div>
          </>
        )}
        <div className="rounded-xl bg-raised p-3">
          <dt className="text-xs text-muted">{t('settings.verification')}</dt>
          <dd className="mt-1">
            <span className={cn('inline-block text-xs font-bold px-2 py-0.5 rounded-full', VERIFICATION_BADGE[status])} data-testid="rider-verification">
              {t(`verification.${status}`)}
            </span>
          </dd>
        </div>
      </dl>

      {status === 'rejected' && application.rejectionReason && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {t('settings.rejectedReason', { reason: application.rejectionReason })}
        </p>
      )}
      {status === 'approved' && application.status !== 'active' && (
        <p className="mt-4 rounded-xl bg-accent-soft p-3 text-sm text-accent-soft-ink">{t('settings.suspended')}</p>
      )}
      {status !== 'approved' && (
        <Link href="/riders/dashboard" className={cn(inlineLinkClass, 'mt-2')}>
          {t('settings.openApplication')} <ChevronRight className="rtl:-scale-x-100 w-4 h-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}

function DocumentsCard({ application }: { application: RiderApplication }) {
  const t = useT(riderMessages);
  const rows = riderDocumentRows(application.documents);
  return (
    <section className={cardClass} aria-labelledby="rider-documents" data-testid="rider-documents">
      <h2 id="rider-documents" className={headingClass}>
        <FileText className="w-5 h-5 text-brand-ink" aria-hidden /> {t('settings.documents')}
      </h2>
      <p className="text-sm text-muted">{t('settings.documentsDesc')}</p>
      <ul className="mt-4 divide-y divide-line border-t border-line">
        {rows.map(({ type, uploadedAt }) => (
          <li key={type} className="flex items-center justify-between gap-3 min-h-12 py-2">
            <span className="font-medium text-ink">{DOCUMENT_LABELS[type] ? t(DOCUMENT_LABELS[type]) : type}</span>
            <span
              className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded-full shrink-0',
                uploadedAt ? 'bg-brand-soft text-brand-soft-ink' : 'bg-accent-soft text-accent-soft-ink',
              )}
            >
              {uploadedAt ? t('settings.docSent', { date: formatDate(uploadedAt) }) : t('settings.docMissing')}
            </span>
          </li>
        ))}
      </ul>
      {application.verificationStatus === 'approved' ? (
        <>
          <p className="mt-3 text-sm text-muted">{t('settings.docsChange')}</p>
          <Link href="/support" className={inlineLinkClass}>
            <LifeBuoy className="w-4 h-4" aria-hidden /> {t('settings.contactSupport')}
          </Link>
        </>
      ) : (
        <Link href="/riders/dashboard" className={cn(inlineLinkClass, 'mt-2')}>
          {t('settings.openApplication')} <ChevronRight className="rtl:-scale-x-100 w-4 h-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}

function CashCard({ cash, error, onRetry }: { cash: { held: number; limit: number } | null; error: unknown; onRetry: () => void }) {
  const t = useT(riderMessages);
  const percent = cash && cash.limit > 0 ? Math.min(100, Math.round((cash.held / cash.limit) * 100)) : 0;
  return (
    <section className={cardClass} aria-labelledby="rider-cash" data-testid="rider-cash-limit">
      <h2 id="rider-cash" className={headingClass}>
        <Wallet className="w-5 h-5 text-brand-ink" aria-hidden /> {t('settings.cash')}
      </h2>
      <p className="text-sm text-muted">{t('settings.cashDesc')}</p>
      {error ? (
        <LoadError error={error} onRetry={onRetry} title={t('settings.cashLoadFailed')} compact plain />
      ) : !cash ? (
        <div className="mt-4 h-20 rounded-xl bg-raised animate-pulse" />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-raised p-3">
              <p className="text-xs text-muted">{t('cashInHand')}</p>
              <p className="mt-1 text-lg font-semibold text-ink tabular-nums">{formatPrice(cash.held)}</p>
            </div>
            <div className="rounded-xl bg-raised p-3">
              <p className="text-xs text-muted">{t('settings.cashLimit')}</p>
              <p className="mt-1 text-lg font-semibold text-ink tabular-nums">{formatPrice(cash.limit)}</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-raised overflow-hidden" role="presentation">
            <div
              className={cn('h-full rounded-full', percent >= 100 ? 'bg-red-600' : percent > 80 ? 'bg-accent-500' : 'bg-brand-600')}
              style={{ width: `${percent}%` }}
            />
          </div>
          {percent > 80 && (
            <p className={cn('mt-2 text-xs font-medium', percent >= 100 ? 'text-red-700' : 'text-accent-soft-ink')}>
              {percent >= 100 ? t('limitReached') : t('nearLimit')}
            </p>
          )}
        </>
      )}
      <Link href="/riders/earnings" className={cn(inlineLinkClass, 'mt-2')}>
        {t('settings.cashLink')} <ChevronRight className="rtl:-scale-x-100 w-4 h-4" aria-hidden />
      </Link>
    </section>
  );
}
