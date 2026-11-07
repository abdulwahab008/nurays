'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCommunityStore } from '@/lib/store/community-store';
import { Community, communityService } from '@/lib/services/community.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { MapPin, Navigation, Search, X, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { groupAreasByCity } from './saved-area';

interface CommunitySelectorProps {
  variant?: 'navbar' | 'compact' | 'hero';
}

export function CommunitySelector({ variant = 'navbar' }: CommunitySelectorProps) {
  const t = useT(shellMessages);
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    selectedCommunity,
    communities,
    loadCommunities,
    setSelectedCommunity,
    detectCommunityFromGPS,
    resolveCommunityFromText,
    restoreSavedArea,
    isDetecting,
    isSelectorModalOpen,
    closeSelectorModal,
  } = useCommunityStore(
    useShallow((s) => ({
      selectedCommunity: s.selectedCommunity,
      communities: s.communities,
      loadCommunities: s.loadCommunities,
      setSelectedCommunity: s.setSelectedCommunity,
      detectCommunityFromGPS: s.detectCommunityFromGPS,
      resolveCommunityFromText: s.resolveCommunityFromText,
      restoreSavedArea: s.restoreSavedArea,
      isDetecting: s.isDetecting,
      isSelectorModalOpen: s.isSelectorModalOpen,
      closeSelectorModal: s.closeSelectorModal,
    })),
  );

  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();

  const isOpen = localIsOpen || isSelectorModalOpen;

  const handleClose = () => {
    setLocalIsOpen(false);
    closeSelectorModal();
    setSearchQuery('');
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  // A signed-in customer gets back the area they chose before (or their address's) instead of "Choose your area".
  const userType = user?.userType || user?.user_type;
  useEffect(() => {
    if (!isAuthenticated || !user?.id || (userType && userType !== 'customer')) return;
    void restoreSavedArea(user.id, user.profile);
  }, [isAuthenticated, user?.id, user?.profile, userType, restoreSavedArea]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLocalIsOpen(false);
        closeSelectorModal();
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, closeSelectorModal]);

  const handleSelect = async (comm: Community) => {
    setSelectedCommunity(comm);
    handleClose();
    showToast(t('locationSet', { name: comm.name }), 'info');
    if (isAuthenticated) {
      try {
        await communityService.setPrimaryCommunity(comm.id);
      } catch {
        // The area still applies on this device; it just is not remembered on the account.
      }
    }
  };

  const handleGPSDetect = async () => {
    const { community: detected, reason } = await detectCommunityFromGPS();
    if (detected) {
      showToast(t('locationDetected', { name: detected.name }), 'success');
      handleClose();
    } else {
      showToast(t(reason === 'outside' ? 'gpsOutsideAreas' : 'gpsFailed'), reason === 'outside' ? 'info' : 'error');
    }
  };

  const smartMatch = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return resolveCommunityFromText(searchQuery);
  }, [searchQuery, resolveCommunityFromText]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((comm) =>
      [comm.name, comm.city, comm.areaDescription || ''].some((v) => v.toLowerCase().includes(q)),
    );
  }, [communities, searchQuery]);

  const groups = useMemo(
    () => groupAreasByCity(visible, selectedCommunity?.city || user?.profile?.city),
    [visible, selectedCommunity?.city, user?.profile?.city],
  );

  const onWhite = variant !== 'hero';

  return (
    <>
      <button
        type="button"
        onClick={() => setLocalIsOpen(true)}
        className={`group inline-flex max-w-full items-center gap-1 sm:gap-2 border transition-colors text-start ${
          variant === 'navbar'
            ? 'h-11 rounded-xl px-1.5 sm:px-3 border-line bg-surface hover:bg-raised text-ink'
            : variant === 'hero'
            ? 'min-h-11 rounded-full px-4 border-brand/40 bg-brand/10 hover:bg-brand/20 text-white'
            : 'min-h-11 rounded-full px-3 text-xs border-line bg-raised text-ink'
        }`}
        aria-label={t('changeLocation')}
      >
        <MapPin
          className={`h-4 w-4 shrink-0 ${onWhite ? 'text-brand-ink' : 'text-white'} ${variant === 'navbar' ? 'max-sm:hidden' : ''}`}
          aria-hidden
        />
        <span className="flex min-w-0 flex-col">
          <span className={`text-[11px] font-medium leading-none max-sm:hidden ${onWhite ? 'text-muted' : 'text-white/80'}`}>
            {selectedCommunity ? t('deliveringTo') : t('yourArea')}
          </span>
          <span
            dir="auto"
            className={`text-[13px] sm:text-sm font-bold truncate sm:max-w-[170px] leading-tight sm:mt-0.5 ${
              onWhite ? 'text-ink' : 'text-white'
            }`}
          >
            {selectedCommunity ? selectedCommunity.name : t('chooseArea')}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 ${onWhite ? 'text-muted' : 'text-white/80'} ${variant === 'navbar' ? 'max-sm:hidden' : ''}`} aria-hidden />
      </button>

      {mounted &&
        isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center sm:p-6 bg-[rgba(6,20,18,0.55)] animate-in fade-in duration-150"
            onClick={handleClose}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="area-picker-title"
              className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl border border-line bg-surface shadow-xl pb-(--safe-bottom) sm:pb-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
                <div className="min-w-0">
                  <h3 id="area-picker-title" className="text-lg font-bold text-ink">
                    {t('deliveryLocation')}
                  </h3>
                  <p className="text-sm text-muted mt-0.5">
                    {selectedCommunity
                      ? t('deliveringToArea', { name: selectedCommunity.name, city: selectedCommunity.city })
                      : t('deliveryLocationSub')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={t('closeDialog')}
                  className="h-11 w-11 shrink-0 rounded-full bg-raised text-muted hover:text-ink flex items-center justify-center"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="px-4 sm:px-6 pt-4 space-y-2">
                <button
                  type="button"
                  onClick={handleGPSDetect}
                  disabled={isDetecting}
                  className="w-full min-h-12 px-3 rounded-xl border border-line hover:bg-raised text-ink text-sm font-semibold flex items-center gap-3 text-start disabled:opacity-70"
                >
                  {isDetecting ? (
                    <span className="h-4 w-4 border-2 border-brand-ink border-t-transparent rounded-full animate-spin" aria-hidden />
                  ) : (
                    <Navigation className="h-4 w-4 text-brand-ink" aria-hidden />
                  )}
                  <span className="flex-1">{isDetecting ? t('detectingGps') : t('useGps')}</span>
                  <ChevronRight className="h-4 w-4 text-muted rtl:-scale-x-100" aria-hidden />
                </button>

                <div className="relative">
                  <Search className="w-4 h-4 text-muted absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('searchSociety')}
                    aria-label={t('searchSociety')}
                    className="w-full h-12 ps-10 pe-11 rounded-xl bg-raised border border-transparent text-[15px] text-ink placeholder:text-muted focus:bg-surface focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label={t('clearSearch')}
                      className="absolute end-1 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full flex items-center justify-center text-muted hover:text-ink"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>

                {smartMatch?.community && !visible.some((c) => c.id === smartMatch.community.id) && (
                  <button
                    type="button"
                    onClick={() => handleSelect(smartMatch.community)}
                    className="w-full min-h-12 px-3 rounded-xl bg-brand-soft text-start flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-brand-soft-ink">{t('smartMatch')}</span>
                      <span className="block text-sm font-semibold text-ink truncate">
                        {smartMatch.community.name}, {smartMatch.community.city}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-brand-ink">{t('select')}</span>
                  </button>
                )}
              </div>

              <div className="mt-3 flex-1 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6 custom-scrollbar">
                {groups.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">{t('noSocieties')}</p>
                ) : (
                  groups.map((group) => (
                    <section key={group.city} className="pt-2">
                      <h4 className="py-2 text-sm font-semibold text-ink">{group.city}</h4>
                      <ul className="divide-y divide-line border-y border-line">
                        {group.areas.map((comm) => (
                          <li key={comm.id}>{renderCommunityRow(comm)}</li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  function renderCommunityRow(comm: Community) {
    const isSelected = selectedCommunity?.id === comm.id || selectedCommunity?.slug === comm.slug;
    const kitchens = comm.sellerCount ?? 0;
    return (
      <button
        type="button"
        onClick={() => handleSelect(comm)}
        aria-pressed={isSelected}
        className={`w-full text-start min-h-14 px-2 py-2 flex items-center justify-between gap-3 transition-colors ${
          isSelected ? 'bg-brand-soft' : 'hover:bg-raised'
        }`}
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink truncate">{comm.name}</span>
          {(comm.areaDescription || kitchens > 0) && (
            <span className="block text-xs text-muted truncate mt-0.5">
              {[kitchens > 0 ? t(kitchens === 1 ? 'kitchenInArea' : 'kitchensInArea', { count: kitchens }) : null, comm.areaDescription]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </span>
        {isSelected ? (
          <span className="shrink-0 h-6 w-6 rounded-full bg-brand text-on-brand flex items-center justify-center" aria-label={t('selected')}>
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
          </span>
        ) : null}
      </button>
    );
  }
}
