'use client';

import { useEffect } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from './button';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const t = useT(shellMessages);
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] sm:pb-6 shadow-2xl border border-line"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              aria-hidden="true"
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                isDanger ? 'bg-red-50 text-red-700' : 'bg-accent-soft text-accent-soft-ink'
              }`}
            >
              {isDanger ? <Trash2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-ink leading-snug">
              {title}
            </h3>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="w-11 h-11 -me-2 -mt-1 rounded-full text-muted hover:text-ink hover:bg-raised flex items-center justify-center transition-colors disabled:opacity-50 shrink-0"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <p id="confirm-dialog-message" className="text-[15px] text-muted leading-relaxed mt-3">{message}</p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6">
          <Button type="button" variant="outline" disabled={loading} onClick={onCancel} className="min-h-11">
            {cancelText ?? t('cancel')}
          </Button>
          {/* Words on turquoise are dark (text-on-brand, from the default variant); white only on the red. */}
          <Button type="button" variant={isDanger ? 'destructive' : 'default'} disabled={loading} onClick={onConfirm} className="min-h-11 sm:min-w-28">
            {loading ? (
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>{t('clearing')}</span>
              </span>
            ) : (
              confirmText ?? t('confirm')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
