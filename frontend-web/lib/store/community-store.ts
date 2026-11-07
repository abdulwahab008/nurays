import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Community, communityService } from '../services/community.service';
import { resolveLocationSmart, SmartMatchResult } from '../utils/location-resolver';
import { errorMessage } from '../api-client';
import { addressService, type Address } from '../services/address.service';
import { findSavedArea, type AreaHint } from '../../components/community/saved-area';

/** What the device's position gave: the area it is in, or why none was chosen (no position shared, or outside every area). */
export interface GpsDetection {
  community: Community | null;
  reason?: 'denied' | 'outside';
}

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
  detectCommunityFromGPS: () => Promise<GpsDetection>;
  resolveCommunityFromText: (text: string) => SmartMatchResult | null;
  /**
   * For a signed-in customer with no area chosen on this device: the area they chose before (kept on their profile) or
   * the one their saved address is in. Tried once per account per session.
   */
  restoreSavedArea: (userId: string, profile?: { area?: string | null; city?: string | null }) => Promise<void>;
}

/** Accounts whose saved area was already looked up in this session (not persisted). */
const restoredFor = new Set<string>();

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

      restoreSavedArea: async (userId, profile) => {
        if (get().selectedCommunity || restoredFor.has(userId)) return;
        restoredFor.add(userId);
        await get().loadCommunities();
        const list = get().communities;
        if (list.length === 0) return;
        const hints: AreaHint[] = [{ area: profile?.area, city: profile?.city }];
        let found = findSavedArea(list, hints);
        if (!found) {
          try {
            // The API also says which area an address is in (not yet in the shared Address type).
            const saved = ((await addressService.getAddresses()).data ?? []) as Array<Address & { communityId?: string | null }>;
            const ordered = [...saved].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
            found = findSavedArea(
              list,
              ordered.flatMap((a) => [{ communityId: a.communityId }, { area: a.area, city: a.city }]),
            );
          } catch {
            // No addresses to go by: the customer chooses.
          }
        }
        // The customer may have chosen an area while this was being worked out; their choice stands.
        if (found && !get().selectedCommunity) set({ selectedCommunity: found });
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
        } catch (err) {
          set({ error: errorMessage(err, 'Failed to load communities'), isLoading: false });
        }
      },

      detectCommunityFromGPS: async () => {
        if (typeof window === 'undefined' || !navigator.geolocation) {
          return { community: null, reason: 'denied' };
        }

        set({ isDetecting: true });
        return new Promise<GpsDetection>((resolve) => {
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

                // Only a real match is chosen. A position outside every area picks nothing: the buyer chooses (FE-20).
                const finalMatched = localMatch?.community || backendMatch;
                if (finalMatched) {
                  set({ selectedCommunity: finalMatched, isDetecting: false });
                  resolve({ community: finalMatched });
                  return;
                }
                set({ isDetecting: false });
                resolve({ community: null, reason: 'outside' });
                return;
              } catch (e) {
                console.warn('GPS community detection failed:', e);
              }
              set({ isDetecting: false });
              resolve({ community: null, reason: 'denied' });
            },
            (error) => {
              console.warn('Geolocation error:', error);
              // No area is chosen for a buyer whose device did not share where they are: they pick one (FE-20).
              set({ isDetecting: false });
              resolve({ community: null, reason: 'denied' });
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
