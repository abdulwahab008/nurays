'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useCommunityStore } from '@/lib/store/community-store';
import { Community, communityService } from '@/lib/services/community.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { MapPin, Navigation, Search, X, Check, ChevronDown, Sparkles } from 'lucide-react';

interface CommunitySelectorProps {
  variant?: 'navbar' | 'compact' | 'hero';
}

const CORE_LAHORE_SLUGS = ['askari-11', 'askari-10', 'dha-phase-5', 'dha-phase-6', 'dha-9-town'];

export function CommunitySelector({ variant = 'navbar' }: CommunitySelectorProps) {
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
  } = useCommunityStore();

  const { isAuthenticated, user } = useAuthStore();
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
    showToast(`Location set to ${comm.name}`, 'info');

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
    const detected = await detectCommunityFromGPS();
    if (detected) {
      showToast(`Detected location: ${detected.name}!`, 'success');
      handleClose();
    } else {
      showToast('Could not access GPS. Please pick your society below.', 'error');
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
        className={`group inline-flex items-center gap-2.5 rounded-full border transition-all text-left ${
          variant === 'navbar'
            ? 'px-3.5 py-1.5 border-orange-200/90 bg-orange-50/90 hover:bg-orange-100 hover:border-orange-300 text-slate-900 shadow-xs active:scale-95'
            : variant === 'hero'
            ? 'px-4 py-2 border-[#FF5500]/40 bg-[#FF5500]/10 hover:bg-[#FF5500]/20 text-white shadow-lg active:scale-95'
            : 'px-2.5 py-1 text-xs border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-900'
        }`}
        title="Change Delivery Location"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5500] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF5500]"></span>
        </span>
        <div className="flex flex-col">
          <span
            className={`text-[9.5px] uppercase font-bold tracking-wider leading-none ${
              variant === 'navbar' ? 'text-orange-700' : 'text-slate-400'
            }`}
          >
            Delivering to
          </span>
          <span
            className={`text-xs sm:text-sm font-extrabold truncate max-w-[130px] sm:max-w-[170px] leading-tight ${
              variant === 'navbar' ? 'text-slate-900' : 'text-white'
            }`}
          >
            {selectedCommunity ? selectedCommunity.name : 'Askari 11'}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform group-hover:translate-y-0.5 shrink-0 ${
            variant === 'navbar' ? 'text-orange-700' : 'text-slate-400'
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
              className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                    Delivery Location
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select your society for instant home kitchen menus &amp; express delivery
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close dialog"
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all active:scale-95"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Current Active Location Pill */}
              <div className="mt-3.5 p-3 rounded-2xl bg-orange-50/70 border border-orange-200/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-[#FF5500] text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">
                      Current Location
                    </p>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {selectedCommunity ? `${selectedCommunity.name}, ${selectedCommunity.city}` : 'Askari 11, Lahore'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full shrink-0">
                  Active
                </span>
              </div>

              {/* GPS Auto-Detect Button */}
              <button
                type="button"
                onClick={handleGPSDetect}
                disabled={isDetecting}
                className="w-full mt-3 p-3 rounded-2xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50/40 text-slate-800 font-semibold text-xs transition flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-slate-100 group-hover:bg-[#FF5500] text-slate-600 group-hover:text-white flex items-center justify-center transition-colors">
                    {isDetecting ? (
                      <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Navigation className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span>{isDetecting ? 'Detecting your GPS location...' : 'Use My Current GPS Location'}</span>
                </div>
                <span className="text-[11px] font-bold text-[#FF5500] group-hover:translate-x-0.5 transition-transform">
                  Detect →
                </span>
              </button>

              {/* Minimal Search Bar */}
              <div className="relative mt-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search society (e.g. Askari 11, DHA Phase 6, 9 Town)..."
                  className="w-full h-10 pl-9 pr-8 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#FF5500] focus:ring-1 focus:ring-[#FF5500] outline-none transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Smart Match Banner (if query typed) */}
              {smartMatch && smartMatch.community && (
                <div
                  onClick={() => handleSelect(smartMatch.community)}
                  className="mt-3 p-3 rounded-2xl bg-amber-50/80 border border-amber-300 text-slate-900 cursor-pointer hover:bg-amber-100/70 transition flex items-center justify-between shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                        Smart Match Detected
                      </p>
                      <p className="text-xs font-bold text-slate-900">
                        {smartMatch.community.name} ({smartMatch.community.city})
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-[#FF5500] text-white text-[11px] font-bold">
                    Select
                  </span>
                </div>
              )}

              {/* Community List */}
              <div className="mt-3.5 max-h-[260px] overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
                {filteredList ? (
                  filteredList.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      No matching societies found. Try &ldquo;Askari 11&rdquo; or &ldquo;DHA Phase 6&rdquo;.
                    </div>
                  ) : (
                    filteredList.map((comm) => renderCommunityRow(comm))
                  )
                ) : (
                  <>
                    <div className="px-1 py-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Lahore Communities
                      </p>
                    </div>
                    {coreCommunities.map((comm) => renderCommunityRow(comm))}

                    {/* Toggle for other communities */}
                    {otherCommunities.length > 0 && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setShowOtherCities(!showOtherCities)}
                          className="w-full py-2 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 transition"
                        >
                          <span>{showOtherCities ? 'Hide Other Societies' : `Show More Societies (${otherCommunities.length})`}</span>
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
        className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition flex items-center justify-between ${
          isSelected
            ? 'border-[#FF5500] bg-orange-50/70 shadow-2xs'
            : 'border-slate-200/70 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900 truncate">
              {comm.name}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 shrink-0">
              {comm.city}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">
            {comm.areaDescription || 'Domestic Home Kitchens Network'}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {isSelected ? (
            <span className="w-5 h-5 rounded-full bg-[#FF5500] text-white flex items-center justify-center">
              <Check className="w-3 h-3 stroke-[3]" />
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-400 hover:text-slate-600">
              Select
            </span>
          )}
        </div>
      </button>
    );
  }
}
