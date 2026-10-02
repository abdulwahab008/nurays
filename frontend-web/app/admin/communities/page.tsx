'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import LocationMap from '@/components/ui/LocationMap';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

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
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/communities');
      setCommunities(res.data.data);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load communities'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

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

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm';
  const label = 'block text-xs font-semibold text-gray-700 mb-1';
  const neighbours = form ? communities.filter((c) => c.id !== form.id && (!form.city.trim() || c.city.toLowerCase() === form.city.trim().toLowerCase())) : [];

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Communities</h1>
            <p className="text-gray-600 mt-1">Neighbourhoods buyers and kitchens belong to, with their delivery fees.</p>
          </div>
          <Button onClick={() => setForm(form ? null : blank())} className="bg-green-600 hover:bg-green-700 text-white">
            {form ? 'Close' : 'New community'}
          </Button>
        </div>

        {form && (
          <form onSubmit={save} className="bg-white border border-gray-200 rounded-lg p-5 grid grid-cols-1 lg:grid-cols-2 gap-5" data-testid="community-form">
            <div className="space-y-3">
              <h2 className="font-bold text-gray-900">{form.id ? `Edit ${form.name}` : 'New community'}</h2>
              <div>
                <label className={label}>Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Askari 11" className={field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>City</label>
                  <input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Lahore" className={field} />
                </div>
                {form.id && (
                  <div>
                    <label className={label}>Web address</label>
                    <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={field} />
                  </div>
                )}
              </div>
              <div>
                <label className={label}>Area description (optional)</label>
                <input value={form.areaDescription} onChange={(e) => setForm({ ...form, areaDescription: e.target.value })} placeholder="Sectors A–F and the main boulevard" className={field} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label}>Radius (km)</label>
                  <input required type="number" min={0.2} max={50} step={0.1} value={form.radiusKm} onChange={(e) => setForm({ ...form, radiusKm: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>Nuray delivery within this community (Rs, fixed)</label>
                  <input required type="number" min={0} value={form.deliveryBaseFee} onChange={(e) => setForm({ ...form, deliveryBaseFee: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>From here to other communities: base fee (Rs, plus per km)</label>
                  <input required type="number" min={0} value={form.crossCommunityBaseFee} onChange={(e) => setForm({ ...form, crossCommunityBaseFee: e.target.value })} className={field} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.crossCommunityEnabled} onChange={(e) => setForm({ ...form, crossCommunityEnabled: e.target.checked })} />
                Kitchens in neighbouring communities can deliver here
              </label>
              {neighbours.length > 0 && (
                <div>
                  <label className={label}>Neighbouring communities</label>
                  <div className="flex flex-wrap gap-2">
                    {neighbours.map((c) => {
                      const on = form.neighborCommunityIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setForm({ ...form, neighborCommunityIds: on ? form.neighborCommunityIds.filter((x) => x !== c.id) : [...form.neighborCommunityIds, c.id] })
                          }
                          className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600'}`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Active (offered to buyers and kitchens)
              </label>
              <Button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create community'}
              </Button>
            </div>
            <div>
              <label className={label}>Centre: click the map or drag the pin</label>
              <LocationMap
                center={form.center ?? { lat: 31.5204, lng: 74.3587 }}
                markerPosition={form.center}
                radiusKm={Number(form.radiusKm) || null}
                height="380px"
                onLocationSelect={(c) => setForm((prev) => (prev ? { ...prev, center: { lat: c.lat, lng: c.lng } } : prev))}
              />
              <p className="text-xs text-gray-500 mt-1">
                {form.center ? `${form.center.lat.toFixed(5)}, ${form.center.lng.toFixed(5)}` : 'No centre picked yet.'}
              </p>
            </div>
          </form>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {loading && communities.length === 0 ? (
            <p className="p-10 text-center text-gray-500">Loading…</p>
          ) : communities.length === 0 ? (
            <p className="p-10 text-center text-gray-500">No communities yet.</p>
          ) : (
            <table className="w-full text-sm" data-testid="communities-table">
              <thead className="bg-gray-50 text-start text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Community</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Nuray delivery</th>
                  <th className="px-4 py-3">Kitchens / members</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {communities.map((c) => (
                  <tr key={c.id} className={c.isActive ? '' : 'opacity-60'}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">
                        {c.name} {!c.isActive && <span className="text-xs font-normal text-gray-500">(off)</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {c.city} · /{c.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {c.radiusKm} km around {c.centerLatitude.toFixed(4)}, {c.centerLongitude.toFixed(4)}
                      {c.neighborCommunityIds.length > 0 && <p>{c.neighborCommunityIds.length} {c.neighborCommunityIds.length === 1 ? 'neighbour' : 'neighbours'}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatPrice(c.deliveryBaseFee)}
                      <p className="text-xs text-gray-500">{c.crossCommunityEnabled ? `to others: ${formatPrice(c.crossCommunityBaseFee)} + per km` : 'Own kitchens only'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.sellerCount} / {c.memberCount}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button variant="outline" size="sm" onClick={() => setForm(fromCommunity(c))}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </UserLayout>
  );
}
