'use client';

/**
 * Adding a dish from a second kitchen: a tray holds one kitchen's dishes, so the person chooses between keeping the tray
 * and emptying it for the new dish. The same question dialog as the rest of the app (ConfirmModal).
 */
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useT } from '@/lib/i18n';
import { checkoutMessages } from '@/lib/i18n/messages/checkout';

export interface CartConflictInfo {
  existingSellerName: string;
  existingSellerId?: string;
  newSellerName: string;
  newSellerId?: string;
  onConfirmClearAndAdd: () => void | Promise<void>;
  onCancel: () => void;
}

interface CartConflictModalProps {
  isOpen: boolean;
  conflict: CartConflictInfo | null;
  loading?: boolean;
}

export default function CartConflictModal({ isOpen, conflict, loading = false }: CartConflictModalProps) {
  const t = useT(checkoutMessages);
  if (!conflict) return null;
  return (
    <ConfirmModal
      isOpen={isOpen}
      variant="warning"
      title={t('conflictTitle')}
      message={t('conflictMessage', {
        existing: conflict.existingSellerName || t('previousKitchen'),
        next: conflict.newSellerName || t('newHomeKitchen'),
      })}
      confirmText={t('clearAndAdd')}
      cancelText={t('keepExisting')}
      loading={loading}
      onConfirm={() => void conflict.onConfirmClearAndAdd()}
      onCancel={conflict.onCancel}
    />
  );
}
