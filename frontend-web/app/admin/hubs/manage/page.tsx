'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import LocationMap from '@/components/ui/LocationMap';
import { apiClient, apiErrorMessage } from '@/lib/api-client';

interface AdminHub {
  id: string;
  name: string;
  code: string;
  city: string;
  area: string;
  address: string;
  latitude: number;
  longitude: number;
  capacityCubicFeet: number;
  freezerUnits: number;
  currentUtilization: number;
  contactPhone: string | null;
  status: 'active' | 'inactive' | 'maintenance';
  manager: { id: string; name: string | null; phone: string; email: string | null } | null;
  riderCount: number;
  orderCount: number;
}

interface HubManager {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  status: string;
  hubs: Array<{ id: string; name: string }>;
}

interface HubForm {
  id: string | null;
  name: string;
  code: string;
  city: string;
  area: string;
  address: string;
  location: { lat: number; lng: number } | null;
  capacityCubicFeet: string;
  freezerUnits: string;
  contactPhone: string;
  status: AdminHub['status'];
}

const blankHub = (): HubForm => ({
  id: null,
  name: '',
  code: '',
  city: '',
  area: '',
  address: '',
  location: null,
  capacityCubicFeet: '',
  freezerUnits: '1',
  contactPhone: '',
  status: 'active',
});

const STATUS_STYLE: Record<AdminHub['status'], string> = {
  active: 'bg-green-100 text-green-800',
  maintenance: 'bg-amber-100 text-amber-800',
  inactive: 'bg-gray-100 text-gray-600',
};

/** Hubs (frozen-stock centres): set them up, switch them off, and give each its manager. */
export default function AdminHubSetupPage() {
  const { showToast } = useToast();
  const [hubs, setHubs] = useState<AdminHub[]>([]);
  const [managers, setManagers] = useState<HubManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<HubForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [newManager, setNewManager] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [h, m] = await Promise.all([apiClient.get('/admin/hubs'), apiClient.get('/admin/hub-managers')]);
      setHubs(h.data.data);
      setManagers(m.data.data);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load hubs'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveHub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.location) {
      showToast("Pick the hub's location on the map", 'warning');
      return;
    }
    const body = {
      name: form.name.trim(),
      code: form.code.trim(),
      city: form.city.trim(),
      area: form.area.trim(),
      address: form.address.trim(),
      latitude: Number(form.location.lat.toFixed(6)),
      longitude: Number(form.location.lng.toFixed(6)),
      capacityCubicFeet: Math.trunc(Number(form.capacityCubicFeet)),
      freezerUnits: Math.trunc(Number(form.freezerUnits || 1)),
      contactPhone: form.contactPhone.trim() || null,
      status: form.status,
    };
    try {
      setSaving(true);
      if (form.id) await apiClient.patch(`/admin/hubs/${form.id}`, body);
      else await apiClient.post('/admin/hubs', body);
      showToast(form.id ? 'Hub updated' : 'Hub created', 'success');
      setForm(null);
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not save the hub'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const assign = async (hubId: string, managerId: string) => {
    try {
      setBusy(hubId);
      await apiClient.put(`/admin/hubs/${hubId}/manager`, { managerId: managerId || null });
      showToast(managerId ? 'Manager assigned' : 'Manager removed', 'success');
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not change the manager'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const addManager = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy('add-manager');
      await apiClient.post('/admin/hub-managers', { identifier: newManager.trim() });
      showToast('They are now a hub manager. They need to sign in again.', 'success');
      setNewManager('');
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not add the hub manager'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const removeManager = async (m: HubManager) => {
    if (!window.confirm(`Remove ${m.name || m.phone} as a hub manager? They go back to a customer account${m.hubs.length ? ' and stop running their hubs' : ''}.`)) return;
    try {
      setBusy(m.id);
      await apiClient.delete(`/admin/hub-managers/${m.id}`);
      showToast('Hub manager removed', 'success');
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not remove the hub manager'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm';
  const label = 'block text-xs font-semibold text-gray-700 mb-1';

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Hubs &amp; managers</h1>
            <p className="text-gray-600 mt-1">
              Set up hubs and give each a manager. Day-to-day stock and temperature work is in{' '}
              <Link href="/admin/hubs" className="underline">
                Operations
              </Link>
              .
            </p>
          </div>
          <Button
            onClick={() => setForm(form ? null : blankHub())}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {form ? 'Close' : 'New hub'}
          </Button>
        </div>

        {form && (
          <form onSubmit={saveHub} className="bg-white border border-gray-200 rounded-lg p-5 grid grid-cols-1 lg:grid-cols-2 gap-5" data-testid="hub-form">
            <div className="space-y-3">
              <h2 className="font-bold text-gray-900">{form.id ? `Edit ${form.name}` : 'New hub'}</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={label}>Name</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DHA cold hub" className={field} />
                </div>
                <div>
                  <label className={label}>Code</label>
                  <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="LHE-DHA" className={field} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>City</label>
                  <input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>Area</label>
                  <input required value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={field} />
                </div>
              </div>
              <div>
                <label className={label}>Street address</label>
                <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={field} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label}>Capacity (cu ft)</label>
                  <input required type="number" min={1} value={form.capacityCubicFeet} onChange={(e) => setForm({ ...form, capacityCubicFeet: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>Freezer units</label>
                  <input required type="number" min={1} value={form.freezerUnits} onChange={(e) => setForm({ ...form, freezerUnits: e.target.value })} className={field} />
                </div>
                <div>
                  <label className={label}>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AdminHub['status'] })} className={field}>
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={label}>Contact phone (optional)</label>
                <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={field} />
              </div>
              <Button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create hub'}
              </Button>
            </div>
            <div>
              <label className={label}>Location: click the map or drag the pin</label>
              <LocationMap
                center={form.location ?? { lat: 31.5204, lng: 74.3587 }}
                markerPosition={form.location}
                height="360px"
                onLocationSelect={(c) => setForm((prev) => (prev ? { ...prev, location: { lat: c.lat, lng: c.lng } } : prev))}
              />
              <p className="text-xs text-gray-500 mt-1">{form.location ? `${form.location.lat.toFixed(5)}, ${form.location.lng.toFixed(5)}` : 'No location picked yet.'}</p>
            </div>
          </form>
        )}

        <section className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <h2 className="px-5 pt-5 font-bold text-gray-900">Hubs</h2>
          {loading && hubs.length === 0 ? (
            <p className="p-8 text-center text-gray-500">Loading…</p>
          ) : hubs.length === 0 ? (
            <p className="p-8 text-center text-gray-500">No hubs yet.</p>
          ) : (
            <table className="w-full text-sm mt-3" data-testid="hubs-table">
              <thead className="bg-gray-50 text-start text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-2">Hub</th>
                  <th className="px-5 py-2">Capacity</th>
                  <th className="px-5 py-2">Manager</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {hubs.map((h) => (
                  <tr key={h.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900">
                        {h.name} <span className="font-mono text-xs text-gray-500">{h.code}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {h.address}, {h.area}, {h.city}
                      </p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[h.status]}`}>{h.status}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {h.capacityCubicFeet.toLocaleString()} cu ft · {h.freezerUnits} {h.freezerUnits === 1 ? 'freezer' : 'freezers'}
                      <p className="text-xs text-gray-500">{h.currentUtilization}% used</p>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={h.manager?.id ?? ''}
                        disabled={busy === h.id}
                        onChange={(e) => assign(h.id, e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white max-w-[220px]"
                        aria-label={`Manager of ${h.name}`}
                      >
                        <option value="">No manager (admins run it)</option>
                        {managers
                          .filter((m) => m.status === 'active' || m.id === h.manager?.id)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name || m.phone}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setForm({
                            id: h.id,
                            name: h.name,
                            code: h.code,
                            city: h.city,
                            area: h.area,
                            address: h.address,
                            location: { lat: h.latitude, lng: h.longitude },
                            capacityCubicFeet: String(h.capacityCubicFeet),
                            freezerUnits: String(h.freezerUnits),
                            contactPhone: h.contactPhone ?? '',
                            status: h.status,
                          })
                        }
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="font-bold text-gray-900">Hub managers</h2>
            <p className="text-xs text-gray-500 mt-1">
              A hub manager runs the hubs assigned to them from their own console (/hub). Ask them to sign up as a customer first, then add them
              here by email or phone.
            </p>
          </div>
          <form onSubmit={addManager} className="flex flex-wrap gap-2">
            <input
              value={newManager}
              onChange={(e) => setNewManager(e.target.value)}
              placeholder="Email or phone of their account"
              className="flex-1 min-w-[240px] px-3 py-2 rounded-lg border border-gray-200 text-sm"
              aria-label="Email or phone of the new hub manager"
            />
            <Button type="submit" disabled={busy === 'add-manager' || newManager.trim().length < 3} variant="outline">
              {busy === 'add-manager' ? 'Adding…' : 'Make hub manager'}
            </Button>
          </form>
          {managers.length === 0 ? (
            <p className="text-sm text-gray-500">No hub managers yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100" data-testid="hub-managers">
              {managers.map((m) => (
                <li key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {m.name || 'Name not set'} {m.status !== 'active' && <span className="text-xs text-red-600">({m.status})</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {m.phone}
                      {m.email ? ` · ${m.email}` : ''} · {m.hubs.length ? `runs ${m.hubs.map((h) => h.name).join(', ')}` : 'no hub yet'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled={busy === m.id} onClick={() => removeManager(m)} className="border-red-200 text-red-700">
                    Remove role
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
