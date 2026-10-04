'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';

interface PlatformCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscountAmount: number | null;
  minOrderAmount: number;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  status: 'active' | 'scheduled' | 'expired' | 'off';
  timesUsed: number;
  discountGiven: number;
}

const STATUS_STYLE: Record<PlatformCode['status'], string> = {
  active: 'bg-green-100 text-green-800',
  scheduled: 'bg-blue-100 text-blue-800',
  expired: 'bg-gray-100 text-gray-600',
  off: 'bg-gray-100 text-gray-600',
};

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const EMPTY = {
  code: '',
  name: '',
  description: '',
  discountType: 'percentage' as 'percentage' | 'fixed',
  discountValue: '10',
  maxDiscountAmount: '',
  minOrderAmount: '0',
  usageLimitTotal: '',
  usageLimitPerUser: '1',
  validFrom: today(),
  validUntil: inDays(30),
};

/** Promo codes Nuray pays for, valid on any kitchen's order (kitchens run their own deals). */
export default function AdminPromotionsPage() {
  const { showToast } = useToast();
  const [codes, setCodes] = useState<PlatformCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/promotions');
      setCodes(res.data.data);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to load promo codes'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await apiClient.post('/admin/promotions', {
        code: form.code,
        name: form.name,
        description: form.description.trim() || undefined,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscountAmount: num(form.maxDiscountAmount),
        minOrderAmount: Number(form.minOrderAmount || 0),
        usageLimitTotal: num(form.usageLimitTotal),
        usageLimitPerUser: Number(form.usageLimitPerUser || 1),
        validFrom: new Date(`${form.validFrom}T00:00:00`).toISOString(),
        validUntil: new Date(`${form.validUntil}T23:59:59`).toISOString(),
      });
      showToast('Promo code created', 'success');
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not create the code'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: PlatformCode) => {
    try {
      setBusyId(c.id);
      await apiClient.patch(`/admin/promotions/${c.id}`, { isActive: !c.isActive });
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not update the code'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: PlatformCode) => {
    if (!window.confirm(`Delete ${c.code}?`)) return;
    try {
      setBusyId(c.id);
      await apiClient.delete(`/admin/promotions/${c.id}`);
      showToast('Promo code deleted', 'success');
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not delete the code'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm';
  const label = 'block text-xs font-semibold text-gray-700 mb-1';

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Promo codes</h1>
            <p className="text-gray-600 mt-1">Codes Nuray pays for, valid at any kitchen. The kitchen&apos;s share isn&apos;t touched.</p>
          </div>
          <Button onClick={() => setShowForm((v) => !v)} className="bg-green-600 hover:bg-green-700 text-white">
            {showForm ? 'Close' : 'New code'}
          </Button>
        </div>

        {showForm && (
          <form onSubmit={create} className="bg-white border border-gray-200 rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="promo-form">
            <div>
              <label className={label}>Code</label>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="EIDMUBARAK" className={field} />
            </div>
            <div>
              <label className={label}>Name (for your records)</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Eid launch" className={field} />
            </div>
            <div>
              <label className={label}>Discount</label>
              <div className="flex gap-2">
                <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as 'percentage' | 'fixed' })} className={`${field} w-36`}>
                  <option value="percentage">% off</option>
                  <option value="fixed">Rs off</option>
                </select>
                <input required type="number" min={1} max={form.discountType === 'percentage' ? 100 : undefined} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} className={field} />
              </div>
            </div>
            <div>
              <label className={label}>Most it can take off (Rs, optional)</label>
              <input type="number" min={0} value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Minimum order (Rs)</label>
              <input type="number" min={0} value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} className={field} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Uses in total</label>
                <input type="number" min={1} value={form.usageLimitTotal} onChange={(e) => setForm({ ...form, usageLimitTotal: e.target.value })} placeholder="No limit" className={field} />
              </div>
              <div>
                <label className={label}>Uses per customer</label>
                <input type="number" min={1} value={form.usageLimitPerUser} onChange={(e) => setForm({ ...form, usageLimitPerUser: e.target.value })} className={field} />
              </div>
            </div>
            <div>
              <label className={label}>Starts</label>
              <input type="date" required value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>Ends</label>
              <input type="date" required value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Description (optional, shown to customers)</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                {saving ? 'Creating…' : 'Create code'}
              </Button>
            </div>
          </form>
        )}

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          {loading && codes.length === 0 ? (
            <p className="p-10 text-center text-gray-500">Loading…</p>
          ) : codes.length === 0 ? (
            <p className="p-10 text-center text-gray-500">No platform codes yet.</p>
          ) : (
            <table className="w-full text-sm" data-testid="promo-table">
              <thead className="bg-gray-50 text-start text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Valid</th>
                  <th className="px-4 py-3">Used</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-gray-900">{c.code}</p>
                      <p className="text-xs text-gray-500">{c.name}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.discountType === 'percentage' ? `${c.discountValue}% off` : `${formatPrice(c.discountValue)} off`}
                      {c.maxDiscountAmount != null && <span className="text-xs text-gray-500"> (max {formatPrice(c.maxDiscountAmount)})</span>}
                      {c.minOrderAmount > 0 && <p className="text-xs text-gray-500">Orders over {formatPrice(c.minOrderAmount)}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <span className={`inline-block px-2 py-0.5 rounded font-semibold mb-1 ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                      <br />
                      {formatDate(c.validFrom)} – {formatDate(c.validUntil)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.timesUsed}
                      {c.usageLimitTotal ? ` / ${c.usageLimitTotal}` : ''} times
                      <p className="text-xs text-gray-500">{formatPrice(c.discountGiven)} given</p>
                    </td>
                    <td className="px-4 py-3 text-end whitespace-nowrap">
                      <Button variant="outline" size="sm" disabled={busyId === c.id} onClick={() => toggle(c)}>
                        {c.isActive ? 'Switch off' : 'Switch on'}
                      </Button>{' '}
                      {c.timesUsed === 0 && (
                        <Button variant="outline" size="sm" disabled={busyId === c.id} onClick={() => remove(c)} className="border-red-200 text-red-700">
                          Delete
                        </Button>
                      )}
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
