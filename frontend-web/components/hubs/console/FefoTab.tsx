'use client';

/** The hub's batches in first-expiry-first-out order, with search, status chips, and quarantine or release. */
import { useMemo, useState } from 'react';
import { filterBatches, type BatchSummary, type FefoFilter, type HubBatch } from '@/lib/hub-console';

export default function FefoTab({
  batches,
  batchSummary,
  onChangeStatus,
}: {
  batches: HubBatch[];
  batchSummary: BatchSummary | null;
  onChangeStatus: (batch: HubBatch) => void;
}) {
  const [fefoSearch, setFefoSearch] = useState('');
  const [fefoFilter, setFefoFilter] = useState<FefoFilter>('all');
  const filteredBatches = useMemo(() => filterBatches(batches, fefoFilter, fefoSearch), [batches, fefoFilter, fefoSearch]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
      {/* Search & Status Filters */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="relative flex-1 w-full md:max-w-md">
          <span className="absolute start-3.5 top-2.5 text-gray-500">🔍</span>
          <input
            type="text"
            placeholder="Filter by batch #, product, or barcode..."
            value={fefoSearch}
            onChange={(e) => setFefoSearch(e.target.value)}
            className="w-full ps-10 pe-4 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          <button
            onClick={() => setFefoFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              fefoFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({batches.length})
          </button>
          <button
            onClick={() => setFefoFilter('available')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              fefoFilter === 'available' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🟢 Sellable Available ({batchSummary?.availableCount ?? 0})
          </button>
          <button
            onClick={() => setFefoFilter('quarantined')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              fefoFilter === 'quarantined' ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            🛡️ Quarantined ({batchSummary?.quarantinedCount ?? 0})
          </button>
          <button
            onClick={() => setFefoFilter('expiringSoon')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              fefoFilter === 'expiringSoon' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            ⏳ Expiring Soon ({batchSummary?.expiringSoonCount ?? 0})
          </button>
        </div>
      </div>

      {/* BATCHES TABLE */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-start border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider font-semibold">
              <th className="py-3.5 px-4">FEFO Priority</th>
              <th className="py-3.5 px-4">Product Details</th>
              <th className="py-3.5 px-4">Batch & Barcode</th>
              <th className="py-3.5 px-4">Expiration & Shelf-Life</th>
              <th className="py-3.5 px-4">In Stock</th>
              <th className="py-3.5 px-4">Storage Slot</th>
              <th className="py-3.5 px-4">Quality Status</th>
              <th className="py-3.5 px-4 text-end">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredBatches.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-500">
                  No batch inventory matching criteria in this hub center.
                </td>
              </tr>
            ) : (
              filteredBatches.map((batch) => {
                const isSellable = batch.status === 'available';
                return (
                  <tr key={batch.id} className={`hover:bg-slate-50/80 transition-colors ${!isSellable ? 'bg-rose-50/20' : ''}`}>
                    {/* FEFO Priority */}
                    <td className="py-4 px-4 font-mono font-bold">
                      {isSellable ? (
                        <span
                          className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-xs ${
                            batch.fefoPriority === 1 ? 'bg-cyan-600 text-white font-black shadow-sm' : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          #{batch.fefoPriority} {batch.fefoPriority === 1 ? 'Dispatch ➔' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 font-normal">Held</span>
                      )}
                    </td>

                    {/* Product */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 relative overflow-hidden flex-shrink-0 border border-gray-200">
                          {batch.product.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={batch.product.image}
                              alt={batch.product.name}
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-base">❄️</div>
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900 block truncate max-w-[180px]">{batch.product.name}</span>
                          <span className="text-xs text-gray-500 block">{batch.product.seller?.businessName || 'Home Kitchen'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Batch & Barcode */}
                    <td className="py-4 px-4 font-mono text-xs">
                      <span className="font-bold text-gray-800 block">{batch.batchNumber}</span>
                      {batch.barcode && (
                        <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                          🏷️ {batch.barcode}
                        </span>
                      )}
                    </td>

                    {/* Expiry Countdown */}
                    <td className="py-4 px-4">
                      <span className="text-xs font-semibold text-gray-900 block">
                        {new Date(batch.expiryDate).toLocaleDateString('en-PK', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      {batch.isExpired ? (
                        <span className="inline-block mt-0.5 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                          ❌ Expired
                        </span>
                      ) : batch.isExpiringSoon ? (
                        <span className="inline-block mt-0.5 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                          ⚠️ {batch.daysUntilExpiry} days left
                        </span>
                      ) : (
                        <span className="inline-block mt-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          🟢 {batch.daysUntilExpiry} days left
                        </span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="py-4 px-4 font-bold text-gray-900">
                      {batch.quantity} <span className="text-xs font-normal text-gray-500">packs</span>
                    </td>

                    {/* Location */}
                    <td className="py-4 px-4">
                      <span className="text-xs font-mono bg-slate-100 border border-slate-200 text-slate-800 px-2 py-1 rounded">
                        {batch.storageUnit}
                      </span>
                    </td>

                    {/* Quality Status */}
                    <td className="py-4 px-4">
                      {batch.status === 'available' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Available
                        </span>
                      ) : batch.status === 'damaged' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Quarantined
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full capitalize">
                          {batch.status}
                        </span>
                      )}
                    </td>

                    {/* Action Button */}
                    <td className="py-4 px-4 text-end">
                      <button
                        onClick={() => onChangeStatus(batch)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                          batch.status === 'available'
                            ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                            : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {batch.status === 'available' ? 'Quarantine' : 'Release'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
