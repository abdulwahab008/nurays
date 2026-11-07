'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

interface Place {
  id: string;
  name: string;
  city: string;
}

interface PairFee {
  id: string;
  fee: number;
  communityA: Place;
  communityB: Place;
}

const field = 'nuray-input w-full text-sm';

/**
 * Nuray delivery prices between two communities. A pair price replaces the distance formula
 * for trips between them, in both directions.
 */
export function CommunityPairFees({ communities }: { communities: Place[] }) {
  const { showToast } = useToast();
  const [pairs, setPairs] = useState<PairFee[]>([]);
  // Why the prices could not be read; shown instead of "No pair prices yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/community-pair-fees');
      setPairs(res.data.data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (a: string, b: string, value: number) => {
    try {
      setBusy(true);
      const res = await apiClient.put('/admin/community-pair-fees', { communityAId: a, communityBId: b, fee: value });
      setPairs(res.data.data);
      showToast('Price saved', 'success');
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not save the price'), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (await save(first, second, feeNumber)) {
      setFirst('');
      setSecond('');
      setFee('');
    }
  };

  const remove = async (id: string) => {
    try {
      setBusy(true);
      const res = await apiClient.delete(`/admin/community-pair-fees/${id}`);
      setPairs(res.data.data);
      showToast('Price removed: that trip is priced by distance again', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not remove the price'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const feeNumber = Number(fee);
  const valid = !!first && !!second && first !== second && fee.trim() !== '' && Number.isFinite(feeNumber) && feeNumber >= 0 && feeNumber <= 5000;
  const sorted = [...communities].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));

  return (
    <section className="border-t border-line pt-6 space-y-4" data-testid="pair-fees">
      <div>
        <h2 className="text-sm font-semibold text-ink">Prices between two communities</h2>
        <p className="text-sm text-muted mt-1">
          When a Nuray rider delivers between these two communities (either way), the customer pays this price instead of
          the distance-based fee. Trips between any other communities are still priced by distance.
        </p>
      </div>

      {loadError && pairs.length === 0 ? (
        <LoadError compact error={loadError} onRetry={load} title="We couldn't load the pair prices" />
      ) : pairs.length === 0 ? (
        <p className="text-sm text-muted">No pair prices yet: every trip between communities is priced by distance.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {pairs.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  {p.communityA.name} <span className="text-muted">and</span> {p.communityB.name}
                </p>
                <p className="text-xs text-muted">{p.communityA.city === p.communityB.city ? p.communityA.city : `${p.communityA.city} / ${p.communityB.city}`}</p>
              </div>
              <span className="text-sm font-semibold text-ink tabular-nums">{formatPrice(p.fee)}</span>
              <Button variant="outline" disabled={busy} onClick={() => remove(p.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_8rem_auto] gap-3 items-end">
        <div>
          <label htmlFor="pair-first" className="block text-xs font-medium text-muted mb-1">Community</label>
          <select id="pair-first" value={first} onChange={(e) => { setFirst(e.target.value); if (e.target.value === second) setSecond(''); }} className={field} required>
            <option value="">Choose…</option>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.city})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pair-second" className="block text-xs font-medium text-muted mb-1">and community</label>
          <select id="pair-second" value={second} onChange={(e) => setSecond(e.target.value)} className={field} required>
            <option value="">Choose…</option>
            {sorted.filter((c) => c.id !== first).map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.city})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pair-fee" className="block text-xs font-medium text-muted mb-1">Price (Rs)</label>
          <input id="pair-fee" type="number" min={0} max={5000} step="1" value={fee} onChange={(e) => setFee(e.target.value)} className={field} required />
        </div>
        <Button type="submit" disabled={busy || !valid}>
          Save price
        </Button>
      </form>
    </section>
  );
}
