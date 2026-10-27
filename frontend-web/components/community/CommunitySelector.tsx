'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCommunityStore } from '@/lib/store/community-store';
import { Community, communityService } from '@/lib/services/community.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { MapPin, Navigation, Search, X, Check, ChevronDown, Sparkles } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

interface CommunitySelectorProps {
  variant?: 'navbar' | 'compact' | 'hero';
}

const CORE_LAHORE_SLUGS = ['askari-11', 'askari-10', 'dha-phase-5', 'dha-phase-6', 'dha-9-town'];

export function CommunitySelector({ variant = 'navbar' }: CommunitySelectorProps) {
  const t = useT(shellMessages);
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOtherCities, setShowOtherCities] = useState(false);

  const {
    selectedCommunity,
    communities,
    loadCommunities,
    setSelectedCommunity,
    detectCommunityFromGPS,
    resolveCommunityFromText,
    isDetecting,
    isSelectorModalOpen,
    openSelectorModal,
    closeSelectorModal,
  } = useCommunityStore(useShallow((s) => ({ selectedCommunity: s.selectedCommunity, communities: s.communities, loadCommunities: s.loadCommunities, setSelectedCommunity: s.setSelectedCommunity, detectCommunityFromGPS: s.detectCommunityFromGPS, resolveCommunityFromText: s.resolveCommunityFromText, isDetecting: s.isDetecting, isSelectorModalOpen: s.isSelectorModalOpen, openSelectorModal: s.openSelectorModal, closeSelectorModal: s.closeSelectorModal })));

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

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Select community handler
  const handleSelect = async (comm: Community) => {
    setSelectedCommunity(comm);
    handleClose();
    showToast(t('locationSet', { name: comm.name }), 'info');

    if (isAuthenticated) {
      try {
        await communityService.setPrimaryCommunity(comm.id);
      } catch {
        // Non-fatal
      }
    }
  };

  // GPS auto-detection with smart match
  const handleGPSDetect = async () => {
    const { community: detected, reason } = await detectCommunityFromGPS();
    if (detected) {
      showToast(t('locationDetected', { name: detected.name }), 'success');
      handleClose();
    } else {
      showToast(t(reason === 'outside' ? 'gpsOutsideAreas' : 'gpsFailed'), reason === 'outside' ? 'info' : 'error');
    }
  };

  // Live smart match based on user search text
  const smartMatch = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return resolveCommunityFromText(searchQuery);
  }, [searchQuery, resolveCommunityFromText]);

  // Split communities into Core Lahore societies and others
  const { coreCommunities, otherCommunities } = useMemo(() => {
    const core: Community[] = [];
    const others: Community[] = [];

    // Sort core societies in user-requested order
    for (const slug of CORE_LAHORE_SLUGS) {
      const match = communities.find((c) => c.slug === slug);
      if (match) core.push(match);
    }

    for (const c of communities) {
      if (!CORE_LAHORE_SLUGS.includes(c.slug)) {
        others.push(c);
      }
    }

    return { coreCommunities: core, otherCommunities: others };
  }, [communities]);

  // Filtered lists if search query is active
  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    return communities.filter((comm) => {
      const name = comm.name.toLowerCase();
      const city = comm.city.toLowerCase();
      const area = (comm.areaDescription || '').toLowerCase();
      return name.includes(q) || city.includes(q) || area.includes(q);
    });
  }, [communities, searchQuery]);

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setLocalIsOpen(true)}
        className={`group inline-flex max-w-full items-center gap-2.5 border transition-all text-start ${
          variant === 'navbar'
            ? 'h-11 rounded-xl px-3 border-line bg-surface hover:bg-raised text-ink active:scale-95'
            : variant === 'hero'
            ? 'rounded-full px-4 py-2 border-brand/40 bg-brand/10 hover:bg-brand/20 text-white shadow-lg active:scale-95'
            : 'rounded-full px-2.5 py-1 text-xs border-line bg-raised hover:bg-raised text-ink'
        }`}
        title={t('changeLocation')}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand"></span>
        </span>
        <div className="flex min-w-0 flex-col">
          <span
            className={`text-[9.5px] uppercase font-bold tracking-wider leading-none ${
              variant === 'navbar' ? 'text-muted' : 'text-muted'
            }`}
          >
            {selectedCommunity ? t('deliveringTo') : t('yourArea')}
          </span>
          <span
            className={`text-xs sm:text-sm font-extrabold truncate max-w-[130px] sm:max-w-[170px] leading-tight ${
              variant === 'navbar' ? 'text-ink' : 'text-white'
            }`}
          >
            {selectedCommunity ? selectedCommunity.name : t('chooseArea')}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5 shrink-0 ${
            variant === 'navbar' ? 'text-brand-ink' : 'text-muted'
          }`}
        />
      </button>

      {/* Clean, Nordic-Standard Modal */}
      {mounted &&
        isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={handleClose}
          >
            <div
              className="relative w-full max-w-lg rounded-3xl border border-line bg-surface p-5 sm:p-6 shadow-xl animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-line">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-ink">
                    {t('deliveryLocation')}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {t('deliveryLocationSub')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label={t('closeDialog')}
                  className="w-8 h-8 rounded-full bg-raised hover:bg-line text-muted hover:text-ink flex items-center justify-center transition-all active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Current Active Location Pill */}
              <div className="mt-3.5 p-3 rounded-2xl bg-brand-50/70 border border-brand-200/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-brand text-on-brand flex items-center justify-center shrink-0 shadow-2xs">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-brand-800 uppercase tracking-wider">
                      {t('currentLocation')}
                    </p>
                    <p className="text-xs font-bold text-ink truncate">
                      {selectedCommunity ? `${selectedCommunity.name}, ${selectedCommunity.city}` : t('noAreaYet')}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-brand-soft-ink bg-brand-soft px-2 py-0.5 rounded-full shrink-0">
                  {t('active')}
                </span>
              </div>

              {/* GPS Auto-Detect Button */}
              <button
                type="button"
                onClick={handleGPSDetect}
                disabled={isDetecting}
                className="w-full mt-3 p-3 rounded-2xl border border-line hover:border-brand-300 hover:bg-brand-50/40 text-ink font-semibold text-xs transition flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-raised group-hover:bg-brand text-muted group-hover:text-on-brand flex items-center justify-center transition-colors">
                    {isDetecting ? (
                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Navigation className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span>{isDetecting ? t('detectingGps') : t('useGps')}</span>
                </div>
                <span className="text-[11px] font-bold text-brand-ink group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform">
                  {t('detect')}
                </span>
              </button>

              {/* Minimal Search Bar */}
              <div className="relative mt-3">
                <Search className="w-4 h-4 text-muted absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchSociety')}
                  className="w-full h-10 ps-9 pe-8 rounded-xl bg-raised border border-line text-xs font-medium text-ink placeholder:text-muted focus:bg-surface focus:border-brand focus:ring-1 focus:ring-brand outline-none transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label={t('clearSearch')}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted hover:text-muted"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Smart Match Banner (if query typed) */}
              {smartMatch && smartMatch.community && (
                <div
                  onClick={() => handleSelect(smartMatch.community)}
                  className="mt-3 p-3 rounded-2xl bg-accent-soft border border-accent/50 text-ink cursor-pointer hover:bg-accent-soft transition flex items-center justify-between shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-[11px] font-bold text-accent-soft-ink uppercase tracking-wider">
                        {t('smartMatch')}
                      </p>
                      <p className="text-xs font-bold text-ink">
                        {smartMatch.community.name} ({smartMatch.community.city})
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-brand text-on-brand text-[11px] font-bold">
                    {t('select')}
                  </span>
                </div>
              )}

              {/* Community List */}
              <div className="mt-3.5 max-h-[260px] overflow-y-auto space-y-1.5 pe-0.5 custom-scrollbar">
                {filteredList ? (
                  filteredList.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted">
                      {t('noSocieties')}
                    </div>
                  ) : (
                    filteredList.map((comm) => renderCommunityRow(comm))
                  )
                ) : (
                  <>
                    <div className="px-1 py-1">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-wider">
                        {t('lahoreCommunities')}
                      </p>
                    </div>
                    {coreCommunities.map((comm) => renderCommunityRow(comm))}

                    {/* Toggle for other communities */}
                    {otherCommunities.length > 0 && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setShowOtherCities(!showOtherCities)}
                          className="w-full py-2 text-center text-xs font-semibold text-muted hover:text-ink flex items-center justify-center gap-1 transition"
                        >
                          <span>{showOtherCities ? t('hideOther') : t('showMore', { count: otherCommunities.length })}</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOtherCities ? 'rotate-180' : ''}`} />
                        </button>

                        {showOtherCities && (
                          <div className="space-y-1.5 pt-1">
                            {otherCommunities.map((comm) => renderCommunityRow(comm))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );

  function renderCommunityRow(comm: Community) {
    const isSelected = selectedCommunity?.id === comm.id || selectedCommunity?.slug === comm.slug;
    return (
      <button
        key={comm.id}
        type="button"
        onClick={() => handleSelect(comm)}
        className={`w-full text-start px-3.5 py-2.5 rounded-xl border transition flex items-center justify-between ${
          isSelected
            ? 'border-brand bg-brand-50/70 shadow-2xs'
            : 'border-line hover:border-line-strong hover:bg-raised'
        }`}
      >
        <div className="min-w-0 pe-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-ink truncate">
              {comm.name}
            </span>
            <span className="text-[11px] font-medium px-1.5 py-0.2 rounded bg-raised text-muted shrink-0">
              {comm.city}
            </span>
          </div>
          <p className="text-[11px] text-muted truncate mt-0.5">
            {comm.areaDescription || t('defaultArea')}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {isSelected ? (
            <span className="w-5 h-5 rounded-full bg-brand text-on-brand flex items-center justify-center">
              <Check className="w-3 h-3 stroke-[3]" />
            </span>
          ) : (
            <span className="text-xs font-bold text-muted hover:text-muted">
              {t('select')}
            </span>
          )}
        </div>
      </button>
    );
  }
}
