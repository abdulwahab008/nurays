'use client';

import React from 'react';
import { Store, AlertTriangle, ArrowRight, X, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
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

export default function CartConflictModal({
  isOpen,
  conflict,
  loading = false,
}: CartConflictModalProps) {
  const t = useT(checkoutMessages);
  const tc = useT(commonMessages);
  if (!isOpen || !conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-[var(--shadow-hover)] border border-slate-200 overflow-hidden">
        {/* Close button */}
        <button
          onClick={conflict.onCancel}
          disabled={loading}
          className="absolute top-4 end-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
          aria-label={tc('close')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon */}
        <div className="pt-8 pb-4 px-6 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center ring-8 ring-amber-50">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 tracking-tight">
            {t('conflictTitle')}
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
            {t('conflictText')}
          </p>
        </div>

        {/* Transition Comparison Box */}
        <div className="mx-6 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500 text-[11px]">
              {t('currentCart')}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold text-[11px]">
              {t('willBeCleared')}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <Store className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span className="font-semibold text-slate-800 text-sm truncate">
              {conflict.existingSellerName || t('previousKitchen')}
            </span>
          </div>

          <div className="flex items-center justify-center my-1 text-slate-500">
            <ArrowRight className="rtl:-scale-x-100 w-4 h-4 rotate-90 text-brand-ink" />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-brand-ink text-[11px]">
              {t('newKitchen')}
            </span>
            <span className="px-2 py-0.5 rounded bg-brand-100 text-brand-ink font-semibold text-[11px]">
              {t('newOrder')}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-md bg-brand text-on-brand flex items-center justify-center flex-shrink-0">
              <ChefHat className="w-3 h-3" aria-hidden />
            </div>
            <span className="font-semibold text-slate-950 text-sm truncate">
              {conflict.newSellerName || t('newHomeKitchen')}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 pt-5 space-y-2.5">
          <button
            onClick={conflict.onConfirmClearAndAdd}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl font-semibold text-xs text-on-brand bg-brand hover:bg-brand-500 active:scale-[0.98] transition-[color,background-color,border-color,opacity,transform] shadow-md flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{t('updatingCart')}</span>
              </>
            ) : (
              <span>{t('clearAndAdd')}</span>
            )}
          </button>

          <button
            onClick={conflict.onCancel}
            disabled={loading}
            className="w-full py-3 px-4 rounded-2xl font-semibold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition-[color,background-color,border-color,opacity,transform] text-center"
          >
            {t('keepExisting')}
          </button>
        </div>
      </div>
    </div>
  );
}
