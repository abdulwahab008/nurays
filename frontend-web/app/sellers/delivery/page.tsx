'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import LocationMap from '@/components/ui/LocationMap';
import {
  Bike,
  Store,
  MapPin,
  CheckCircle2,
  Plus,
  X,
  Navigation,
} from 'lucide-react';

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
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
  const [drafts, setDrafts] = useState<Record<string, CommunityDraft>>({});
  const [allowCrossCommunity, setAllowCrossCommunity] = useState(true);
  const [homeCommunityName, setHomeCommunityName] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Seller access required.', 'error');
      return;
    }

    loadDeliverySettings();
  }, [isAuthenticated, user, router]);

  const loadDeliverySettings = async () => {
    try {
      setLoading(true);
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
      }

      const cd = await apiClient.get('/sellers/me/community-delivery');
      if (cd.data?.success) {
        const d = cd.data.data;
        const rows: CommunityRow[] = d.communities;
        setCommunities(rows);
        setDrafts(Object.fromEntries(rows.map((r) => [r.id, toDraft(r)])));
        setAllowCrossCommunity(d.allowCrossCommunity !== false);
        setHomeCommunityName(d.homeCommunity?.name ?? null);
      }
    } catch (err: any) {
      console.error('Failed to load delivery settings:', err);
      setLoadError(err?.response?.data?.message || err?.message || 'Failed to load delivery settings');
    } finally {
      setLoading(false);
    }
  };

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
    setSaving(true);
    try {
      const deliveryModes = ['delivery'];
      if (formData.allowPickup) deliveryModes.push('pickup');

      let payload: Record<string, any> = {
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
        if (d.enabled && fee == null) {
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
        showToast(`Set a delivery fee for your own community (${home.name}) first.`, 'error');
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
        showToast('Delivery settings saved successfully.', 'success');
      }
    } catch (err: any) {
      console.error('Failed to save delivery settings:', err);
      const errMsg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save delivery settings';
      showToast(errMsg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="Delivery"
      subtitle="Fulfillment options and local delivery rates"
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-red-700">
            <span>{loadError}</span>
            <button onClick={loadDeliverySettings} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Fulfillment Model */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Fulfillment Model
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Model A */}
              <div
                onClick={() => setDeliveryModel('model_a')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  deliveryModel === 'model_a'
                    ? 'border-blue-600 bg-blue-50/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Bike className="w-5 h-5 text-blue-700" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Nuray Rider Fleet</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Platform riders pick up and deliver your orders</p>
                  </div>
                </div>
              </div>

              {/* Model B */}
              <div
                onClick={() => setDeliveryModel('model_b')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  deliveryModel === 'model_b'
                    ? 'border-emerald-600 bg-emerald-50/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <Store className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Self-Delivery</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">You deliver your own orders and keep the delivery fee; no platform rider is assigned</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Community delivery fees */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Delivery fee by community</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {homeCommunityName
                  ? `You are based in ${homeCommunityName}. `
                  : ''}
                Fix the fee you charge for each community you deliver to. Once you set fees, you only deliver to the
                communities you switch on.
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 text-xs font-medium text-slate-800 cursor-pointer">
              <span>
                Deliver to other communities
                <span className="block text-[11px] font-normal text-slate-500">
                  Off = customers outside your community can&apos;t order delivery from you.
                </span>
              </span>
              <input
                type="checkbox"
                checked={allowCrossCommunity}
                onChange={(e) => setAllowCrossCommunity(e.target.checked)}
                className="w-4 h-4 text-[#FF5500] rounded border-slate-300 focus:ring-[#FF5500] cursor-pointer"
              />
            </label>

            {communities.length === 0 ? (
              <p className="text-xs text-slate-500">No communities are available yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {[...communities]
                  .filter((c) => c.isHome || allowCrossCommunity)
                  .sort(
                    (a, b) =>
                      Number(b.isHome) - Number(a.isHome) ||
                      Number(b.isNeighbor) - Number(a.isNeighbor) ||
                      a.name.localeCompare(b.name)
                  )
                  .map((c) => {
                    const d = drafts[c.id] ?? { enabled: false, fee: '', freeAbove: '', minOrder: '' };
                    const setDraft = (patch: Partial<CommunityDraft>) =>
                      setDrafts((prev) => ({ ...prev, [c.id]: { ...d, ...patch } }));
                    return (
                      <div key={c.id} className="p-3.5 space-y-2.5">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={d.enabled}
                            onChange={(e) =>
                              setDraft({
                                enabled: e.target.checked,
                                fee: e.target.checked && d.fee === '' ? String(c.suggestedFee) : d.fee,
                              })
                            }
                            className="w-4 h-4 text-[#FF5500] rounded border-slate-300 focus:ring-[#FF5500]"
                          />
                          <span className="text-xs font-bold text-slate-900">{c.name}</span>
                          <span className="text-[11px] text-slate-400">{c.city}</span>
                          {c.isHome && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                              Your community
                            </span>
                          )}
                          {!c.isHome && c.isNeighbor && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                              Nearby
                            </span>
                          )}
                        </label>

                        {d.enabled && (
                          <div className="grid grid-cols-3 gap-2.5 pl-6">
                            <div>
                              <label className="text-[11px] text-slate-500 block mb-1">Fee (PKR)</label>
                              <input
                                type="number"
                                min={0}
                                step={10}
                                value={d.fee}
                                onChange={(e) => setDraft({ fee: e.target.value })}
                                className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-500 block mb-1">Free above (PKR)</label>
                              <input
                                type="number"
                                min={0}
                                step={50}
                                placeholder="optional"
                                value={d.freeAbove}
                                onChange={(e) => setDraft({ freeAbove: e.target.value })}
                                className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-500 block mb-1">Min order (PKR)</label>
                              <input
                                type="number"
                                min={0}
                                step={50}
                                placeholder="optional"
                                value={d.minOrder}
                                onChange={(e) => setDraft({ minOrder: e.target.value })}
                                className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {!Object.values(drafts).some((d) => d.enabled) && communities.length > 0 && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No community fees set yet. Your general delivery pricing is used until you switch on at least one
                community.
              </p>
            )}
          </div>

          {/* Model B Details */}
          {deliveryModel === 'model_b' && (
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-5">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Self-Delivery Pricing &amp; Zones (used where no community fee applies)
              </h3>

              {/* Fee Type */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-700 block">
                  Delivery Fee
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                      formData.deliveryFeeType === 'fixed'
                        ? 'border-[#FF5500] bg-orange-50/20 text-slate-900 font-semibold'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deliveryFeeType"
                      checked={formData.deliveryFeeType === 'fixed'}
                      onChange={() => setFormData({ ...formData, deliveryFeeType: 'fixed' })}
                      className="text-[#FF5500] focus:ring-[#FF5500]"
                    />
                    <span className="text-xs">Fixed Fee</span>
                  </label>

                  <label
                    className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                      formData.deliveryFeeType === 'distance'
                        ? 'border-[#FF5500] bg-orange-50/20 text-slate-900 font-semibold'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deliveryFeeType"
                      checked={formData.deliveryFeeType === 'distance'}
                      onChange={() => setFormData({ ...formData, deliveryFeeType: 'distance' })}
                      className="text-[#FF5500] focus:ring-[#FF5500]"
                    />
                    <span className="text-xs">Distance-Based (Per Km)</span>
                  </label>
                </div>

                {formData.deliveryFeeType === 'fixed' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Flat Fee:</span>
                    <div className="relative w-36">
                      <input
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
                        className="w-full pl-3 pr-9 py-2 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                      />
                      <span className="absolute right-3 top-2 text-[11px] text-slate-400 font-medium">PKR</span>
                    </div>
                  </div>
                )}

                {formData.deliveryFeeType === 'distance' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Base Fee</label>
                      <div className="relative">
                        <input
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
                          className="w-full pl-3 pr-9 py-2 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                        />
                        <span className="absolute right-3 top-2 text-[11px] text-slate-400 font-medium">PKR</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-1">Per Kilometer</label>
                      <div className="relative">
                        <input
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
                          className="w-full pl-3 pr-11 py-2 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                        />
                        <span className="absolute right-3 top-2 text-[11px] text-slate-400 font-medium">Rs/km</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Free Delivery Areas */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  Free Delivery Areas (Rs 0 for Neighbors)
                </label>

                {/* Suggestions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400">Presets:</span>
                  {['Askari 11', 'Askari 10', 'DHA Phase 6', 'Bedian Road', 'Gulshan-e-Iqbal', 'Clifton'].map((comm) => (
                    <button
                      key={comm}
                      type="button"
                      onClick={() => handleQuickAddSociety(comm)}
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-2.5 h-2.5 text-[#FF5500]" />
                      <span>{comm}</span>
                    </button>
                  ))}
                </div>

                {/* Add Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAreaInput}
                    onChange={(e) => setNewAreaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddArea();
                      }
                    }}
                    placeholder="Add area or society name..."
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                  />
                  <Button
                    type="button"
                    onClick={handleAddArea}
                    variant="outline"
                    className="h-8 px-3 text-xs font-medium border-slate-300"
                  >
                    Add
                  </Button>
                </div>

                {/* Tags */}
                {formData.freeDeliveryAreas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {formData.freeDeliveryAreas.map((area) => (
                      <span
                        key={area}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800"
                      >
                        <MapPin className="w-3 h-3 text-emerald-600" />
                        <span>{area}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveArea(area)}
                          className="hover:text-red-500 ml-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Distance & Limits */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Free Radius (km)</label>
                  <input
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
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Free Above (PKR)</label>
                  <input
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
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Max Distance (km)</label>
                  <input
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
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Min Order (PKR)</label>
                  <input
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
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                  />
                </div>
              </div>

              {/* Pickup Option */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <label htmlFor="allowPickup" className="text-xs font-medium text-slate-800 cursor-pointer">
                  Allow Customer Door Pickup (Self-Pickup)
                </label>
                <input
                  type="checkbox"
                  id="allowPickup"
                  checked={formData.allowPickup}
                  onChange={(e) => setFormData({ ...formData, allowPickup: e.target.checked })}
                  className="w-4 h-4 text-[#FF5500] rounded border-slate-300 focus:ring-[#FF5500] cursor-pointer"
                />
              </div>

              {/* Kitchen Map */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Kitchen Location &amp; Delivery Radius
                </label>
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
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#FF5500] hover:bg-[#e04400] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
