'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Store, Calendar, ArrowRight, X, AlertCircle } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { kitchenMessages } from '@/lib/i18n/messages/kitchen';

/** Fills {name} slots in a translated sentence with elements (bold text etc.). */
function fillSlots(template: string, slots: Record<string, React.ReactNode>) {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <React.Fragment key={i}>{name && name in slots ? slots[name] : part}</React.Fragment>;
  });
}

export interface ClosedKitchenModalProps {
  isOpen: boolean;
  onClose: () => void;
  kitchenName: string;
  chefName?: string;
  avatar?: string | null;
  opensAt?: string; // e.g. "7:00 PM" or "Tomorrow at 11:30 AM"
  allowsPreOrder?: boolean;
  nextAvailableSlot?: string; // e.g. "Today 7:00 PM – 8:30 PM"
  onProceedToMenu?: () => void;
  onBrowseOpenKitchens?: () => void;
}

export function ClosedKitchenModal({
  isOpen,
  onClose,
  kitchenName,
  chefName,
  avatar,
  opensAt = '7:00 PM',
  allowsPreOrder = true,
  nextAvailableSlot: nextAvailableSlotProp,
  onProceedToMenu,
  onBrowseOpenKitchens,
}: ClosedKitchenModalProps) {
  const router = useRouter();
  const t = useT(kitchenMessages);
  const nextAvailableSlot = nextAvailableSlotProp ?? t('defaultSlot');

  if (!isOpen) return null;

  const handleBrowseOpen = () => {
    onClose();
    if (onBrowseOpenKitchens) {
      onBrowseOpenKitchens();
    } else {
      router.push('/products?openNow=true&view=kitchens');
    }
  };

  const handleViewMenu = () => {
    onClose();
    if (onProceedToMenu) {
      onProceedToMenu();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle accent glow */}
        <div className="absolute top-0 end-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 end-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title={t('closeModal')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon & Title */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shrink-0 shadow-2xs">
            <Store className="w-6 h-6 text-amber-600" />
          </div>

          <div className="min-w-0 pe-6">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-bold uppercase tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span>{t('closedInstant')}</span>
            </div>
            <h3 className="text-lg font-black text-slate-900 leading-tight truncate">
              {kitchenName}
            </h3>
            {chefName && (
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                {t('cookedBy', { name: chefName })}
              </p>
            )}
          </div>
        </div>

        {/* Scheduled Timeline & Pre-Order Explainer */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 mb-5 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Clock className="w-4 h-4 text-[#FF5500]" />
            <span>{t('availabilityTitle')}</span>
          </div>

          {allowsPreOrder ? (
            <p className="text-xs text-slate-600 leading-relaxed">
              {fillSlots(t('preorderText'), {
                strong: <strong className="text-slate-900 font-semibold">{t('preorderStrong')}</strong>,
                time: <span className="text-[#FF5500] font-bold">{opensAt}</span>,
              })}
            </p>
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed">
              {fillSlots(t('restingText'), {
                time: <strong className="text-slate-900 font-semibold">{opensAt}</strong>,
              })}
            </p>
          )}

          {allowsPreOrder && nextAvailableSlot && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-amber-200 text-xs font-semibold text-amber-900">
              <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">{t('nextSlot', { slot: nextAvailableSlot })}</span>
            </div>
          )}
        </div>

        {/* Dual Actions */}
        <div className="space-y-2.5">
          {allowsPreOrder ? (
            <button
              type="button"
              onClick={handleViewMenu}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#FF5500] hover:bg-[#e04400] text-white font-bold text-xs sm:text-sm transition-all shadow-md active:scale-98 cursor-pointer"
            >
              <span>{t('browsePreorder', { time: opensAt })}</span>
              <ArrowRight className="rtl:-scale-x-100 w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleViewMenu}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              <span>{t('browseOnly')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleBrowseOpen}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            {t('browseOpenNow')}
          </button>
        </div>

        {/* Small Notice */}
        <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center">
          <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>{t('instantDisabled')}</span>
        </div>
      </div>
    </div>
  );
}
export default ClosedKitchenModal;
