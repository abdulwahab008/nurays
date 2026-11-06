'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
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

const STATUS: Record<AdminHub['status'], { label: string; style: string }> = {
  active: { label: 'Active', style: 'bg-brand-soft text-brand-soft-ink' },
  maintenance: { label: 'Maintenance', style: 'bg-accent-soft text-accent-soft-ink' },
  inactive: { label: 'Off', style: 'bg-raised text-muted' },
};

/** Hubs (frozen-stock centres): set them up, switch them off, and give each its manager. */
export default function AdminHubSetupPage() {
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const [hubs, setHubs] = useState<AdminHub[]>([]);
  const [managers, setManagers] = useState<HubManager[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the hubs could not be read; shown instead of "No hubs yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
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
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

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
    if (!(await confirmDialog({ title: 'Remove hub manager?', message: `Remove ${m.name || m.phone} as a hub manager? They go back to a customer account${m.hubs.length ? ' and stop running their hubs' : ''}.`, confirmText: 'Remove' }))) return;
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

  const field = 'nuray-input w-full text-sm';
  const label = 'block text-sm font-medium text-ink mb-1';

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Hubs and managers</h1>
            <p className="text-sm text-muted mt-1">
              Set up hubs and give each a manager. Day-to-day stock and temperature work is in{' '}
              <Link href="/admin/hubs" className="text-brand-ink underline">
                Operations
              </Link>
              .
            </p>
          </div>
          <Button variant={form ? 'outline' : 'default'} onClick={() => setForm(form ? null : blankHub())}>
            {form ? 'Close' : 'New hub'}
          </Button>
        </div>

        {form && (
          <form onSubmit={saveHub} className="bg-surface border border-line rounded-2xl p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-5" data-testid="hub-form">
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-ink">{form.id ? `Edit ${form.name}` : 'New hub'}</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label htmlFor="hub-name" className={label}>Name</label>
                  <input id="hub-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="DHA cold hub" className={field} />
                </div>
                <div>
                  <label htmlFor="hub-code" className={label}>Code</label>
                  <input id="hub-code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="LHE-DHA" className={field} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="hub-city" className={label}>City</label>
                  <input id="hub-city" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={field} />
                </div>
                <div>
                  <label htmlFor="hub-area" className={label}>Area</label>
                  <input id="hub-area" required value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className={field} />
                </div>
              </div>
              <div>
                <label htmlFor="hub-street-address" className={label}>Street address</label>
                <input id="hub-street-address" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={field} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="hub-capacity-cu-ft" className={label}>Capacity (cu ft)</label>
                  <input id="hub-capacity-cu-ft" required type="number" min={1} value={form.capacityCubicFeet} onChange={(e) => setForm({ ...form, capacityCubicFeet: e.target.value })} className={field} />
                </div>
                <div>
                  <label htmlFor="hub-freezer-units" className={label}>Freezer units</label>
                  <input id="hub-freezer-units" required type="number" min={1} value={form.freezerUnits} onChange={(e) => setForm({ ...form, freezerUnits: e.target.value })} className={field} />
                </div>
                <div>
                  <label htmlFor="hub-status" className={label}>Status</label>
                  <select id="hub-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AdminHub['status'] })} className={field}>
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="hub-contact-phone-optional" className={label}>Contact phone (optional)</label>
                <input id="hub-contact-phone-optional" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={field} />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create hub'}
              </Button>
            </div>
            <div>
              <p className={label}>Location</p>
              <LocationMap
                center={form.location ?? { lat: 31.5204, lng: 74.3587 }}
                markerPosition={form.location}
                hidePinUntilPicked
                height="360px"
                onLocationSelect={(c) => setForm((prev) => (prev ? { ...prev, location: { lat: c.lat, lng: c.lng } } : prev))}
              />
              <p className={`text-sm mt-2 ${form.location ? 'text-muted' : 'text-accent-soft-ink bg-accent-soft rounded-lg px-3 py-2'}`} role="status">
                {form.location ? 'Drag the pin to move the hub.' : 'Tap the map to place the hub.'}
              </p>
            </div>
          </form>
        )}

        <section className="bg-surface border border-line rounded-2xl overflow-x-auto">
          <h2 className="px-5 pt-5 text-base font-semibold text-ink">Hubs</h2>
          {loading && hubs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted" role="status">Loading…</p>
          ) : loadError && hubs.length === 0 ? (
            <LoadError error={loadError} onRetry={load} title="We couldn't load the hubs" className="m-4" />
          ) : hubs.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">No hubs yet. Add the first with New hub.</p>
          ) : (
            <table className="w-full text-sm mt-3" data-testid="hubs-table">
              <thead className="bg-raised text-start text-xs font-medium text-muted">
                <tr>
                  <th className="px-5 py-2">Hub</th>
                  <th className="px-5 py-2">Capacity</th>
                  <th className="px-5 py-2">Manager</th>
                  <th className="px-5 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {hubs.map((h) => (
                  <tr key={h.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-ink">
                        {h.name} <span className="text-xs font-normal text-muted">{h.code}</span>
                      </p>
                      <p className="text-xs text-muted">
                        {h.address}, {h.area}, {h.city}
                      </p>
                      <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[h.status].style}`}>{STATUS[h.status].label}</span>
                    </td>
                    <td className="px-5 py-3 text-ink">
                      {h.capacityCubicFeet.toLocaleString()} cu ft · {h.freezerUnits} {h.freezerUnits === 1 ? 'freezer' : 'freezers'}
                      <p className="text-xs text-muted">{h.currentUtilization}% used</p>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={h.manager?.id ?? ''}
                        disabled={busy === h.id}
                        onChange={(e) => assign(h.id, e.target.value)}
                        className="nuray-input text-sm max-w-[240px]"
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
                        onClick={() => {
                          window.scrollTo({ top: 0, behavior: 'smooth' });
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
                          });
                        }}
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

        <section className="bg-surface border border-line rounded-2xl p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Hub managers</h2>
            <p className="text-sm text-muted mt-1">
              A hub manager runs the hubs assigned to them from their own console (/hub). Ask them to sign up as a customer first, then add them
              here by email or phone.
            </p>
          </div>
          <form onSubmit={addManager} className="flex flex-wrap gap-2">
            <input
              value={newManager}
              onChange={(e) => setNewManager(e.target.value)}
              placeholder="Email or phone of their account"
              className="nuray-input flex-1 min-w-0 basis-60 text-sm"
              aria-label="Email or phone of the new hub manager"
            />
            <Button type="submit" disabled={busy === 'add-manager' || newManager.trim().length < 3} variant="outline">
              {busy === 'add-manager' ? 'Adding…' : 'Make hub manager'}
            </Button>
          </form>
          {loadError && managers.length === 0 ? (
            <LoadError compact error={loadError} onRetry={load} title="We couldn't load the hub managers" />
          ) : managers.length === 0 ? (
            <p className="text-sm text-muted">No hub managers yet.</p>
          ) : (
            <ul className="divide-y divide-line" data-testid="hub-managers">
              {managers.map((m) => (
                <li key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">
                      {m.name || 'Name not set'} {m.status !== 'active' && <span className="text-xs text-red-700">({m.status})</span>}
                    </p>
                    <p className="text-xs text-muted break-words">
                      {m.phone}
                      {m.email ? ` · ${m.email}` : ''} · {m.hubs.length ? `runs ${m.hubs.map((h) => h.name).join(', ')}` : 'no hub yet'}
                    </p>
                  </div>
                  <Button variant="outline" disabled={busy === m.id} onClick={() => removeManager(m)} className="border-red-200 text-red-700 hover:bg-red-50">
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
