'use client';

import { useState, useEffect } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError, useLoadFailureMessage } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import LocationMap from '@/components/ui/LocationMap';
import { Plus, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

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
    latitude: 31.4720 as number | null,
    longitude: 74.4530 as number | null,
  });

  const [newAreaInput, setNewAreaInput] = useState('');

  // Per-community delivery fees
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [showOtherCities, setShowOtherCities] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, CommunityDraft>>({});
  const [allowCrossCommunity, setAllowCrossCommunity] = useState(true);
  const [homeCommunityName, setHomeCommunityName] = useState<string | null>(null);

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
          latitude: s.latitude != null ? parseFloat(String(s.latitude)) : 31.4720,
          longitude: s.longitude != null ? parseFloat(String(s.longitude)) : 74.4530,
        });
      } else {
        throw new Error('The settings were not in the answer');
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
          setHomeCommunityName(d.homeCommunity?.name ?? null);
          setCommunitiesError(null);
        }
      } catch (err: unknown) {
        console.error('Failed to load community delivery fees:', err);
        setCommunitiesError(err);
        showToast('Could not load your per-community delivery fees, so nothing can be saved yet. Try again first.', 'error');
      }
      setSettingsRead(true);
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
      showToast('Seller access required.', 'error');
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
      showToast('Your per-community fees could not be read, so nothing was saved. Try loading them again first.', 'error');
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
          showToast(`Enter a delivery fee for ${c.name}, or switch it off.`, 'error');
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
      if (terms.some((t) => t.isEnabled) && home && !drafts[home.id]?.enabled) {
        showToast(`Switch on your own community (${home.name}) first.`, 'error');
        setSaving(false);
        return;
      }

      // Settings first: allowCrossCommunity must be saved before fees for other communities.
      const res = await apiClient.patch('/sellers/me', payload);
      if (res.data?.success) {
        const cdRes = await apiClient.put('/sellers/me/community-delivery', {
          terms: terms.some((t) => t.isEnabled) ? terms : [],
        });
        if (cdRes.data?.success) {
          const rows: CommunityRow[] = cdRes.data.data.communities;
          setCommunities(rows);
          setDrafts(Object.fromEntries(rows.map((r) => [r.id, toDraft(r)])));
        }
        showToast('Delivery settings saved.', 'success');
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

  const subtitle = 'Who takes your food to customers, where, and what they pay';

  // No form until the kitchen's own settings were read: the boxes would hold defaults, and saving them would replace the real ones.
  if (!settingsRead) {
    return (
      <DashboardLayout title="Delivery" subtitle={subtitle} sidebarItems={SELLER_SIDEBAR_ITEMS} userType="seller">
        <div className="max-w-3xl pb-16">
          {loadError ? (
            <LoadError error={loadError} onRetry={() => loadDeliverySettings()} title="We couldn't load your delivery settings" />
          ) : (
            <div className="py-16 text-center" role="status">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
              <p className="text-sm text-muted">Loading your delivery settings…</p>
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
          <span className="text-[15px] font-medium text-ink">{c.name}</span>
          <span className="text-sm text-muted">{c.city}</span>
          {c.isHome && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-ink">Your community</span>
          )}
          {!c.isHome && c.isNeighbor && (
            <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-medium text-muted">Nearby</span>
          )}
        </label>

        {d.enabled && !selfDelivery && (
          <div className="grid grid-cols-2 gap-3 pb-3 sm:ps-8" data-testid="nuray-fee-row">
            <div>
              <span className="block text-sm text-muted">Customers pay Nuray</span>
              <span className="mt-1 block text-[15px] font-semibold text-ink tabular-nums">
                {c.nurayFee == null
                  ? 'Too far for Nuray riders'
                  : c.nurayFeeIsFixed
                    ? `Rs ${c.nurayFee}, set fee`
                    : `About Rs ${c.nurayFee}, by distance`}
              </span>
            </div>
            <div>
              <label htmlFor={`${c.id}-min`} className={labelCls}>Smallest order (Rs)</label>
              <input
                id={`${c.id}-min`}
                type="number"
                min={0}
                step={50}
                placeholder="Optional"
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
              <label htmlFor={`${c.id}-fee`} className={labelCls}>Fee (Rs)</label>
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
              <label htmlFor={`${c.id}-free`} className={labelCls}>Free above (Rs)</label>
              <input
                id={`${c.id}-free`}
                type="number"
                min={0}
                step={50}
                placeholder="Optional"
                value={d.freeAbove}
                onChange={(e) => setDraft({ freeAbove: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor={`${c.id}-min`} className={labelCls}>Smallest order (Rs)</label>
              <input
                id={`${c.id}-min`}
                type="number"
                min={0}
                step={50}
                placeholder="Optional"
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

  return (
    <DashboardLayout title="Delivery" subtitle={subtitle} sidebarItems={SELLER_SIDEBAR_ITEMS} userType="seller">
      <div className="max-w-3xl">
        {Boolean(loadError) && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <span>{failureMessage(loadError)}</span>
            <button type="button" onClick={() => loadDeliverySettings()} className="min-h-11 font-semibold underline">
              Retry
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <section aria-labelledby="who-delivers">
            <h2 id="who-delivers" className="text-sm font-semibold text-ink">Who delivers your orders</h2>
            <div role="radiogroup" aria-labelledby="who-delivers" className="mt-3 grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    value: 'model_a',
                    title: 'Nuray riders',
                    body: "A Nuray rider collects the order from your kitchen. Customers pay Nuray's delivery fee.",
                  },
                  {
                    value: 'model_b',
                    title: 'I deliver myself',
                    body: 'You or your own rider take the order. You set the delivery fee and keep it.',
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
                      <span className="mt-1 block text-sm text-muted">{option.body}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="where-you-deliver" className="mt-8 border-t border-line pt-6">
            <h2 id="where-you-deliver" className="text-sm font-semibold text-ink">
              {selfDelivery ? 'Fee for each community' : 'Where you deliver'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {homeCommunityName ? `Your kitchen is in ${homeCommunityName}. ` : ''}
              {selfDelivery
                ? 'Set what you charge in each community you deliver to. Once you tick one, you only deliver to the ones ticked.'
                : 'Nuray riders charge a set fee inside your community and a fee by distance to others. Tick the communities you deliver to.'}
            </p>

            <div className="mt-4 flex items-center justify-between gap-4">
              <span>
                <span id="cross-community-label" className="block text-[15px] text-ink">Deliver outside my community</span>
                <span id="cross-community-hint" className="block text-sm text-muted">When off, only customers in your community can order delivery.</span>
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
                  ? 'No communities ticked yet, so your usual prices below apply everywhere you deliver.'
                  : 'No communities ticked yet, so Nuray riders deliver anywhere they can reach.'}
              </p>
            )}

            {communitiesError ? (
              <div className="mt-4">
                <LoadError compact error={communitiesError} onRetry={() => loadDeliverySettings(true)} title="We couldn't load your community fees" />
              </div>
            ) : communities.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No communities are available yet.</p>
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
                      {showOtherCities ? 'Hide other cities' : 'Show other cities'}
                      {otherCitiesTicked > 0 && (
                        <span className="font-normal text-muted"> ({otherCitiesTicked} ticked)</span>
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
                <h2 id="usual-prices" className="text-sm font-semibold text-ink">Your usual prices</h2>
                <p className="mt-1 text-sm text-muted">Used wherever no community fee is set.</p>

                <fieldset className="mt-4">
                  <legend className={labelCls}>How you charge</legend>
                  <div className="flex flex-wrap gap-x-6">
                    {(
                      [
                        { value: 'fixed', label: 'One fixed fee' },
                        { value: 'distance', label: 'By distance' },
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
                    <label htmlFor="deliveryFeeFixed" className={labelCls}>Delivery fee (Rs)</label>
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
                      <label htmlFor="deliveryFeeBase" className={labelCls}>Starting fee (Rs)</label>
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
                      <label htmlFor="deliveryFeePerKm" className={labelCls}>Each km (Rs)</label>
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
                    <label htmlFor="freeDeliveryRadiusKm" className={labelCls}>Free within (km)</label>
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
                    <label htmlFor="freeDeliveryThreshold" className={labelCls}>Free above (Rs)</label>
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
                    <label htmlFor="maxDeliveryDistanceKm" className={labelCls}>Furthest (km)</label>
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
                    <label htmlFor="minOrderAmountForDelivery" className={labelCls}>Smallest order (Rs)</label>
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
                <h2 id="free-areas" className="text-sm font-semibold text-ink">Free delivery areas</h2>
                <p className="mt-1 text-sm text-muted">Areas where delivery costs nothing, like your own block.</p>

                <div className="mt-4 flex gap-2">
                  <label htmlFor="newArea" className="sr-only">Area or society name</label>
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
                    placeholder="Area or society name"
                    className={`${inputCls} flex-1`}
                  />
                  <Button type="button" onClick={handleAddArea} variant="outline" className="min-h-11 px-4">
                    Add
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted">Suggestions:</span>
                  {['Askari 11', 'Askari 10', 'DHA Phase 6', 'Bedian Road', 'Gulshan-e-Iqbal', 'Clifton']
                    .filter((name) => !formData.freeDeliveryAreas.includes(name))
                    .map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleQuickAddSociety(name)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-sm text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30"
                      >
                        <Plus className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                        {name}
                      </button>
                    ))}
                </div>

                {formData.freeDeliveryAreas.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your free delivery areas">
                    {formData.freeDeliveryAreas.map((area) => (
                      <li key={area} className="inline-flex items-center gap-1 rounded-full bg-brand-soft ps-3 text-sm font-medium text-brand-soft-ink">
                        {area}
                        <button
                          type="button"
                          onClick={() => handleRemoveArea(area)}
                          aria-label={`Remove ${area}`}
                          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-brand-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="pickup-and-place" className="mt-8 border-t border-line pt-6">
                <h2 id="pickup-and-place" className="text-sm font-semibold text-ink">Pickup and kitchen location</h2>
                <label htmlFor="allowPickup" className="mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-4">
                  <span className="text-[15px] text-ink">Customers can collect from your kitchen</span>
                  <input
                    type="checkbox"
                    id="allowPickup"
                    checked={formData.allowPickup}
                    onChange={(e) => setFormData({ ...formData, allowPickup: e.target.checked })}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-brand-700"
                  />
                </label>
                <p className="mt-4 text-sm text-muted">Drag the pin to your kitchen door. The circle shows your free delivery distance.</p>
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

          <div className="sticky bottom-0 z-10 mt-8 flex justify-end border-t border-line bg-page/95 py-4 pb-[calc(1rem+var(--safe-bottom,0px))] backdrop-blur">
            <Button type="submit" disabled={saving} className="min-h-11 w-full px-6 sm:w-auto">
              {saving ? 'Saving…' : 'Save changes'}
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
