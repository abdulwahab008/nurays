import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Community, communityService } from '../services/community.service';
import { resolveLocationSmart, SmartMatchResult } from '../utils/location-resolver';

interface CommunityState {
  selectedCommunity: Community | null;
  communities: Community[];
  isLoading: boolean;
  isDetecting: boolean;
  error: string | null;
  isSelectorModalOpen: boolean;
  openSelectorModal: () => void;
  closeSelectorModal: () => void;
  setSelectedCommunity: (community: Community) => void;
  /** Fetches the list once per session; `force` refetches (the retry button, an admin edit). */
  loadCommunities: (force?: boolean) => Promise<void>;
  detectCommunityFromGPS: () => Promise<Community | null>;
  resolveCommunityFromText: (text: string) => SmartMatchResult | null;
}

export const useCommunityStore = create<CommunityState>()(
  persist(
    (set, get) => ({
      selectedCommunity: null,
      communities: [],
      isLoading: false,
      isDetecting: false,
      error: null,
      isSelectorModalOpen: false,

      openSelectorModal: () => set({ isSelectorModalOpen: true }),
      closeSelectorModal: () => set({ isSelectorModalOpen: false }),

      setSelectedCommunity: (community) => {
        set({ selectedCommunity: community, isSelectorModalOpen: false });
      },

      resolveCommunityFromText: (text: string) => {
        const list = get().communities;
        return resolveLocationSmart({ text }, list);
      },

      loadCommunities: async (force = false) => {
        if (!force && get().communities.length > 0) return;
        set({ isLoading: true, error: null });
        try {
          const list = await communityService.getCommunities();
          set({ communities: list, isLoading: false });

          // No community is picked on the buyer's behalf: until they choose one (or GPS
          // finds one), pages ask them to choose instead of showing some other area's kitchens.
          const current = get().selectedCommunity;
          if (current && list.length > 0) {
            // Re-sync with fresh community from list by id or slug
            const fresh = list.find((c) => c.id === current.id || c.slug === current.slug);
            if (fresh) {
              set({ selectedCommunity: fresh });
            }
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to load communities', isLoading: false });
        }
      },

      detectCommunityFromGPS: async () => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
          return null;
        }

        set({ isDetecting: true });
        return new Promise<Community | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const { latitude, longitude } = position.coords;
                const list = get().communities;

                // 1. Run local smart resolver
                const localMatch = resolveLocationSmart({ lat: latitude, lng: longitude }, list);

                // 2. Also try backend detect endpoint
                let backendMatch: Community | null = null;
                try {
                  const result = await communityService.detectCommunity(latitude, longitude);
                  if (result?.community) {
                    const full = list.find((c) => c.id === result.community.id || c.slug === result.community.slug);
                    // The answer carries fewer fields than a listed community; it is used as it is when the list lacks it.
                    backendMatch = (full ?? result.community) as Community;
                  }
                } catch {
                  // Fallback to local
                }

                const finalMatched = localMatch?.community || backendMatch || list.find((c) => c.slug === 'askari-11') || list[0];
                if (finalMatched) {
                  set({ selectedCommunity: finalMatched, isDetecting: false });
                  resolve(finalMatched);
                  return;
                }
              } catch (e) {
                console.warn('GPS community detection failed:', e);
              }
              set({ isDetecting: false });
              resolve(null);
            },
            (error) => {
              console.warn('Geolocation error:', error);
              // Fallback to Askari 11 on GPS denial/error
              const askari = get().communities.find((c) => c.slug === 'askari-11');
              if (askari) {
                set({ selectedCommunity: askari, isDetecting: false });
                resolve(askari);
                return;
              }
              set({ isDetecting: false });
              resolve(null);
            },
            { timeout: 8000, enableHighAccuracy: true }
          );
        });
      },
    }),
    {
      name: 'nuray-buyer-community',
      partialize: (state) => ({
        selectedCommunity: state.selectedCommunity,
      }),
    }
  )
);
