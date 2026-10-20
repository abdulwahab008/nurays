'use client';

/** The home page's loading, empty and error states: a section says it could not load, with Try again, never "none". */
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';

export function SectionNotice({
  title,
  message,
  action,
  role,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div role={role} className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {message && <p className="text-xs text-slate-500 font-medium mt-1 max-w-md mx-auto">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  const t = useT(homeMessages);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      <span>{t('tryAgain')}</span>
    </button>
  );
}

export function KitchenAvatarSkeleton() {
  return (
    <div aria-hidden="true" className="flex-shrink-0 flex flex-col items-center gap-1.5">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-200 animate-pulse" />
      <div className="h-2.5 w-16 rounded bg-slate-200 animate-pulse" />
      <div className="h-2 w-10 rounded bg-slate-100 animate-pulse" />
    </div>
  );
}

export function KitchenCardSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="aspect-[16/10] w-full bg-slate-200 animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-slate-200 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded bg-slate-200 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
        <div className="h-2.5 w-3/4 rounded bg-slate-100 animate-pulse" />
        <div className="pt-2.5 border-t border-slate-100 flex gap-1">
          <div className="h-4 w-16 rounded-md bg-slate-100 animate-pulse" />
          <div className="h-4 w-12 rounded-md bg-slate-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function DishCardSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <div className="aspect-square bg-slate-200 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-2.5 w-2/3 rounded bg-slate-100 animate-pulse" />
        <div className="h-3 w-full rounded bg-slate-200 animate-pulse" />
        <div className="pt-2 border-t border-slate-100">
          <div className="h-3 w-1/3 rounded bg-slate-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
