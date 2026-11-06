'use client';

import { useState, useEffect } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/StatusPill';
import { LoadError, useLoadFailureMessage } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import LocationMap from '@/components/ui/LocationMap';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useT } from '@/lib/i18n';
import { kitchenDeliveryMessages } from '@/lib/i18n/messages/kitchen-delivery';

interface CommunityTerms {
  fee: number;
  freeAbove: number | null;
  minOrderAmount: number | null;
  isEnabled: boolean;
}

interface CommunityRow {
  id: string;
  name: string;
  city: string;
  isHome: boolean;
  isNeighbor: boolean;
  suggestedFee: number;
  /** What customers there pay when a Nuray rider delivers (null: too far for Nuray riders). */
  nurayFee: number | null;
  /** A set price (own community, or an admin's price for this pair) rather than a distance estimate. */
  nurayFeeIsFixed?: boolean;
  terms: CommunityTerms | null;
}

// Editable copy of a community's terms. Empty strings = not set.
interface CommunityDraft {
  enabled: boolean;
  fee: string;
  freeAbove: string;
  minOrder: string;
}

const toDraft = (row: CommunityRow): CommunityDraft => ({
  enabled: row.terms ? row.terms.isEnabled : false,
  fee: row.terms ? String(row.terms.fee) : '',
  freeAbove: row.terms?.freeAbove != null ? String(row.terms.freeAbove) : '',
  minOrder: row.terms?.minOrderAmount != null ? String(row.terms.minOrderAmount) : '',
});

export default function SellerDeliveryPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(kitchenDeliveryMessages);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Why the kitchen's settings could not be read. Until they were read there is no form: it would show made-up defaults, and saving them
  // would replace what the kitchen really has (its delivery model, fees and pickup).
  const [loadError, setLoadError] = useState<unknown>(null);
  const [settingsRead, setSettingsRead] = useState(false);
  // Why the per-community fees could not be read (saving without them would clear them).
  const [communitiesError, setCommunitiesError] = useState<unknown>(null);
  const failureMessage = useLoadFailureMessage();

  // Delivery Model: 'model_a' (Platform Fleet) vs 'model_b' (Seller Self-Delivery)
  const [deliveryModel, setDeliveryModel] = useState<'model_a' | 'model_b'>('model_b');

  // Form State
  const [formData, setFormData] = useState({
    deliveryFeeType: 'fixed' as 'fixed' | 'distance' | '',
    deliveryFeeFixed: 50 as number | null,
    deliveryFeeBase: 40 as number | null,
    deliveryFeePerKm: 15 as number | null,
    freeDeliveryAreas: [] as string[],
    freeDeliveryRadiusKm: 2.5 as number | null,
    freeDeliveryThreshold: 500 as number | null,
    maxDeliveryDistanceKm: 5.0 as number | null,
    minOrderAmountForDelivery: 250 as number | null,
    allowPickup: true,
    latitude: null as number | null,
    longitude: null as number | null,
  });

  const [newAreaInput, setNewAreaInput] = useState('');

  // Per-community delivery fees
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [showOtherCities, setShowOtherCities] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, CommunityDraft>>({});
  const [allowCrossCommunity, setAllowCrossCommunity] = useState(true);
  // The page as the server holds it (as loaded, or as last saved): Save changes stays quiet until something differs.
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const snapshot = JSON.stringify({ deliveryModel, formData, drafts, allowCrossCommunity });
  const changed = savedSnapshot !== '' && snapshot !== savedSnapshot;
  // Taken once the loaded (or saved) values have reached the form, so the snapshot holds them and not the defaults.
  const [snapshotDue, setSnapshotDue] = useState(false);
  useEffect(() => {
    if (!snapshotDue) return;
    setSavedSnapshot(snapshot);
    setSnapshotDue(false);
  }, [snapshotDue, snapshot]);

  const loadDeliverySettings = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setLoadError(null);
      const res = await apiClient.get('/sellers/me');
      if (res.data?.success) {
        const s = res.data.data;
        const feeType = s.deliveryFeeType || '';

        // deliveryProvider is the source of truth for who delivers; the fee
        // fields no longer imply it.
        setDeliveryModel(s.deliveryProvider === 'self' ? 'model_b' : 'model_a');

        setFormData({
          deliveryFeeType: (feeType as 'fixed' | 'distance' | '') || 'fixed',
          deliveryFeeFixed: s.deliveryFeeFixed ?? 50,
          deliveryFeeBase: s.deliveryFeeBase ?? 40,
          deliveryFeePerKm: s.deliveryFeePerKm != null ? parseFloat(String(s.deliveryFeePerKm)) : 15,
          freeDeliveryAreas: Array.isArray(s.freeDeliveryAreas) ? s.freeDeliveryAreas : [],
          freeDeliveryRadiusKm: s.freeDeliveryRadiusKm != null ? Number(s.freeDeliveryRadiusKm) : 2.5,
          freeDeliveryThreshold: s.freeDeliveryThreshold != null ? Number(s.freeDeliveryThreshold) : 500,
          maxDeliveryDistanceKm: s.maxDeliveryDistanceKm != null ? Number(s.maxDeliveryDistanceKm) : 5.0,
          minOrderAmountForDelivery: s.minOrderAmountForDelivery != null ? Number(s.minOrderAmountForDelivery) : 250,
          allowPickup: Array.isArray(s.deliveryModes) ? s.deliveryModes.includes('pickup') : true,
          // No pin is no pin: a made-up one would measure every delivery from the wrong street.
          latitude: s.latitude != null ? parseFloat(String(s.latitude)) : null,
          longitude: s.longitude != null ? parseFloat(String(s.longitude)) : null,
        });
      } else {
        throw new Error(t('notInAnswer'));
      }

      // Its own try/catch: the seller's own settings above are already on screen, and
      // a failure here must say so instead of looking like the whole page failed.
      try {
        const cd = await apiClient.get('/sellers/me/community-delivery');
        if (cd.data?.success) {
          const d = cd.data.data;
          const rows: CommunityRow[] = d.communities;
          setCommunities(rows);
          setDrafts(Object.fromEntries(rows.map((r) => [r.id, toDraft(r)])));
          setAllowCrossCommunity(d.allowCrossCommunity !== false);
          setCommunitiesError(null);
        }
      } catch (err: unknown) {
        console.error('Failed to load community delivery fees:', err);
        setCommunitiesError(err);
        showToast(t('communityLoadToast'), 'error');
      }
      setSettingsRead(true);
      setSnapshotDue(true);
    } catch (err: unknown) {
      console.error('Failed to load delivery settings:', err);
      setLoadError(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast(t('accessDenied'), 'error');
      return;
    }

    loadDeliverySettings();
  }, [isAuthenticated, user, router]);

  const handleAddArea = () => {
    const trimmed = newAreaInput.trim();
    if (!trimmed) return;
    if (formData.freeDeliveryAreas.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      setNewAreaInput('');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      freeDeliveryAreas: [...prev.freeDeliveryAreas, trimmed],
    }));
    setNewAreaInput('');
  };

  const handleRemoveArea = (areaToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      freeDeliveryAreas: prev.freeDeliveryAreas.filter((a) => a !== areaToRemove),
    }));
  };

  const handleQuickAddSociety = (societyName: string) => {
    if (formData.freeDeliveryAreas.includes(societyName)) return;
    setFormData((prev) => ({
      ...prev,
      freeDeliveryAreas: [...prev.freeDeliveryAreas, societyName],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsRead) return;
    if (communitiesError) {
      showToast(t('communityNotRead'), 'error');
      return;
    }
    setSaving(true);
    try {
      const deliveryModes = ['delivery'];
      if (formData.allowPickup) deliveryModes.push('pickup');

      let payload: Record<string, unknown> = {
        deliveryModes,
        deliveryProvider: deliveryModel === 'model_b' ? 'self' : 'platform',
        allowCrossCommunity,
        latitude: formData.latitude ?? undefined,
        longitude: formData.longitude ?? undefined,
      };

      // Platform fleet: the rider pool delivers, so there is no self-delivery
      // pricing to send. Existing fee settings are left untouched; they are the
      // fallback wherever no per-community fee applies.
      if (deliveryModel === 'model_b') {
        payload = {
          ...payload,
          deliveryFeeType: formData.deliveryFeeType || 'fixed',
          deliveryFeeFixed:
            formData.deliveryFeeType === 'fixed' && formData.deliveryFeeFixed != null
              ? Math.max(0, Math.round(Number(formData.deliveryFeeFixed)))
              : null,
          deliveryFeeBase:
            formData.deliveryFeeType === 'distance' && formData.deliveryFeeBase != null
              ? Math.max(0, Math.round(Number(formData.deliveryFeeBase)))
              : null,
          deliveryFeePerKm:
            formData.deliveryFeeType === 'distance' && formData.deliveryFeePerKm != null
              ? Math.max(0, Number(formData.deliveryFeePerKm))
              : null,
          freeDeliveryAreas: (formData.freeDeliveryAreas || [])
            .map((a) => (typeof a === 'string' ? a.trim() : ''))
            .filter((a) => a.length > 0),
          freeDeliveryRadiusKm:
            formData.freeDeliveryRadiusKm != null && !isNaN(Number(formData.freeDeliveryRadiusKm))
              ? Math.max(0, Number(formData.freeDeliveryRadiusKm))
              : null,
          freeDeliveryThreshold:
            formData.freeDeliveryThreshold != null && !isNaN(Number(formData.freeDeliveryThreshold))
              ? Math.max(0, Number(formData.freeDeliveryThreshold))
              : null,
          maxDeliveryDistanceKm:
            formData.maxDeliveryDistanceKm != null && Number(formData.maxDeliveryDistanceKm) > 0
              ? Number(formData.maxDeliveryDistanceKm)
              : null,
          minOrderAmountForDelivery:
            formData.minOrderAmountForDelivery != null && !isNaN(Number(formData.minOrderAmountForDelivery))
              ? Math.max(0, Number(formData.minOrderAmountForDelivery))
              : null,
        };
      }

      // Validate per-community terms before saving anything.
      const visible = communities.filter((c) => c.isHome || allowCrossCommunity);
      const num = (v: string) => (v.trim() === '' || isNaN(Number(v)) ? null : Math.max(0, Number(v)));
      const terms: Array<{
        communityId: string;
        fee: number;
        freeAbove: number | null;
        minOrderAmount: number | null;
        isEnabled: boolean;
      }> = [];
      for (const c of visible) {
        const d = drafts[c.id];
        if (!d) continue;
        const fee = num(d.fee);
        // With Nuray riders the fee is Nuray's; the kitchen only sets one for its own deliveries.
        if (d.enabled && fee == null && deliveryModel === 'model_b') {
          showToast(t('enterFeeFor', { name: c.name }), 'error');
          setSaving(false);
          return;
        }
        // Keep a switched-off community on record (so its fee isn't lost) only if it had terms already.
        if (d.enabled || c.terms) {
          terms.push({
            communityId: c.id,
            fee: fee ?? c.terms?.fee ?? 0,
            freeAbove: num(d.freeAbove),
            minOrderAmount: num(d.minOrder),
            isEnabled: d.enabled,
          });
        }
      }
      const home = communities.find((c) => c.isHome);
      if (terms.some((row) => row.isEnabled) && home && !drafts[home.id]?.enabled) {
        showToast(t('homeFirst', { name: home.name }), 'error');
        setSaving(false);
        return;
      }

      // Settings first: allowCrossCommunity must be saved before fees for other communities.
      const res = await apiClient.patch('/sellers/me', payload);
      if (res.data?.success) {
        const cdRes = await apiClient.put('/sellers/me/community-delivery', {
          terms: terms.some((row) => row.isEnabled) ? terms : [],
        });
        if (cdRes.data?.success) {
          const rows: CommunityRow[] = cdRes.data.data.communities;
          setCommunities(rows);
          setDrafts(Object.fromEntries(rows.map((r) => [r.id, toDraft(r)])));
        }
        setSnapshotDue(true);
        showToast(t('saved'), 'success');
      }
    } catch (err) {
      console.error('Failed to save delivery settings:', err);
      showToast(failureMessage(err), 'error');
      // The first request (settings) may have been saved before the second failed:
      // show what the server actually holds rather than the unsaved form.
      loadDeliverySettings(true);
    } finally {
      setSaving(false);
    }
  };

  const subtitle = t('subtitle');

  // No form until the kitchen's own settings were read: the boxes would hold defaults, and saving them would replace the real ones.
  if (!settingsRead) {
    return (
      <DashboardLayout title={t('title')} subtitle={subtitle} sidebarItems={SELLER_SIDEBAR_ITEMS} userType="seller">
        <div className="max-w-3xl pb-16">
          {loadError ? (
            <LoadError error={loadError} onRetry={() => loadDeliverySettings()} title={t('loadFailed')} />
          ) : (
            <div className="py-16 text-center" role="status">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
              <p className="text-sm text-muted">{t('loading')}</p>
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  const selfDelivery = deliveryModel === 'model_b';
  const visibleCommunities = [...communities]
    .filter((c) => c.isHome || allowCrossCommunity)
    .sort(
      (a, b) =>
        Number(b.isHome) - Number(a.isHome) ||
        Number(b.isNeighbor) - Number(a.isNeighbor) ||
        a.name.localeCompare(b.name)
    );
  const noneTicked = !Object.values(drafts).some((d) => d.enabled) && communities.length > 0;
  const homeCity = communities.find((c) => c.isHome)?.city;
  const homeCityCommunities = homeCity ? visibleCommunities.filter((c) => c.city === homeCity) : visibleCommunities;
  const otherCityCommunities = homeCity
    ? visibleCommunities.filter((c) => c.city !== homeCity).sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name))
    : [];
  const otherCitiesTicked = otherCityCommunities.filter((c) => drafts[c.id]?.enabled).length;

  const listCls = 'rounded-[20px] border border-line bg-surface divide-y divide-line';
  const communityRow = (c: CommunityRow) => {
    const d = drafts[c.id] ?? { enabled: false, fee: '', freeAbove: '', minOrder: '' };
    const setDraft = (patch: Partial<CommunityDraft>) =>
      setDrafts((prev) => ({ ...prev, [c.id]: { ...d, ...patch } }));
    return (
      <li key={c.id} className="px-4 py-2">
        <label className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
          <input
            type="checkbox"
            checked={d.enabled}
            onChange={(e) =>
              setDraft({
                enabled: e.target.checked,
                fee: e.target.checked && d.fee === '' ? String(c.suggestedFee) : d.fee,
              })
            }
            className="h-5 w-5 shrink-0 cursor-pointer accent-brand-700"
          />
          <bdi className="text-[15px] font-medium text-ink">{c.name}</bdi>
          <span className="text-sm text-muted">{c.city}</span>
          {c.isHome && (
            <StatusPill tone="good">{t('yourCommunity')}</StatusPill>
          )}
          {!c.isHome && c.isNeighbor && (
            <StatusPill>{t('nearby')}</StatusPill>
          )}
        </label>

        {d.enabled && !selfDelivery && (
          <div className="grid grid-cols-2 gap-3 pb-3 sm:ps-8" data-testid="nuray-fee-row">
            <div>
              <span className="block text-sm text-muted">{t('nurayFeeLabel')}</span>
              <span className="mt-1 block text-[15px] font-semibold text-ink tabular-nums">
                {c.nurayFee == null
                  ? t('tooFar')
                  : c.nurayFeeIsFixed
                    ? t('setFee', { fee: c.nurayFee })
                    : t('aboutFee', { fee: c.nurayFee })}
              </span>
            </div>
            <div>
              <label htmlFor={`${c.id}-min`} className={labelCls}>{t('smallestOrder')}</label>
              <input
                id={`${c.id}-min`}
                type="number"
                min={0}
                step={50}
                placeholder={t('optional')}
                value={d.minOrder}
                onChange={(e) => setDraft({ minOrder: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {d.enabled && selfDelivery && (
          <div className="grid grid-cols-2 gap-3 pb-3 sm:grid-cols-3 sm:ps-8">
            <div>
              <label htmlFor={`${c.id}-fee`} className={labelCls}>{t('fee')}</label>
              <input
                id={`${c.id}-fee`}
                type="number"
                min={0}
                step={10}
                value={d.fee}
                onChange={(e) => setDraft({ fee: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor={`${c.id}-free`} className={labelCls}>{t('freeAbove')}</label>
              <input
                id={`${c.id}-free`}
                type="number"
                min={0}
                step={50}
                placeholder={t('optional')}
                value={d.freeAbove}
                onChange={(e) => setDraft({ freeAbove: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor={`${c.id}-min`} className={labelCls}>{t('smallestOrder')}</label>
              <input
                id={`${c.id}-min`}
                type="number"
                min={0}
                step={50}
                placeholder={t('optional')}
                value={d.minOrder}
                onChange={(e) => setDraft({ minOrder: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        )}
      </li>
    );
  };

  const homeFee = communities.find((c) => c.isHome)?.nurayFee;

  return (
    <DashboardLayout title={t('title')} subtitle={subtitle} sidebarItems={SELLER_SIDEBAR_ITEMS} userType="seller">
      <div className="max-w-3xl">
        {Boolean(loadError) && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <span>{failureMessage(loadError)}</span>
            <button type="button" onClick={() => loadDeliverySettings()} className="min-h-11 font-semibold underline">
              {t('retry')}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <section aria-labelledby="who-delivers" className="[&:lang(ur)]:pt-2">
            <h2 id="who-delivers" className="text-sm font-semibold text-ink">{t('whoDelivers')}</h2>
            <div role="radiogroup" aria-labelledby="who-delivers" className="mt-3 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    value: 'model_a',
                    title: t('nurayRiders'),
                    body: t('nurayRiderBody'),
                  },
                  {
                    value: 'model_b',
                    title: t('selfDeliver'),
                    body: t('selfDeliverBody'),
                  },
                ] as const
              ).map((option) => {
                const selected = deliveryModel === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors focus-within:ring-3 focus-within:ring-brand/30 ${
                      selected ? 'border-brand-600 bg-brand-soft' : 'border-line bg-surface hover:border-line-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deliveryModel"
                      value={option.value}
                      checked={selected}
                      onChange={() => setDeliveryModel(option.value)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-brand-700 focus:outline-none"
                    />
                    <span>
                      <span className="block text-[15px] font-semibold text-ink">{option.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{option.body}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <details className="group mt-2">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded text-sm font-semibold text-brand-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 [&::-webkit-details-marker]:hidden">
                {t('howFeesWork')}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <dl className="mt-1 grid gap-3 rounded-xl bg-raised px-4 py-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-ink">{t('nurayRiders')}</dt>
                  <dd className="mt-0.5 text-muted">
                    {homeFee != null ? t('feesNurayHome', { fee: homeFee }) : t('feesNurayHomeSet')} {t('feesNurayPaid')}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">{t('selfDeliver')}</dt>
                  <dd className="mt-0.5 text-muted">{t('feesSelf')}</dd>
                </div>
              </dl>
            </details>
          </section>

          <section aria-labelledby="where-you-deliver" className="mt-6 border-t border-line pt-6">
            <h2 id="where-you-deliver" className="text-sm font-semibold text-ink">
              {selfDelivery ? t('feePerCommunity') : t('whereYouDeliver')}
            </h2>
            <p className="mt-1 text-sm text-muted">{selfDelivery ? t('selfCommunityHint') : t('nurayCommunityHint')}</p>

            <div className="mt-4 flex items-center justify-between gap-4">
              <span>
                <span id="cross-community-label" className="block text-[15px] text-ink">{t('crossCommunity')}</span>
                <span id="cross-community-hint" className="block text-sm text-muted">{t('crossCommunityHint')}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={allowCrossCommunity}
                aria-labelledby="cross-community-label"
                aria-describedby="cross-community-hint"
                onClick={() => setAllowCrossCommunity(!allowCrossCommunity)}
                className="w-12 min-h-11 shrink-0 flex items-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
              >
                <span aria-hidden="true" className={`relative w-12 h-7 rounded-full transition-colors ${allowCrossCommunity ? 'bg-brand-600' : 'bg-line-strong'}`}>
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] ${allowCrossCommunity ? 'start-6' : 'start-1'}`} />
                </span>
              </button>
            </div>

            {noneTicked && (
              <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-soft-ink">
                {selfDelivery
                  ? t('noneTickedSelf')
                  : t('noneTickedNuray')}
              </p>
            )}

            {communitiesError ? (
              <div className="mt-4">
                <LoadError compact error={communitiesError} onRetry={() => loadDeliverySettings(true)} title={t('communityFeesFailed')} />
              </div>
            ) : communities.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t('noCommunities')}</p>
            ) : (
              <>
                <ul className={`mt-4 ${listCls}`}>{homeCityCommunities.map(communityRow)}</ul>
                {otherCityCommunities.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-expanded={showOtherCities}
                      aria-controls="other-city-communities"
                      onClick={() => setShowOtherCities((v) => !v)}
                      className="mt-3 min-h-11 -ms-3"
                    >
                      {showOtherCities ? t('hideOtherCities') : t('showOtherCities')}
                      {otherCitiesTicked > 0 && (
                        <span className="font-normal text-muted"> {t('ticked', { count: otherCitiesTicked })}</span>
                      )}
                    </Button>
                    <ul id="other-city-communities" hidden={!showOtherCities} className={`mt-2 ${listCls}`}>
                      {otherCityCommunities.map(communityRow)}
                    </ul>
                  </>
                )}
              </>
            )}

          </section>

          {selfDelivery && (
            <>
              <section aria-labelledby="usual-prices" className="mt-8 border-t border-line pt-6">
                <h2 id="usual-prices" className="text-sm font-semibold text-ink">{t('usualPrices')}</h2>
                <p className="mt-1 text-sm text-muted">{t('usualPricesHint')}</p>

                <fieldset className="mt-4">
                  <legend className={labelCls}>{t('howYouCharge')}</legend>
                  <div className="flex flex-wrap gap-x-6">
                    {(
                      [
                        { value: 'fixed', label: t('oneFixedFee') },
                        { value: 'distance', label: t('byDistance') },
                      ] as const
                    ).map((option) => (
                      <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-ink">
                        <input
                          type="radio"
                          name="deliveryFeeType"
                          checked={formData.deliveryFeeType === option.value}
                          onChange={() => setFormData({ ...formData, deliveryFeeType: option.value })}
                          className="h-5 w-5 accent-brand-700"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {formData.deliveryFeeType === 'fixed' && (
                  <div className="mt-3 max-w-[12rem]">
                    <label htmlFor="deliveryFeeFixed" className={labelCls}>{t('deliveryFee')}</label>
                    <input
                      id="deliveryFeeFixed"
                      type="number"
                      min={0}
                      step={10}
                      placeholder="50"
                      value={formData.deliveryFeeFixed ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          deliveryFeeFixed: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                )}

                {formData.deliveryFeeType === 'distance' && (
                  <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="deliveryFeeBase" className={labelCls}>{t('startingFee')}</label>
                      <input
                        id="deliveryFeeBase"
                        type="number"
                        min={0}
                        step={10}
                        placeholder="40"
                        value={formData.deliveryFeeBase ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            deliveryFeeBase: e.target.value === '' ? null : parseInt(e.target.value, 10),
                          })
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label htmlFor="deliveryFeePerKm" className={labelCls}>{t('eachKm')}</label>
                      <input
                        id="deliveryFeePerKm"
                        type="number"
                        min={0}
                        step={1}
                        placeholder="15"
                        value={formData.deliveryFeePerKm ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            deliveryFeePerKm: e.target.value === '' ? null : parseFloat(e.target.value),
                          })
                        }
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label htmlFor="freeDeliveryRadiusKm" className={labelCls}>{t('freeWithin')}</label>
                    <input
                      id="freeDeliveryRadiusKm"
                      type="number"
                      min={0}
                      step={0.5}
                      placeholder="2.5"
                      value={formData.freeDeliveryRadiusKm ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          freeDeliveryRadiusKm: e.target.value === '' ? null : parseFloat(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="freeDeliveryThreshold" className={labelCls}>{t('freeAbove')}</label>
                    <input
                      id="freeDeliveryThreshold"
                      type="number"
                      min={0}
                      step={50}
                      placeholder="500"
                      value={formData.freeDeliveryThreshold ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          freeDeliveryThreshold: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="maxDeliveryDistanceKm" className={labelCls}>{t('furthest')}</label>
                    <input
                      id="maxDeliveryDistanceKm"
                      type="number"
                      min={0.5}
                      step={0.5}
                      placeholder="5.0"
                      value={formData.maxDeliveryDistanceKm ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxDeliveryDistanceKm: e.target.value === '' ? null : parseFloat(e.target.value),
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="minOrderAmountForDelivery" className={labelCls}>{t('smallestOrder')}</label>
                    <input
                      id="minOrderAmountForDelivery"
                      type="number"
                      min={0}
                      step={50}
                      placeholder="250"
                      value={formData.minOrderAmountForDelivery ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          minOrderAmountForDelivery: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                </div>
              </section>

              <section aria-labelledby="free-areas" className="mt-8 border-t border-line pt-6">
                <h2 id="free-areas" className="text-sm font-semibold text-ink">{t('freeAreas')}</h2>
                <p className="mt-1 text-sm text-muted">{t('freeAreasHint')}</p>

                <div className="mt-4 flex gap-2">
                  <label htmlFor="newArea" className="sr-only">{t('areaName')}</label>
                  <input
                    id="newArea"
                    type="text"
                    value={newAreaInput}
                    onChange={(e) => setNewAreaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddArea();
                      }
                    }}
                    placeholder={t('areaName')}
                    className={`${inputCls} flex-1`}
                  />
                  <Button type="button" onClick={handleAddArea} variant="outline" className="min-h-11 px-4">
                    {t('add')}
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted">{t('suggestions')}</span>
                  {['Askari 11', 'Askari 10', 'DHA Phase 6', 'Bedian Road', 'Gulshan-e-Iqbal', 'Clifton']
                    .filter((name) => !formData.freeDeliveryAreas.includes(name))
                    .map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleQuickAddSociety(name)}
                        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line px-3 text-sm text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30"
                      >
                        <Plus className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                        {name}
                      </button>
                    ))}
                </div>

                {formData.freeDeliveryAreas.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('yourFreeAreas')}>
                    {formData.freeDeliveryAreas.map((area) => (
                      <li key={area} className="inline-flex items-center gap-1 rounded-full bg-brand-soft ps-3 text-sm font-medium text-brand-soft-ink">
                        {area}
                        <button
                          type="button"
                          onClick={() => handleRemoveArea(area)}
                          aria-label={t('removeArea', { area })}
                          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="pickup-and-place" className="mt-8 border-t border-line pt-6">
                <h2 id="pickup-and-place" className="text-sm font-semibold text-ink">{t('pickupAndPlace')}</h2>
                <label htmlFor="allowPickup" className="mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-4">
                  <span className="text-[15px] text-ink">{t('allowPickup')}</span>
                  <input
                    type="checkbox"
                    id="allowPickup"
                    checked={formData.allowPickup}
                    onChange={(e) => setFormData({ ...formData, allowPickup: e.target.checked })}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-brand-700"
                  />
                </label>
                <p className="mt-4 text-sm text-muted">{t('pinHint')}</p>
                <div className="mt-3 overflow-hidden rounded-2xl border border-line">
                  <LocationMap
                    center={
                      formData.latitude != null && formData.longitude != null
                        ? { lat: formData.latitude, lng: formData.longitude }
                        : { lat: 31.4720, lng: 74.4530 }
                    }
                    markerPosition={
                      formData.latitude != null && formData.longitude != null
                        ? { lat: formData.latitude, lng: formData.longitude }
                        : null
                    }
                    radiusKm={formData.freeDeliveryRadiusKm ?? undefined}
                    onLocationSelect={({ lat, lng }) =>
                      setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }))
                    }
                    height="260px"
                    draggable={true}
                  />
                </div>
              </section>
            </>
          )}

          <div data-bottom-bar className="sticky bottom-0 z-10 mt-8 flex justify-end border-t border-line bg-page/95 py-4 pb-[calc(1rem+var(--safe-bottom,0px))] backdrop-blur">
            <Button
              type="submit"
              disabled={saving || !changed}
              className="min-h-11 w-full px-6 sm:w-auto disabled:bg-raised disabled:text-muted disabled:opacity-100"
            >
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

const labelCls = 'mb-1.5 block text-sm text-muted';
const inputCls =
  'w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink tabular-nums placeholder:text-muted/70 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand/30';
