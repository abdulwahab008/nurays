import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

/** The bar's usual button: open the tray. */
export function ViewTrayLink({ label }: { label: string }) {
  return (
    <Link
      href="/cart"
      className="inline-flex items-center gap-1 h-11 px-4 rounded-xl bg-brand hover:bg-brand-500 text-on-brand text-sm font-extrabold transition-colors"
    >
      <span>{label}</span>
      <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
    </Link>
  );
}

/** The floating bar with the tray's dish count and total, above the phone tab bar. `action` is its button. */
export function TrayBar({ count, total, label, action }: { count: number; total: number; label: string; action: ReactNode }) {
  return (
    <div className="fixed bottom-[calc(1.5rem+var(--safe-bottom)+var(--tabbar-offset))] inset-x-0 z-50 flex justify-center px-4">
      <div className="bg-[#0D2624] text-white p-2.5 ps-3 rounded-[18px] shadow-xl flex items-center justify-between gap-4 max-w-lg w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-on-brand font-extrabold text-sm">{count}</div>
          <div>
            <div className="text-xs text-[#A3BCB7] font-semibold">{label}</div>
            <div className="text-base font-extrabold text-white">{formatPrice(total)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">{action}</div>
      </div>
    </div>
  );
}
