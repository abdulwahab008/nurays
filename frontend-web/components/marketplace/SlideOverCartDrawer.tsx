'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  ChefHat,
  Trash2,
  Plus,
  Minus,
  X,
  ShieldCheck,
  Check,
  Sparkles,
  ArrowRight,
  Bike,
} from 'lucide-react';
import { useCartStore } from '@/lib/store/cart-store';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { commonMessages } from '@/lib/i18n/messages/common';

interface SlideOverCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SlideOverCartDrawer({ isOpen, onClose }: SlideOverCartDrawerProps) {
  const { items, updateItem, removeItem, clearCart, getTotal, getItemCount } = useCartStore();
  const drawerRef = useRef<HTMLDivElement>(null);
  const t = useT(homeMessages);
  const tc = useT(commonMessages);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const total = getTotal();
  const itemCount = getItemCount();
  const deliveryFee = total > 1000 || total === 0 ? 0 : 90;
  const freeDeliveryThreshold = 1000;
  const amountNeededForFreeDelivery = Math.max(0, freeDeliveryThreshold - total);
  const progressPercent = Math.min(100, Math.round((total / freeDeliveryThreshold) * 100));

  // "Add {amount} more…": the amount is styled, so the sentence is split around it.
  const [addMoreBefore, addMoreAfter = ''] = t('addMore').split('{amount}');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 end-0 max-w-full flex ps-10">
        <div
          ref={drawerRef}
          className="w-screen max-w-md pt-(--safe-top) pb-(--safe-bottom) pe-(--safe-end) bg-white shadow-2xl flex flex-col transform transition-transform ease-out duration-300 animate-in slide-in-from-right"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#FF5500] border border-orange-200/60 flex items-center justify-center font-bold">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-tight">{t('trayTitle')}</h2>
                <p className="text-[11px] font-medium text-slate-500">
                  {t(itemCount === 1 ? 'trayCountOne' : 'trayCount', { n: itemCount })}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              aria-label={t('closeCart')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Free Delivery Progress Bar */}
          <div className="px-4 py-2.5 bg-orange-50/70 border-b border-orange-100">
            <div className="flex items-center justify-between text-xs font-semibold text-orange-950 mb-1">
              <span>
                {amountNeededForFreeDelivery === 0 ? (
                  <span className="text-emerald-700 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t('unlockedFree')}</span>
                  </span>
                ) : (
                  <>
                    {addMoreBefore}
                    <span className="text-[#FF5500] font-bold">{formatPrice(amountNeededForFreeDelivery)}</span>
                    {addMoreAfter}
                  </>
                )}
              </span>
              <span className="text-[11px] text-orange-800/80 font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-orange-200/70 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#FF5500] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 border border-slate-200/60">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">{t('emptyTray')}</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[240px] leading-relaxed font-medium">
                  {t('emptyTrayBody')}
                </p>
                <button
                  onClick={onClose}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold transition-colors"
                >
                  <span>{t('exploreKitchens')}</span>
                  <ArrowRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="pt-3 first:pt-0 flex gap-3 items-start">
                  {/* Item Image */}
                  <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                    {item.productImage ? (
                      <img
                        src={item.productImage}
                        alt={item.productName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {/* Item Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-1">
                        {item.productName}
                      </h4>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-slate-400 hover:text-red-500 text-xs transition-colors p-0.5"
                        title={t('removeItem')}
                        aria-label={t('removeItem')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5 flex items-center gap-1">
                      <ChefHat className="w-3 h-3 text-slate-400" />
                      <span>{item.sellerName || t('verifiedHomeKitchen')}</span>
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      {/* Quantity Controls */}
                      <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-1.5 py-0.5 border border-slate-200">
                        <button
                          onClick={() => updateItem(item.id, item.quantity - 1)}
                          aria-label={t('decrease')}
                          className="w-4 h-4 rounded flex items-center justify-center text-slate-600 hover:bg-white transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-slate-900 min-w-[14px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateItem(item.id, item.quantity + 1)}
                          aria-label={t('increase')}
                          className="w-4 h-4 rounded flex items-center justify-center text-slate-600 hover:bg-white transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Price */}
                      <span className="text-xs font-bold text-slate-950">
                        {formatPrice(item.subtotal)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="p-4 border-t border-slate-200 bg-slate-50/70 space-y-3">
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-600 font-medium">
                  <span>{tc('subtotal')}</span>
                  <span className="text-slate-900 font-semibold">{formatPrice(total)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Bike className="w-3.5 h-3.5 text-slate-400" />
                    <span>{tc('delivery')}</span>
                    {deliveryFee === 0 && (
                      <span className="text-[11px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                        {t('freeTag')}
                      </span>
                    )}
                  </span>
                  <span className="text-slate-900 font-semibold">
                    {deliveryFee === 0 ? 'Rs 0' : formatPrice(deliveryFee)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-bold text-slate-950">
                  <span>{tc('total')}</span>
                  <span className="text-[#FF5500] text-base">{formatPrice(total + deliveryFee)}</span>
                </div>
              </div>

              <div className="pt-1 flex items-center gap-2">
                <button
                  onClick={clearCart}
                  className="px-3 py-2.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors"
                  title={t('clearTray')}
                  aria-label={t('clearTray')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <Link
                  href="/checkout"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-[#FF5500] hover:bg-[#E04400] text-white flex items-center justify-center gap-2 transition-all shadow-xs"
                >
                  <span>{t('goCheckout')}</span>
                  <ArrowRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                </Link>
              </div>

              <p className="text-[11px] text-center text-slate-400 font-medium flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3 text-slate-400 inline" />
                <span>{t('protected')}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
