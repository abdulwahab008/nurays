'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
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

const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500';

/**
 * Nuray delivery prices between two communities. A pair price replaces the distance formula
 * for trips between them, in both directions.
 */
export function CommunityPairFees({ communities }: { communities: Place[] }) {
  const { showToast } = useToast();
  const [pairs, setPairs] = useState<PairFee[]>([]);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/admin/community-pair-fees');
      setPairs(res.data.data);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not load pair prices'), 'error');
    }
  }, [showToast]);

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
    if (!first || !second || fee.trim() === '') return;
    if (await save(first, second, Number(fee))) {
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

  const sorted = [...communities].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4" data-testid="pair-fees">
      <div>
        <h2 className="font-bold text-gray-900">Prices between two communities</h2>
        <p className="text-sm text-gray-500 mt-1">
          When a Nuray rider delivers between these two communities (either way), the customer pays this price instead of
          the distance-based fee. Trips between any other communities are still priced by distance.
        </p>
      </div>

      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_8rem_auto] gap-3 items-end">
        <div>
          <label htmlFor="pair-first" className="block text-xs font-medium text-gray-600 mb-1">Community</label>
          <select id="pair-first" value={first} onChange={(e) => setFirst(e.target.value)} className={field} required>
            <option value="">Choose…</option>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.city})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pair-second" className="block text-xs font-medium text-gray-600 mb-1">and community</label>
          <select id="pair-second" value={second} onChange={(e) => setSecond(e.target.value)} className={field} required>
            <option value="">Choose…</option>
            {sorted.filter((c) => c.id !== first).map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.city})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pair-fee" className="block text-xs font-medium text-gray-600 mb-1">Price (Rs)</label>
          <input id="pair-fee" type="number" min={0} max={5000} step="1" value={fee} onChange={(e) => setFee(e.target.value)} className={field} required />
        </div>
        <Button type="submit" disabled={busy} className="bg-green-600 hover:bg-green-700">
          Save price
        </Button>
      </form>

      {pairs.length === 0 ? (
        <p className="text-sm text-gray-500">No pair prices yet: every trip between communities is priced by distance.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs text-gray-500 border-b">
              <th className="py-2 text-start font-medium">Between</th>
              <th className="py-2 text-start font-medium">Price</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pairs.map((p) => (
              <tr key={p.id}>
                <td className="py-2.5 text-gray-900">
                  {p.communityA.name} <span className="text-gray-400">⇄</span> {p.communityB.name}
                  <span className="text-xs text-gray-400 ms-1">{p.communityA.city === p.communityB.city ? p.communityA.city : `${p.communityA.city} / ${p.communityB.city}`}</span>
                </td>
                <td className="py-2.5 font-semibold">{formatPrice(p.fee)}</td>
                <td className="py-2.5 text-end">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => remove(p.id)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
