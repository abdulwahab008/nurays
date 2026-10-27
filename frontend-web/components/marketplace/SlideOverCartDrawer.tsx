'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  X,
  ShieldCheck,
  ArrowRight,
  Bike,
} from 'lucide-react';
import { useCartStore } from '@/lib/store/cart-store';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { commonMessages } from '@/lib/i18n/messages/common';
import { useShallow } from 'zustand/react/shallow';

interface SlideOverCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SlideOverCartDrawer({ isOpen, onClose }: SlideOverCartDrawerProps) {
  const { items, updateItem, removeItem, clearCart, getTotal, getItemCount } = useCartStore(useShallow((s) => ({ items: s.items, updateItem: s.updateItem, removeItem: s.removeItem, clearCart: s.clearCart, getTotal: s.getTotal, getItemCount: s.getItemCount })));
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
  // Delivery depends on the kitchen's own terms and the address, so the tray page and checkout work it out; nothing is guessed here.
  const kitchenName = items[0]?.sellerName;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="fixed inset-0 bg-[rgba(6,20,18,0.55)] transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 end-0 max-w-full flex ps-10">
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tray-title"
          className="w-screen max-w-md pt-(--safe-top) pb-(--safe-bottom) pe-(--safe-end) bg-page shadow-2xl flex flex-col transform transition-transform ease-out duration-300 animate-in slide-in-from-right"
        >
          <div className="h-16 px-2 border-b border-line bg-surface flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-11 h-11 rounded-xl flex items-center justify-center text-ink hover:bg-raised transition-colors"
              aria-label={t('closeCart')}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 id="tray-title" className="text-lg font-extrabold text-ink leading-tight">{t('trayTitle')}</h2>
              <p className="text-xs text-muted truncate">
                {kitchenName ? t('trayFrom', { kitchen: kitchenName }) : t(itemCount === 1 ? 'trayCountOne' : 'trayCount', { n: itemCount })}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mb-4">
                  <ShoppingBag className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-extrabold text-ink">{t('emptyTray')}</h3>
                <p className="text-sm text-muted mt-1 max-w-[260px] leading-relaxed">{t('emptyTrayBody')}</p>
                <button
                  onClick={onClose}
                  className="mt-5 inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-brand hover:bg-brand-500 text-on-brand text-sm font-extrabold transition-colors"
                >
                  <span>{t('exploreKitchens')}</span>
                  <ArrowRight className="rtl:-scale-x-100 w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="bg-surface border border-line rounded-[18px] px-3.5 divide-y divide-line">
                {items.map((item) => (
                  <div key={item.id} className="py-3 flex gap-3 items-center">
                    <div className="w-[52px] h-[52px] rounded-xl bg-raised overflow-hidden flex-shrink-0">
                      {item.productImage ? (
                        <img src={item.productImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted">
                          <ShoppingBag className="w-5 h-5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-[15px] font-bold text-ink leading-snug line-clamp-2">{item.productName}</h4>
                      <span className="text-sm font-bold text-muted">{formatPrice(item.subtotal)}</span>
                    </div>

                    <div className="flex items-center h-10 rounded-xl border border-line flex-shrink-0">
                      {item.quantity > 1 ? (
                        <button
                          onClick={() => updateItem(item.id, item.quantity - 1)}
                          aria-label={t('decreaseNamed', { name: item.productName })}
                          className="w-10 h-10 flex items-center justify-center text-ink hover:bg-raised rounded-s-xl transition-colors"
                        >
                          <Minus className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                      ) : (
                        <button
                          onClick={() => removeItem(item.id)}
                          aria-label={t('removeNamed', { name: item.productName })}
                          className="w-10 h-10 flex items-center justify-center text-muted hover:text-red-600 hover:bg-raised rounded-s-xl transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <span className="min-w-5 text-center text-sm font-extrabold text-ink" aria-live="polite">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateItem(item.id, item.quantity + 1)}
                        aria-label={t('increaseNamed', { name: item.productName })}
                        className="w-10 h-10 flex items-center justify-center text-brand-ink hover:bg-raised rounded-e-xl transition-colors"
                      >
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="mt-3.5 bg-surface border border-line rounded-[18px] p-3.5 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted">{tc('subtotal')}</span>
                  <span className="font-semibold text-ink">{formatPrice(total)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted flex items-center gap-1.5">
                    <Bike className="w-4 h-4" aria-hidden />
                    <span>{tc('delivery')}</span>
                  </span>
                  <span className="font-semibold text-muted text-end">{t('deliveryAtCheckout')}</span>
                </div>
                <button
                  onClick={clearCart}
                  className="pt-1 text-sm font-bold text-muted hover:text-red-600 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" aria-hidden />
                  <span>{t('clearTray')}</span>
                </button>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="p-4 pt-3 border-t border-line bg-surface space-y-2">
              <Link
                href="/checkout"
                onClick={onClose}
                className="h-14 rounded-2xl text-base font-extrabold bg-brand hover:bg-brand-500 text-on-brand flex items-center justify-center gap-2 transition-colors"
              >
                <span>{t('goCheckout')}</span>
                <span aria-hidden>·</span>
                <span>{formatPrice(total)}</span>
              </Link>
              <p className="text-xs text-center text-muted flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                <span>{t('protected')}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
