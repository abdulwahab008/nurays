'use client';

/** Quarantining or releasing one batch, with the reason that goes into the audit log. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { serverMessageOf } from '@/lib/load-error';
import type { HubBatch } from '@/lib/hub-console';

export default function BatchStatusModal({
  hubId,
  batch,
  onClose,
  onSaved,
}: {
  hubId: string;
  batch: HubBatch;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const releasing = batch.status !== 'available';
  const [newStatusChoice, setNewStatusChoice] = useState<'available' | 'damaged'>(releasing ? 'available' : 'damaged');
  const [statusReason, setStatusReason] = useState(
    releasing ? 'Quality probe re-verified at sub-zero frost; released to sellable' : 'Secondary physical inspection quarantine flag',
  );
  const [updating, setUpdating] = useState(false);

  const handleStatusUpdate = async () => {
    try {
      setUpdating(true);
      const res = await apiClient.patch(`/hubs/${hubId}/batches/${batch.id}/status`, {
        status: newStatusChoice,
        reason: statusReason.trim() || undefined,
      });
      if (res.data.success) {
        showToast(
          `Batch ${batch.batchNumber} status updated to ${newStatusChoice === 'available' ? 'Available (Sellable)' : 'Quarantined (Damaged)'}`,
          'success',
        );
        onClose();
        await onSaved();
      }
    } catch (err: unknown) {
      showToast(serverMessageOf(err) || 'Failed to update batch status', 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-200">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-base">Update Batch Status: {batch.batchNumber}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-600 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-gray-600">
            Product: <strong className="text-gray-900">{batch.product.name}</strong>
          </p>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Change Status To:</label>
            <select
              value={newStatusChoice}
              onChange={(e) => setNewStatusChoice(e.target.value as 'available' | 'damaged')}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-cyan-500 outline-none"
            >
              <option value="available">🟢 Available (Release to Sellable Inventory)</option>
              <option value="damaged">🛡️ Quarantined (Hold from Customer Orders)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-gray-700 mb-1">Reason for Audit Log *</label>
            <textarea
              rows={3}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Describe reason for state change..."
              className="w-full border border-gray-300 rounded-xl p-3 text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleStatusUpdate}
            disabled={updating}
            className={
              newStatusChoice === 'available'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold'
                : 'bg-rose-600 hover:bg-rose-700 text-white font-bold'
            }
          >
            {updating ? 'Updating...' : 'Save & Log Audit'}
          </Button>
        </div>
      </div>
    </div>
  );
}
