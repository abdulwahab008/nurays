'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import LocationMap from '@/components/ui/LocationMap';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { CommunityPairFees } from '@/components/admin/CommunityPairFees';
import { PageHeader } from '@/components/admin/AdminListParts';

interface Community {
  id: string;
  name: string;
  slug: string;
  city: string;
  areaDescription: string | null;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  deliveryBaseFee: number;
  crossCommunityBaseFee: number;
  crossCommunityEnabled: boolean;
  neighborCommunityIds: string[];
  isActive: boolean;
  sellerCount: number;
  memberCount: number;
  addressCount: number;
}

interface FormState {
  id: string | null;
  name: string;
  slug: string;
  city: string;
  areaDescription: string;
  center: { lat: number; lng: number } | null;
  radiusKm: string;
  deliveryBaseFee: string;
  crossCommunityBaseFee: string;
  crossCommunityEnabled: boolean;
  neighborCommunityIds: string[];
  isActive: boolean;
}

const blank = (): FormState => ({
  id: null,
  name: '',
  slug: '',
  city: '',
  areaDescription: '',
  center: null,
  radiusKm: '3',
  deliveryBaseFee: '100',
  crossCommunityBaseFee: '150',
  crossCommunityEnabled: true,
  neighborCommunityIds: [],
  isActive: true,
});

const fromCommunity = (c: Community): FormState => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  city: c.city,
  areaDescription: c.areaDescription ?? '',
  center: { lat: c.centerLatitude, lng: c.centerLongitude },
  radiusKm: String(c.radiusKm),
  deliveryBaseFee: String(c.deliveryBaseFee),
  crossCommunityBaseFee: String(c.crossCommunityBaseFee),
  crossCommunityEnabled: c.crossCommunityEnabled,
  neighborCommunityIds: c.neighborCommunityIds,
  isActive: c.isActive,
});

/**
 * Communities: the neighbourhoods buyers and kitchens belong to. Each has a centre and a
 * radius (addresses inside it belong to it), its own delivery fee, and neighbours whose
 * kitchens also deliver into it.
 */
export default function AdminCommunitiesPage() {
  const { showToast } = useToast();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the communities could not be read; shown instead of "No communities yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await apiClient.get('/admin/communities');
      setCommunities(res.data.data);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.center) {
      showToast('Pick the centre of the community on the map', 'warning');
      return;
    }
    const body = {
      name: form.name.trim(),
      city: form.city.trim(),
      areaDescription: form.areaDescription.trim() || null,
      centerLatitude: Number(form.center.lat.toFixed(6)),
      centerLongitude: Number(form.center.lng.toFixed(6)),
      radiusKm: Number(form.radiusKm),
      deliveryBaseFee: Number(form.deliveryBaseFee),
      crossCommunityBaseFee: Number(form.crossCommunityBaseFee),
      crossCommunityEnabled: form.crossCommunityEnabled,
      neighborCommunityIds: form.neighborCommunityIds,
      isActive: form.isActive,
      ...(form.id && form.slug.trim() ? { slug: form.slug.trim() } : {}),
    };
    try {
      setSaving(true);
      if (form.id) await apiClient.patch(`/admin/communities/${form.id}`, body);
      else await apiClient.post('/admin/communities', body);
      showToast(form.id ? 'Community updated' : 'Community created', 'success');
      setForm(null);
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not save the community'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const field = 'nuray-input w-full text-sm';
  const label = 'block text-sm font-medium text-ink mb-1';
  // The form opens above the list: bring it into view.
  const editCommunity = (c: Community) => {
    setForm(fromCommunity(c));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const neighbourCount = (c: Community) => (c.neighborCommunityIds.length === 1 ? '1 neighbour' : `${c.neighborCommunityIds.length} neighbours`);
  const deliveryLine = (c: Community) =>
    `${formatPrice(c.deliveryBaseFee)} inside${c.crossCommunityEnabled ? ` · ${formatPrice(c.crossCommunityBaseFee)} + per km outside` : ' · own kitchens only'}`;
  const neighbours = form ? communities.filter((c) => c.id !== form.id && (!form.city.trim() || c.city.toLowerCase() === form.city.trim().toLowerCase())) : [];

  return (
    <AdminShell>
      <div className="max-w-6xl space-y-5">
        <PageHeader
          title="Communities"
          subtitle="Neighbourhoods buyers and kitchens belong to, with their delivery fees."
          actions={
            <Button variant={form ? 'outline' : 'default'} onClick={() => setForm(form ? null : blank())}>
              {form ? 'Close' : 'New community'}
            </Button>
          }
        />

        {form && (
          <form onSubmit={save} className="bg-surface border border-line rounded-2xl p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-5" data-testid="community-form">
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-ink">{form.id ? `Edit ${form.name}` : 'New community'}</h2>
              <div>
                <label htmlFor="community-name" className={label}>Name</label>
                <input id="community-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Askari 11" className={field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="community-city" className={label}>City</label>
                  <input id="community-city" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Lahore" className={field} />
                </div>
                {form.id && (
                  <div>
                    <label htmlFor="community-slug" className={label}>Web address</label>
                    <input id="community-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={field} />
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="community-area" className={label}>Area description (optional)</label>
                <input id="community-area" value={form.areaDescription} onChange={(e) => setForm({ ...form, areaDescription: e.target.value })} placeholder="Sectors A–F and the main boulevard" className={field} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="community-radius" className={label}>Radius (km)</label>
                  <input id="community-radius" required type="number" min={0.2} max={50} step={0.1} value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: e.target.value })} className={field} />
                </div>
                <div>
                  <label htmlFor="community-fee" className={label}>Delivery inside (Rs, fixed)</label>
                  <input id="community-fee" required type="number" min={0} value={form.deliveryBaseFee} onChange={(e) => setForm({ ...form, deliveryBaseFee: e.target.value })} className={field} />
                </div>
                <div>
                  <label htmlFor="community-cross-fee" className={label}>To other communities (Rs, plus per km)</label>
                  <input id="community-cross-fee" required type="number" min={0} value={form.crossCommunityBaseFee} onChange={(e) => setForm({ ...form, crossCommunityBaseFee: e.target.value })} className={field} />
                </div>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="h-5 w-5" checked={form.crossCommunityEnabled} onChange={(e) => setForm({ ...form, crossCommunityEnabled: e.target.checked })} />
                Kitchens in neighbouring communities can deliver here
              </label>
              {neighbours.length > 0 && (
                <div>
                  <p className={label} id="community-neighbours">Neighbouring communities</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby="community-neighbours">
                    {neighbours.map((c) => {
                      const on = form.neighborCommunityIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setForm({ ...form, neighborCommunityIds: on ? form.neighborCommunityIds.filter((x) => x !== c.id) : [...form.neighborCommunityIds, c.id] })
                          }
                          aria-pressed={on}
                          className={`min-h-11 px-3 rounded-full text-sm border ${on ? 'border-brand bg-brand-soft text-brand-soft-ink' : 'border-line text-ink hover:bg-raised'}`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="h-5 w-5" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Active (offered to buyers and kitchens)
              </label>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create community'}
              </Button>
            </div>
            <div>
              <p className={label}>Centre</p>
              <LocationMap
                center={form.center ?? { lat: 31.5204, lng: 74.3587 }}
                markerPosition={form.center}
                hidePinUntilPicked
                radiusKm={Number(form.radiusKm) || null}
                height="380px"
                onLocationSelect={(c) => setForm((prev) => (prev ? { ...prev, center: { lat: c.lat, lng: c.lng } } : prev))}
              />
              <p className={`text-sm mt-2 ${form.center ? 'text-muted' : 'text-accent-soft-ink bg-accent-soft rounded-lg px-3 py-2'}`} role="status">
                {form.center ? 'Drag the pin to move the centre.' : 'Tap the map to place the centre of the community.'}
              </p>
            </div>
          </form>
        )}

        <div className="bg-surface border border-line rounded-2xl overflow-x-auto">
          {loading && communities.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted" role="status">Loading…</p>
          ) : loadError && communities.length === 0 ? (
            <LoadError error={loadError} onRetry={load} title="We couldn't load the communities" className="m-4" />
          ) : communities.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">No communities yet. Add the first with New community.</p>
          ) : (
            <>
            <ul className="md:hidden divide-y divide-line" data-testid="communities-cards">
              {communities.map((c) => (
                <li key={c.id} className={`flex items-center gap-3 px-4 py-3 ${c.isActive ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {c.name} <span className="font-normal text-muted">· {c.city}</span>
                      {!c.isActive && <span className="ms-2 rounded-full bg-raised px-2 py-0.5 text-xs font-medium text-muted">Off</span>}
                    </p>
                    <p className="text-sm text-muted">{deliveryLine(c)}</p>
                    <p className="text-xs text-muted">Radius {c.radiusKm} km · {neighbourCount(c)} · {c.sellerCount === 1 ? '1 kitchen' : `${c.sellerCount} kitchens`}</p>
                  </div>
                  <Button variant="outline" onClick={() => editCommunity(c)}>Edit</Button>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
            <table className="w-full text-sm [&_th]:text-start" data-testid="communities-table">
              <thead className="bg-raised text-start text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-3">Community</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Nuray delivery</th>
                  <th className="px-4 py-3">Kitchens / members</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {communities.map((c) => (
                  <tr key={c.id} className={c.isActive ? '' : 'opacity-60'}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">
                        {c.name} {!c.isActive && <span className="text-xs font-normal text-muted">(off)</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {c.city} · /{c.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      Radius {c.radiusKm} km · {neighbourCount(c)}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {formatPrice(c.deliveryBaseFee)}
                      <p className="text-xs text-muted">{c.crossCommunityEnabled ? `to others: ${formatPrice(c.crossCommunityBaseFee)} + per km` : 'Own kitchens only'}</p>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {c.sellerCount} / {c.memberCount}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button variant="outline" onClick={() => editCommunity(c)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>

        <CommunityPairFees communities={communities} />
      </div>
    </AdminShell>
  );
}
