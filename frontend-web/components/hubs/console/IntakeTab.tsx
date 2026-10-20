'use client';

/**
 * Receiving a batch: which frozen dish, batch number, quantity, dates, shelf and the temperature measured on arrival.
 * A batch warmer than -18°C is still received, but quarantined.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { serverMessageOf } from '@/lib/load-error';
import { dateInDays, isColdEnough, newBatchCode, type FrozenProduct } from '@/lib/hub-console';

export default function IntakeTab({
  hubId,
  products,
  onSaved,
  onCancel,
}: {
  hubId: string;
  products: FrozenProduct[];
  /** After a batch is received: reload the hub and show the queue. */
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [firstCode] = useState(() => newBatchCode());
  const [chosenProductId, setIntakeProductId] = useState('');
  const productId = chosenProductId || products[0]?.id || '';
  const [intakeBatchNumber, setIntakeBatchNumber] = useState(firstCode.batchNumber);
  const [intakeQuantity, setIntakeQuantity] = useState(20);
  const [intakeManufacturedDate, setIntakeManufacturedDate] = useState(() => dateInDays(0));
  const [intakeExpiryDate, setIntakeExpiryDate] = useState(() => dateInDays(90));
  const [intakeTemp, setIntakeTemp] = useState<number>(-20.0);
  const [intakeStorageUnit, setIntakeStorageUnit] = useState('FREEZER-01 / SHELF-A');
  const [intakeBarcode, setIntakeBarcode] = useState(firstCode.barcode);
  const [submittingIntake, setSubmittingIntake] = useState(false);

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId) || null, [products, productId]);

  const regenerate = () => {
    const code = newBatchCode();
    setIntakeBatchNumber(code.batchNumber);
    setIntakeBarcode(code.barcode);
  };

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hubId) {
      showToast('Please select an active hub center first', 'error');
      return;
    }
    if (!productId) {
      showToast('Please select a product for intake', 'error');
      return;
    }
    if (!intakeBatchNumber.trim()) {
      showToast('Batch number is required', 'error');
      return;
    }
    if (intakeQuantity <= 0) {
      showToast('Quantity must be greater than 0', 'error');
      return;
    }

    try {
      setSubmittingIntake(true);
      const res = await apiClient.post(`/hubs/${hubId}/intake`, {
        productId,
        quantity: Number(intakeQuantity),
        batchNumber: intakeBatchNumber.trim(),
        manufacturedDate: intakeManufacturedDate,
        expiryDate: intakeExpiryDate,
        measuredTemperatureCelsius: Number(intakeTemp),
        storageUnit: intakeStorageUnit.trim() || 'FREEZER-01 / SHELF-A',
        barcode: intakeBarcode.trim() || undefined,
      });

      if (res.data.success) {
        if (!isColdEnough(intakeTemp)) {
          showToast(`⚠️ Cold-Chain Breach (${intakeTemp}°C > -18°C)! Batch ${intakeBatchNumber} was QUARANTINED.`, 'error');
        } else {
          showToast(`✅ Sub-Zero Verified (${intakeTemp}°C)! Batch ${intakeBatchNumber} added to sellable inventory.`, 'success');
        }
        regenerate();
        await onSaved();
      }
    } catch (err: unknown) {
      showToast(serverMessageOf(err) || 'Failed to complete batch intake', 'error');
    } finally {
      setSubmittingIntake(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
      <div className="mb-6 pb-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Cold Batch Physical Intake & Inspection</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Mandatory temperature probe measurement required. Batches exceeding -18.0°C will be quarantined.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={regenerate} className="text-xs">
          🎲 Auto-Generate Batch ID
        </Button>
      </div>

      <form onSubmit={handleIntakeSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Product Selection */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                1. Select Frozen Food Product *
              </label>
              <select
                value={productId}
                onChange={(e) => setIntakeProductId(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — Rs {p.price} ({p.seller?.businessName || 'Home Chef'})
                  </option>
                ))}
              </select>
            </div>

            {/* Product Card Preview */}
            {selectedProduct && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-gray-200 flex-shrink-0 relative overflow-hidden border border-gray-300">
                  {selectedProduct.primaryImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedProduct.primaryImage}
                      alt={selectedProduct.name}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🍲</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded">❄️ Sub-Zero Pack</span>
                    <span className="text-xs text-gray-500">{selectedProduct.category?.name || 'Frozen Artisan'}</span>
                  </div>
                  <h4 className="font-bold text-gray-900 text-sm truncate mt-1">{selectedProduct.name}</h4>
                  <p className="text-xs text-gray-500">
                    Seller:{' '}
                    <span className="font-semibold text-gray-700">{selectedProduct.seller?.businessName || 'Verified Home Chef'}</span>
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">2. Batch Identification # *</label>
                <input
                  type="text"
                  value={intakeBatchNumber}
                  onChange={(e) => setIntakeBatchNumber(e.target.value)}
                  placeholder="e.g. BATCH-2026-FROST-01"
                  required
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-mono text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  3. Intake Quantity (Packs) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={intakeQuantity}
                  onChange={(e) => setIntakeQuantity(parseInt(e.target.value) || 1)}
                  required
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">Storage Location Slot</label>
                <input
                  type="text"
                  value={intakeStorageUnit}
                  onChange={(e) => setIntakeStorageUnit(e.target.value)}
                  placeholder="e.g. FREEZER-01 / SHELF-B2"
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">Barcode / Scan Tag</label>
                <input
                  type="text"
                  value={intakeBarcode}
                  onChange={(e) => setIntakeBarcode(e.target.value)}
                  placeholder="e.g. NR-FROST-1029"
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-mono text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Dates & Sub-Zero Probe Measurement */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DatePicker
                label="Manufacturing Date"
                value={intakeManufacturedDate}
                onChange={(date) => setIntakeManufacturedDate(date)}
                placeholder="Select mfg date"
              />

              <DatePicker
                label="Expiration Date *"
                value={intakeExpiryDate}
                onChange={(date) => setIntakeExpiryDate(date)}
                placeholder="Select expiry date"
              />
            </div>

            {/* Expiry Presets */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">Quick Presets:</span>
              <button
                type="button"
                onClick={() => setIntakeExpiryDate(dateInDays(30))}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                +30 Days
              </button>
              <button
                type="button"
                onClick={() => setIntakeExpiryDate(dateInDays(60))}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                +60 Days
              </button>
              <button
                type="button"
                onClick={() => setIntakeExpiryDate(dateInDays(90))}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                +90 Days
              </button>
              <button
                type="button"
                onClick={() => setIntakeExpiryDate(dateInDays(180))}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                +180 Days
              </button>
            </div>

            {/* MANDATORY SUB-ZERO TEMPERATURE PROBE VERIFICATION */}
            <div className="pt-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-cyan-900 mb-1.5 flex items-center justify-between">
                <span>4. Measured Arrival Temperature (°C) *</span>
                <span className="text-[11px] font-semibold text-cyan-600">Must be ≤ -18.0°C</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={intakeTemp}
                  onChange={(e) => setIntakeTemp(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full border-2 border-cyan-500 rounded-xl px-4 py-3 text-xl font-mono font-black text-gray-900 focus:ring-4 focus:ring-cyan-500/20 outline-none"
                />
                <span className="absolute end-4 top-3 text-sm font-bold text-gray-500">°Celsius</span>
              </div>

              {/* LIVE COMPLIANCE STATUS BOX */}
              <div className="mt-3">
                {isColdEnough(intakeTemp) ? (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex items-start gap-3">
                    <span className="text-xl">✅</span>
                    <div className="text-xs text-emerald-900">
                      <strong className="block font-bold text-emerald-800">Sub-Zero Quality Pass ({intakeTemp}°C ≤ -18°C)</strong>
                      Batch meets the required sub-zero threshold. It will be immediately activated into sellable inventory for hub orders.
                    </div>
                  </div>
                ) : (
                  <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 flex items-start gap-3 animate-pulse">
                    <span className="text-xl">🚨</span>
                    <div className="text-xs text-rose-900">
                      <strong className="block font-bold text-rose-800">COLD CHAIN BREACH VIOLATION ({intakeTemp}°C &gt; -18°C)</strong>
                      Warning: Measured temperature exceeds -18°C. Submitting this intake will automatically mark the batch as{' '}
                      <strong>QUARANTINED</strong>. Quarantined batches cannot be dispatched to customers.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} className="text-sm">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submittingIntake}
            className={`text-sm px-6 py-2.5 font-bold shadow-md text-white ${
              isColdEnough(intakeTemp) ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {submittingIntake ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">🔄</span> Processing Intake...
              </span>
            ) : isColdEnough(intakeTemp) ? (
              '❄️ Confirm Sub-Zero Intake (Sellable)'
            ) : (
              '🚨 Confirm Quarantine Intake (Hold)'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
