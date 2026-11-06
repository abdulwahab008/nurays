'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';

// The server's limit (backend/src/validators/promotion.validator.ts): a fixed discount is at most the minimum order, or this.
const MAX_FIXED_WITHOUT_MINIMUM = 5000;

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

const STATUS: Record<PlatformCode['status'], { label: string; style: string }> = {
  active: { label: 'Active', style: 'bg-brand-soft text-brand-soft-ink' },
  scheduled: { label: 'Starts later', style: 'bg-accent-soft text-accent-soft-ink' },
  expired: { label: 'Ended', style: 'bg-raised text-muted' },
  off: { label: 'Switched off', style: 'bg-raised text-muted' },
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
  const { confirm: confirmDialog } = useDialogs();
  const [codes, setCodes] = useState<PlatformCode[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the codes could not be read; shown instead of "No platform codes yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<{ field: 'discountValue' | 'validUntil'; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await apiClient.get('/admin/promotions');
      setCodes(res.data.data);
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(form.discountValue);
    const minOrder = Number(form.minOrderAmount || 0);
    const cap = num(form.maxDiscountAmount);
    if (form.validUntil < form.validFrom) {
      setFormError({ field: 'validUntil', message: 'The end date must be on or after the start date.' });
      return;
    }
    if (form.discountType === 'fixed' && value > (minOrder > 0 ? minOrder : MAX_FIXED_WITHOUT_MINIMUM)) {
      setFormError({
        field: 'discountValue',
        message: minOrder > 0 ? `At most the minimum order (${formatPrice(minOrder)}).` : `At most ${formatPrice(MAX_FIXED_WITHOUT_MINIMUM)} without a minimum order.`,
      });
      return;
    }
    setFormError(null);
    const off = form.discountType === 'percentage' ? `${value}% off${cap != null ? ` (at most ${formatPrice(cap)})` : ', no cap'}` : `${formatPrice(value)} off`;
    const uses = form.usageLimitTotal.trim() ? `${form.usageLimitTotal} uses in total` : 'unlimited uses';
    const summary = `${off} ${minOrder > 0 ? `orders over ${formatPrice(minOrder)}` : 'any order'} at every kitchen, ${uses}, ${form.usageLimitPerUser || 1} per customer, ${formatDate(form.validFrom)} to ${formatDate(form.validUntil)}. Nuray pays for it.`;
    if (!(await confirmDialog({ title: `Create ${form.code || 'this code'}?`, message: summary, confirmText: 'Create code', variant: 'warning' }))) return;
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
    if (!(await confirmDialog({ title: 'Delete this promo code?', message: `Delete ${c.code}?`, confirmText: 'Delete' }))) return;
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

  const field = 'nuray-input w-full text-sm';
  const label = 'block text-sm font-medium text-ink mb-1';

  return (
    <AdminShell>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">Promo codes</h1>
            <p className="text-sm text-muted mt-1">Codes Nuray pays for, valid at any kitchen. The kitchen&apos;s share isn&apos;t touched.</p>
          </div>
          <Button variant={showForm ? 'outline' : 'default'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'New code'}
          </Button>
        </div>

        {showForm && (
          <form onSubmit={create} onChange={() => formError && setFormError(null)} className="bg-surface border border-line rounded-2xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="promo-form">
            <div>
              <label htmlFor="promo-code" className={label}>Code</label>
              <input id="promo-code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="EIDMUBARAK" className={field} />
            </div>
            <div>
              <label htmlFor="promo-name" className={label}>Name (for your records)</label>
              <input id="promo-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Eid launch" className={field} />
            </div>
            <div>
              <label htmlFor="promo-value" className={label}>Discount</label>
              <div className="flex gap-2">
                <select aria-label="Kind of discount" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as 'percentage' | 'fixed' })} className={`${field} w-36`}>
                  <option value="percentage">% off</option>
                  <option value="fixed">Rs off</option>
                </select>
                <input id="promo-value" required type="number" min={1} max={form.discountType === 'percentage' ? 100 : undefined} aria-invalid={formError?.field === 'discountValue'} aria-describedby={formError?.field === 'discountValue' ? 'promo-value-error' : undefined} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} className={field} />
              </div>
              {formError?.field === 'discountValue' && <p id="promo-value-error" className="mt-1 text-xs text-red-700">{formError.message}</p>}
            </div>
            <div>
              <label htmlFor="promo-cap" className={label}>Most it can take off (Rs, optional)</label>
              <input id="promo-cap" type="number" min={0} value={form.maxDiscountAmount} onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })} className={field} />
            </div>
            <div>
              <label htmlFor="promo-min" className={label}>Minimum order (Rs)</label>
              <input id="promo-min" type="number" min={0} value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} className={field} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="promo-total" className={label}>Uses in total</label>
                <input id="promo-total" type="number" min={1} value={form.usageLimitTotal} onChange={(e) => setForm({ ...form, usageLimitTotal: e.target.value })} placeholder="No limit" className={field} />
              </div>
              <div>
                <label htmlFor="promo-per" className={label}>Uses per customer</label>
                <input id="promo-per" type="number" min={1} value={form.usageLimitPerUser} onChange={(e) => setForm({ ...form, usageLimitPerUser: e.target.value })} className={field} />
              </div>
            </div>
            <div>
              <label htmlFor="promo-from" className={label}>Starts</label>
              <input id="promo-from" type="date" required value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className={field} />
            </div>
            <div>
              <label htmlFor="promo-until" className={label}>Ends</label>
              <input id="promo-until" type="date" required aria-invalid={formError?.field === 'validUntil'} aria-describedby={formError?.field === 'validUntil' ? 'promo-until-error' : undefined} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={field} />
              {formError?.field === 'validUntil' && <p id="promo-until-error" className="mt-1 text-xs text-red-700">{formError.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="promo-desc" className={label}>Description (optional, shown to customers)</label>
              <input id="promo-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={field} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create code'}
              </Button>
            </div>
          </form>
        )}

        <div className="bg-surface border border-line rounded-2xl overflow-x-auto">
          {loading && codes.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted" role="status">Loading…</p>
          ) : loadError && codes.length === 0 ? (
            <LoadError error={loadError} onRetry={load} title="We couldn't load the promo codes" className="m-4" />
          ) : codes.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">No promo codes yet. Codes you create with New code appear here.</p>
          ) : (
            <table className="w-full text-sm" data-testid="promo-table">
              <thead className="bg-raised text-start text-xs font-medium text-muted">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Valid</th>
                  <th className="px-4 py-3">Used</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink break-all">{c.code}</p>
                      <p className="text-xs text-muted">{c.name}</p>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {c.discountType === 'percentage' ? `${c.discountValue}% off` : `${formatPrice(c.discountValue)} off`}
                      {c.maxDiscountAmount != null && <span className="text-xs text-muted"> (max {formatPrice(c.maxDiscountAmount)})</span>}
                      {c.minOrderAmount > 0 && <p className="text-xs text-muted">Orders over {formatPrice(c.minOrderAmount)}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium mb-1 ${STATUS[c.status].style}`}>{STATUS[c.status].label}</span>
                      <br />
                      {formatDate(c.validFrom)} – {formatDate(c.validUntil)}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {c.timesUsed}
                      {c.usageLimitTotal ? ` / ${c.usageLimitTotal}` : ''} times
                      <p className="text-xs text-muted">{formatPrice(c.discountGiven)} given</p>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="outline" disabled={busyId === c.id} onClick={() => toggle(c)}>
                        {c.isActive ? 'Switch off' : 'Switch on'}
                      </Button>
                      {c.timesUsed === 0 && (
                        <Button variant="outline" disabled={busyId === c.id} onClick={() => remove(c)} className="border-red-200 text-red-700 hover:bg-red-50">
                          Delete
                        </Button>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
