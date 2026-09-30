'use client';

import React from 'react';
import { Store, AlertTriangle, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  if (!isOpen || !conflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Close button */}
        <button
          onClick={conflict.onCancel}
          disabled={loading}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon */}
        <div className="pt-8 pb-4 px-6 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center ring-8 ring-amber-50">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">
            Start Order from a New Kitchen?
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
            Our home chefs prepare meals fresh in domestic kitchens. To ensure peak freshness and direct delivery, each order is fulfilled by one kitchen at a time.
          </p>
        </div>

        {/* Transition Comparison Box */}
        <div className="mx-6 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
              Current Cart
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-black text-[10px]">
              Will be cleared
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <Store className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <span className="font-extrabold text-slate-800 text-sm truncate">
              {conflict.existingSellerName || 'Previous Home Kitchen'}
            </span>
          </div>

          <div className="flex items-center justify-center my-1 text-slate-400">
            <ArrowRight className="w-4 h-4 rotate-90 text-[#FF5500]" />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#FF5500] uppercase tracking-wider text-[10px]">
              New Kitchen
            </span>
            <span className="px-2 py-0.5 rounded bg-orange-100 text-[#FF5500] font-black text-[10px]">
              New Order
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-md bg-[#FF5500] text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">
              👩‍🍳
            </div>
            <span className="font-black text-slate-950 text-sm truncate">
              {conflict.newSellerName || 'New Home Kitchen'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 pt-5 space-y-2.5">
          <button
            onClick={conflict.onConfirmClearAndAdd}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl font-black text-xs text-white bg-[#FF5500] hover:bg-[#e04400] active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Updating Cart...</span>
              </>
            ) : (
              <span>Clear Cart &amp; Add New Dish</span>
            )}
          </button>

          <button
            onClick={conflict.onCancel}
            disabled={loading}
            className="w-full py-3 px-4 rounded-2xl font-extrabold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition-all text-center"
          >
            Keep Existing Items
          </button>
        </div>
      </div>
    </div>
  );
}
