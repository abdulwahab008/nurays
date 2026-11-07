'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle, CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { PageLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  /** Takes every message off the screen (a window that needs the person's attention is opening). */
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => setToasts([]), []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 5000) => {
    const id = Math.random().toString(36).substring(2, 9);
    const toast: Toast = { id, message, type, duration };

    // The same words shown again while they are still up (two loads of one page failing together) are one message.
    setToasts((prev) => (prev.some((t) => t.message === message && t.type === type) ? prev : [...prev, toast]));

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast, clearToasts }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    // Above every other layer (the new-order and job alerts, the dialogs, the community picker): a message about what just
    // failed must never sit hidden behind one. Only the messages themselves take clicks. Where they sit is .nuray-toaster in
    // globals.css: under the top bar, clear of every page's bottom action bar, and at the bottom while a top-bar panel is open.
    <div className="nuray-toaster fixed end-[calc(1rem+var(--safe-end))] z-[100000] flex flex-col gap-2 max-w-md w-[calc(100%-2rem)] pointer-events-none">
      {/* The corner follows the page's frame (the top bar's language); the words follow the page (English on admin pages). */}
      <PageLocale>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </PageLocale>
    </div>
  );
}

// One surface for every message; only the icon carries the colour, so a toast reads like the rest of the app.
const TOAST_ICON = { success: CircleCheck, error: CircleAlert, info: Info, warning: AlertTriangle };
const TOAST_TONE = { success: 'text-brand-ink', error: 'text-red-700', info: 'text-muted', warning: 'text-accent-700' };

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const t = useT(commonMessages);
  const Icon = TOAST_ICON[toast.type];
  const urgent = toast.type === 'error' || toast.type === 'warning';

  return (
    <div
      className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface ps-4 text-ink shadow-[var(--shadow-hover)] animate-in slide-in-from-end-full duration-300"
      role={urgent ? 'alert' : 'status'}
    >
      <Icon className={`mt-3.5 h-5 w-5 shrink-0 ${TOAST_TONE[toast.type]}`} aria-hidden="true" />
      <p className="flex-1 py-3.5 text-sm font-medium">{toast.message}</p>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:text-ink"
        aria-label={t('close')}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
