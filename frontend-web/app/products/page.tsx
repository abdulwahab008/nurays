'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { getStackedDiscountedPrice } from '@/lib/pricing';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { productService, Product, ProductFilters } from '@/lib/services/product.service';
import { addressService } from '@/lib/services/address.service';
import { displayRating, formatPrice, imageVariant } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CoverImage } from '@/components/ui/CoverImage';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorCode, apiErrorStatus, apiErrorDetails, errorMessage, type CartConflictDetails } from '@/lib/api-client';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useCommunityStore } from '@/lib/store/community-store';
import { useHydrated } from '@/lib/hooks/use-hydrated';
import { communityService, CommunityDetail, CommunityKitchen } from '@/lib/services/community.service';
import { favoriteService } from '@/lib/services/favorite.service';
import { cartService } from '@/lib/services/cart.service';
import CartConflictModal, { CartConflictInfo } from '@/components/cart/CartConflictModal';
import ClosedKitchenModal from '@/components/kitchen/ClosedKitchenModal';
import {
  Heart,
  Search,
  MapPin,
  Bike,
  Snowflake,
  Star,
  Clock,
  Tag,
  Flame,
  Sparkles,
  ChefHat,
  ShieldCheck,
  Home,
  UtensilsCrossed,
  CheckCircle2,
  ChevronRight,
  Store,
  Info,
  HelpCircle,
  X,
  Plus,
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { browseMessages, productTypeKey, type BrowseT } from '@/lib/i18n/messages/browse';
import { useShallow } from 'zustand/react/shallow';

type SortOption = NonNullable<ProductFilters['sort']>;

interface CatalogPromotion {
  id: string;
  name: string;
  type: string;
  discountValue: number;
}

interface Category {
  id: string;
  name: string;
  nameUrdu?: string;
  iconUrl?: string;
  slug: string;
  children?: Category[];
}

const productTypeOptions = [
  { value: 'all', labelKey: 'type.all' },
  { value: 'fresh', labelKey: 'type.fresh', icon: Flame },
  { value: 'frozen', labelKey: 'type.frozen', icon: Snowflake },
  { value: 'ready_to_eat', labelKey: 'type.ready_to_eat', icon: Clock },
  { value: 'ready_to_cook', labelKey: 'type.ready_to_cook', icon: UtensilsCrossed },
] as const;

const businessTypeOptions = [
  { value: '', label: 'Any Kitchen Type' },
  { value: 'home_kitchen', label: 'Home Kitchens' },
  { value: 'cloud_kitchen', label: 'Cloud Kitchens' },
  { value: 'bakery', label: 'Home Bakeries' },
];

const maxDistanceOptions = [
  { value: '', label: 'Any Distance' },
  { value: '2', label: 'Within 2 km' },
  { value: '5', label: 'Within 5 km' },
  { value: '10', label: 'Within 10 km' },
  { value: '20', label: 'Within 20 km' },
];

// Labels come from browseMessages (`type.<productType>`).
const PRODUCT_TYPE_BADGES: Record<string, { icon: typeof Flame; className: string }> = {
  frozen: { icon: Snowflake, className: 'bg-frozen-soft text-frozen-ink' },
  fresh: { icon: Flame, className: 'bg-surface/95 text-ink' },
  ready_to_eat: { icon: Clock, className: 'bg-surface/95 text-ink' },
  ready_to_cook: { icon: UtensilsCrossed, className: 'bg-surface/95 text-ink' },
};

/** The API's delivery-time estimate, shown only when this kitchen actually delivers to the buyer. */
function deliveryEtaLabel(p: Product, t: BrowseT): string | null {
  if (!p.delivery?.deliverable) return null;
  const min = p.estimatedDeliveryMinMinutes ?? p.delivery.estimatedMinMinutes;
  const max = p.estimatedDeliveryMaxMinutes ?? p.delivery.estimatedMaxMinutes;
  if (min == null || max == null) return null;
  return t('etaMin', { min, max });
}

/** The API's delivery fee. Nothing when the API didn't compute one (no area or address known). */
/** How long a signed-in buyer's first dish list waits for their saved address before it goes without a distance. */
const ADDRESS_WAIT_MS = 2000;

function deliveryFeeLabel(p: Product, t: BrowseT): string | null {
  if (!p.delivery) return null;
  if (!p.delivery.deliverable) return t('deliveryNotHere');
  return p.delivery.fee === 0 ? t('freeDelivery') : t('feeDelivery', { fee: p.delivery.fee });
}

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, logout } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user, logout: s.logout })));
  const { showToast } = useToast();
  const t = useT(browseMessages);
  const tc = useT(commonMessages);

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const [viewMode, setViewMode] = useState<'kitchens' | 'dishes'>('kitchens');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [error, setError] = useState('');
  // Ignore responses from superseded product requests (filters changed mid-flight).
  const productsRequestRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProductType, setSelectedProductType] = useState(searchParams.get('productType') || 'all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [openNow, setOpenNow] = useState(false);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [pickupAvailable, setPickupAvailable] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [offersAvailable, setOffersAvailable] = useState(false);
  const [businessType, setBusinessType] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState('');
  const [fastDeliveryOnly, setFastDeliveryOnly] = useState(false);
  const [customerLocation, setCustomerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [promotionsByProductId, setPromotionsByProductId] = useState<Record<string, CatalogPromotion[]>>({});

  // Community store & Single-Seller Cart / Favorites state
  const {
    selectedCommunity,
    loadCommunities,
    openSelectorModal,
    isLoading: communitiesLoading,
    error: communitiesError,
  } = useCommunityStore(useShallow((s) => ({ selectedCommunity: s.selectedCommunity, loadCommunities: s.loadCommunities, openSelectorModal: s.openSelectorModal, isLoading: s.isLoading, error: s.error })));
  const [communityListReady, setCommunityListReady] = useState(false);
  const [communityDetail, setCommunityDetail] = useState<CommunityDetail | null>(null);
  const [communityKitchensLoading, setCommunityKitchensLoading] = useState(false);
  const [communityError, setCommunityError] = useState('');
  const [communityReloadKey, setCommunityReloadKey] = useState(0);
  const [favoriteSellerIds, setFavoriteSellerIds] = useState<Set<string>>(new Set());
  const [cartConflict, setCartConflict] = useState<CartConflictInfo | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [closedKitchenModalData, setClosedKitchenModalData] = useState<CommunityKitchen | null>(null);

  useEffect(() => {
    loadCommunities().finally(() => setCommunityListReady(true));
  }, [loadCommunities]);

  // Fetch the selected community's verified kitchens. With no community selected there is
  // nothing to fetch: the kitchens view asks the buyer to choose one instead.
  useEffect(() => {
    const commId = selectedCommunity?.id || selectedCommunity?.slug;
    setCommunityDetail(null);
    setCommunityError('');
    if (!commId) {
      setCommunityKitchensLoading(false);
      return;
    }

    let cancelled = false;
    setCommunityKitchensLoading(true);
    communityService
      .getCommunity(commId)
      .then((detail) => {
        if (cancelled) return;
        if (detail) setCommunityDetail(detail);
        else setCommunityError('loadKitchensError');
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Failed to load community kitchens:', err?.message || err);
        setCommunityError('loadKitchensError');
      })
      .finally(() => {
        if (!cancelled) setCommunityKitchensLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCommunity?.id, selectedCommunity?.slug, communityReloadKey]);

  const sortOptions = [
    { value: 'newest', label: t('sort.newest') },
    { value: 'price_low', label: t('sort.price_low') },
    { value: 'price_high', label: t('sort.price_high') },
    { value: 'rating', label: t('sort.rating') },
    { value: 'popular', label: t('sort.popular') },
  ];

  // Load categories from API
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCategoriesLoading(true);
        const response = await apiClient.get('/categories');
        if (response.data.success) {
          setCategories(response.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
  }, []);

  // Load favorite sellers for instant heart fill
  useEffect(() => {
    if (!isAuthenticated) return;
    favoriteService.getFavorites().then((list) => {
      const ids = new Set<string>((list || []).map((f) => f.sellerId));
      setFavoriteSellerIds(ids);
    }).catch(() => {});
  }, [isAuthenticated]);

  // Customer coordinates for accurate delivery distance. A signed-in buyer's first list waits for them (for at most
  // ADDRESS_WAIT_MS), so the dishes are asked for once with the distance in, not again when the address arrives.
  const [addressSettled, setAddressSettled] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let live = true;
    const giveUp = setTimeout(() => {
      if (live) setAddressSettled(true);
    }, ADDRESS_WAIT_MS);
    addressService
      .getAddresses()
      .then((res) => {
        const addresses = res.data || [];
        const withCoords = addresses.find((a) => a.isDefault && a.coordinates) || addresses.find((a) => a.coordinates);
        if (withCoords?.coordinates) {
          setCustomerLocation({ lat: withCoords.coordinates.latitude, lng: withCoords.coordinates.longitude });
        }
      })
      .catch(() => setCustomerLocation(null))
      .finally(() => {
        clearTimeout(giveUp);
        if (live) setAddressSettled(true);
      });
    return () => {
      live = false;
      clearTimeout(giveUp);
    };
  }, [isAuthenticated]);
  // The first render still sees the signed-out state the server drew, so nothing is asked for until the browser has
  // read the session.
  const hydrated = useHydrated();
  const waitingForAddress = !hydrated || (isAuthenticated && !addressSettled);

  useEffect(() => {
    const paramSearch = searchParams.get('search') || '';
    setSearchQuery(paramSearch);
    setSearchInput(paramSearch);
    if (paramSearch) {
      setViewMode('dishes');
    }
    setPage(1);
  }, [searchParams.toString()]);

  const loadProducts = async () => {
    const requestId = ++productsRequestRef.current;
    const isCurrent = () => requestId === productsRequestRef.current;
    setLoading(true);
    setError('');
    try {
      const productTypeValue = selectedProductType !== 'all' ? (selectedProductType as ProductFilters['productType']) : undefined;
      const response = await productService.getProducts({
        page,
        limit: 24,
        categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
        productType: productTypeValue,
        sort: sortBy,
        search: searchQuery || undefined,
        communityId: selectedCommunity?.id,
        openNow: openNow || undefined,
        deliveryAvailable: deliveryAvailable || undefined,
        pickupAvailable: pickupAvailable || undefined,
        freeDelivery: freeDelivery || undefined,
        offersAvailable: offersAvailable || undefined,
        businessType: businessType || undefined,
        maxDistanceKm: maxDistanceKm ? parseFloat(maxDistanceKm) : undefined,
        fastDelivery: fastDeliveryOnly || undefined,
        customerLat: customerLocation?.lat,
        customerLng: customerLocation?.lng,
      });

      if (!isCurrent()) return;
      if (!response?.data) throw new Error('Unexpected response from /products');

      const list = response.data.products || [];
      setProducts(list);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotalProducts(response.data.pagination?.total ?? list.length);
      if (list.length > 0) {
        try {
          const ids = list.map((p: Product) => p.id).join(',');
          const promRes = await apiClient.get<{ success: boolean; data: Record<string, CatalogPromotion[]> }>(
            `/promotions/catalog?productIds=${encodeURIComponent(ids)}`
          );
          if (!isCurrent()) return;
          if (promRes.data.success && promRes.data.data) setPromotionsByProductId(promRes.data.data);
          else setPromotionsByProductId({});
        } catch {
          if (isCurrent()) setPromotionsByProductId({});
        }
      } else {
        setPromotionsByProductId({});
      }
    } catch (err) {
      if (!isCurrent()) return;
      console.error('Failed to load products:', err);
      setProducts([]);
      setTotalProducts(0);
      setPromotionsByProductId({});
      setError('loadDishesError');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    if (waitingForAddress) return;
    loadProducts();
  }, [
    page, selectedCategory, selectedProductType, sortBy, searchQuery, openNow,
    deliveryAvailable, pickupAvailable, freeDelivery, offersAvailable,
    businessType, maxDistanceKm, fastDeliveryOnly, customerLocation, selectedCommunity?.id, waitingForAddress,
  ]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
    if (searchInput) {
      setViewMode('dishes');
    }
  };

  const handleQuickAddToCart = async (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push(loginUrlHere());
      return;
    }
    setAddingProductId(product.id);
    try {
      await cartService.addToCart({
        productId: product.id,
        quantity: 1,
        stockType: product.productType === 'frozen' ? 'hub' : 'direct',
      });
      showToast(t('toastAdded', { name: product.name }), 'success');
    } catch (err) {
      if (apiErrorStatus(err) === 409 || apiErrorCode(err) === 'CART_SELLER_MISMATCH') {
        const details = apiErrorDetails(err) as CartConflictDetails | undefined;
        setCartConflict({
          existingSellerName: details?.existingSeller?.name || t('previousKitchen'),
          newSellerName: details?.newSeller?.name || product.seller?.businessName || t('newKitchen'),
          onConfirmClearAndAdd: async () => {
            try {
              await cartService.addToCart({
                productId: product.id,
                quantity: 1,
                stockType: product.productType === 'frozen' ? 'hub' : 'direct',
                clearAndAdd: true,
              });
              setCartConflict(null);
              showToast(t('toastCartUpdated', { kitchen: product.seller?.businessName }), 'success');
            } catch {
              showToast(t('toastReplaceItemsFailed'), 'error');
            }
          },
          onCancel: () => setCartConflict(null),
        });
      } else {
        const msg = errorMessage(err, t('toastAddDishFailed'));
        showToast(msg, 'error');
      }
    } finally {
      setAddingProductId(null);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent, sellerId: string, sellerName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push(loginUrlHere());
      return;
    }
    try {
      const res = await favoriteService.toggleFavorite(sellerId);
      const isFav = res.isFavorite;
      setFavoriteSellerIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(sellerId);
        else next.delete(sellerId);
        return next;
      });
      showToast(isFav ? t('toastSavedFavKitchens', { name: sellerName }) : t('toastRemovedFav', { name: sellerName }), 'info');
    } catch {
      showToast(t('toastFavFailed'), 'error');
    }
  };

  // The loaded community detail, only while it belongs to the current selection (so the previous
  // community's kitchens never show under a newly selected community's name).
  const activeCommunityDetail =
    communityDetail &&
    selectedCommunity &&
    (communityDetail.id === selectedCommunity.id || communityDetail.slug === selectedCommunity.slug)
      ? communityDetail
      : null;

  // Real distance (only known when the buyer has an address with coordinates), else the
  // kitchen's own community name; nothing when neither is known.
  const formatDeliveryDistance = (p: Product): string | null => {
    if (p.delivery?.distanceKm != null && p.delivery.distanceKm >= 0 && p.delivery.distanceKm <= 35) {
      return t('kmAway', { km: p.delivery.distanceKm.toFixed(1) });
    }
    return p.community?.name || null;
  };

  const isAnyFilterActive = Boolean(
    searchInput.trim() ||
    searchQuery ||
    selectedProductType !== 'all' ||
    openNow ||
    deliveryAvailable ||
    freeDelivery ||
    fastDeliveryOnly
  );

  const handleClearAllFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedProductType('all');
    setOpenNow(false);
    setDeliveryAvailable(false);
    setFreeDelivery(false);
    setFastDeliveryOnly(false);
    setPage(1);
  };

  // Reusable Search & Filter Component
  const renderFilterBar = () => (
    <div className="space-y-4 mb-6">
      {/* Clean Marketplace Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <div>
          <h1 className="text-[22px] sm:text-[28px] leading-tight font-extrabold text-ink tracking-tight">
            {viewMode === 'kitchens' ? t('titleKitchens') : t('titleDishes')}
          </h1>
          <p className="text-sm text-muted mt-1 flex items-center gap-1.5 flex-wrap">
            <span>{selectedCommunity ? t('deliveringTo') : t('chooseAreaHint')}</span>
            <button
              type="button"
              onClick={openSelectorModal}
              className="font-bold text-brand-ink hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3 h-3 text-brand-ink" />
              <span>{selectedCommunity?.name || t('selectArea')}</span>
            </button>
            {selectedCommunity?.city && (
              <>
                <span aria-hidden>·</span>
                <span>{selectedCommunity.city}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Unified Search & Filters Panel */}
      <div className="space-y-3">
        {/* Top Row: Search Input + View Mode Switcher + Sort */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Clean Search Input */}
          <form onSubmit={handleSearch} className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-muted absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label={t('searchPlaceholder')}
              className="w-full ps-10 pe-24 border border-transparent rounded-[14px] text-[15px] font-semibold text-ink placeholder:text-muted placeholder:font-medium focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none bg-raised focus:bg-surface transition-all h-12"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute end-[4.5rem] top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted hover:text-ink hover:bg-line rounded-full cursor-pointer"
                title={t('clearSearch')}
                aria-label={t('clearSearch')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="absolute end-1.5 top-1/2 -translate-y-1/2 h-9 px-3.5 bg-brand hover:bg-brand-500 text-on-brand text-sm font-extrabold rounded-[10px] transition-all active:scale-95 cursor-pointer"
            >
              {tc('search')}
            </button>
          </form>

          {/* View Switcher: Kitchens vs Dishes */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-raised rounded-xl h-12 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('kitchens')}
              aria-pressed={viewMode === 'kitchens'}
              className={`flex items-center justify-center gap-1.5 px-4 rounded-[9px] text-sm transition-all h-full cursor-pointer ${
                viewMode === 'kitchens' ? 'bg-surface text-ink font-extrabold shadow-xs' : 'text-muted font-bold hover:text-ink'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>{t('viewKitchens')}</span>
              {activeCommunityDetail && (
                <span
                  className={`px-1.5 rounded-full text-[11px] font-extrabold ${
                    viewMode === 'kitchens' ? 'bg-brand-soft text-brand-soft-ink' : 'bg-line text-muted'
                  }`}
                >
                  {(activeCommunityDetail.sellers || []).length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('dishes')}
              aria-pressed={viewMode === 'dishes'}
              className={`flex items-center justify-center gap-1.5 px-4 rounded-[9px] text-sm transition-all h-full cursor-pointer ${
                viewMode === 'dishes' ? 'bg-surface text-ink font-extrabold shadow-xs' : 'text-muted font-bold hover:text-ink'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>{t('viewDishes')}</span>
              {!loading && !error && (
                <span
                  className={`px-1.5 rounded-full text-[11px] font-extrabold ${
                    viewMode === 'dishes' ? 'bg-brand-soft text-brand-soft-ink' : 'bg-line text-muted'
                  }`}
                >
                  {totalProducts}
                </span>
              )}
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption);
                setPage(1);
              }}
              aria-label={t('sortLabel')}
              className="border border-line rounded-xl px-3 text-sm font-bold text-ink bg-surface hover:border-line-strong focus:ring-2 focus:ring-brand/30 h-12 cursor-pointer"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Chips inside Search Panel */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
            {productTypeOptions.map((type) => {
              const isSelected = selectedProductType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => {
                    setSelectedProductType(type.value);
                    setPage(1);
                  }}
                  aria-pressed={isSelected}
                  className={`h-10 px-4 rounded-full text-sm font-bold transition-colors shrink-0 cursor-pointer ${
                    isSelected ? 'bg-ink text-page' : 'bg-surface text-ink border border-line hover:bg-raised'
                  }`}
                >
                  {t(type.labelKey)}
                </button>
              );
            })}

            <div className="h-6 w-px bg-line mx-1 shrink-0" />

            <button
              onClick={() => {
                setOpenNow(!openNow);
                setPage(1);
              }}
              aria-pressed={openNow}
              className={`h-10 px-4 rounded-full text-sm font-bold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                openNow ? 'bg-brand text-on-brand' : 'bg-surface text-ink border border-line hover:bg-raised'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${openNow ? 'bg-on-brand' : 'bg-brand'}`} />
              <span>{t('openNow')}</span>
            </button>

            <button
              onClick={() => {
                setFreeDelivery(!freeDelivery);
                setPage(1);
              }}
              aria-pressed={freeDelivery}
              className={`h-10 px-4 rounded-full text-sm font-bold transition-colors shrink-0 cursor-pointer ${
                freeDelivery ? 'bg-ink text-page' : 'bg-surface text-ink border border-line hover:bg-raised'
              }`}
            >
              {t('freeDeliveryChip')}
            </button>

            <button
              onClick={() => {
                setFastDeliveryOnly(!fastDeliveryOnly);
                setPage(1);
              }}
              aria-pressed={fastDeliveryOnly}
              className={`h-10 px-4 rounded-full text-sm font-bold transition-colors shrink-0 cursor-pointer ${
                fastDeliveryOnly ? 'bg-ink text-page' : 'bg-surface text-ink border border-line hover:bg-raised'
              }`}
            >
              {t('under45')}
            </button>
          </div>

          {isAnyFilterActive && (
            <button
              onClick={handleClearAllFilters}
              className="text-sm font-bold text-brand-ink hover:underline flex items-center gap-1 transition-colors cursor-pointer h-10 px-2"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t('resetFilters')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Main Marketplace Content
  function renderMarketplaceContent() {
    if (viewMode === 'kitchens') {
      const kitchenSkeleton = (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="h-80 rounded-[20px] bg-raised animate-pulse border border-line" />
          ))}
        </div>
      );

      // No community chosen (yet): there is nothing real to list, so ask the buyer to pick one.
      if (!selectedCommunity) {
        if (communitiesLoading || !communityListReady) return kitchenSkeleton;
        return (
          <div className="bg-surface rounded-[20px] border border-dashed border-line-strong p-8 sm:p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-7 h-7 text-brand-ink" />
            </div>
            <h3 className="text-lg font-bold text-ink mb-2">
              {communitiesError ? t('areasLoadError') : t('chooseYourArea')}
            </h3>
            <p className="text-xs sm:text-sm text-muted max-w-md mx-auto mb-5 leading-relaxed">
              {communitiesError
                ? t('checkConnection')
                : t('pickCommunity')}
            </p>
            {communitiesError ? (
              <Button onClick={() => loadCommunities(true)} className="flame-btn rounded-xl">
                {t('retry')}
              </Button>
            ) : (
              <Button onClick={openSelectorModal} className="flame-btn rounded-xl">
                {t('chooseCommunity')}
              </Button>
            )}
          </div>
        );
      }

      const allKitchens = activeCommunityDetail?.sellers || [];
      const kitchens = openNow ? allKitchens.filter((k) => k.isOpen !== false) : allKitchens;
      const communityName = selectedCommunity.name || activeCommunityDetail?.name || t('yourArea');

      return (
        <div>
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-soft text-brand-soft-ink text-xs font-extrabold mb-2">
                <MapPin className="w-3 h-3" />
                <span>{t('hyperlocal', { name: communityName })}</span>
              </div>
              <h2 className="text-[22px] font-extrabold text-ink tracking-tight">
                {t('verifiedDomestic')}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t('independentChefs')}
              </p>
            </div>
            {activeCommunityDetail && (
              <span className="text-sm font-semibold text-muted">
                {t(kitchens.length === 1 ? 'showingKitchensOne' : 'showingKitchensMany', { count: kitchens.length, area: communityName })}
              </span>
            )}
          </div>

          {communityKitchensLoading || (!activeCommunityDetail && !communityError) ? (
            kitchenSkeleton
          ) : communityError ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
              <h3 className="text-base font-bold text-red-800 mb-1.5">{t('loadKitchensError')}</h3>
              <p className="text-red-600 text-xs mb-3">{t('checkConnection')}</p>
              <Button
                onClick={() => setCommunityReloadKey((n) => n + 1)}
                variant="outline"
                className="border-red-300 text-red-700 text-xs"
              >
                {t('retry')}
              </Button>
            </div>
          ) : kitchens.length === 0 ? (
            <div className="bg-surface rounded-[20px] border border-dashed border-line-strong p-8 sm:p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto mb-4">
                <Store className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">
                {allKitchens.length > 0
                  ? t('noneOpenIn', { area: communityName })
                  : t('noneYetIn', { area: communityName })}
              </h3>
              <p className="text-xs sm:text-sm text-muted max-w-md mx-auto mb-5 leading-relaxed">
                {allKitchens.length > 0
                  ? t('turnOffOpenNow')
                  : t('noneJoined', { area: communityName })}
              </p>

              {activeCommunityDetail?.neighbors && activeCommunityDetail.neighbors.length > 0 && (
                <div className="flex flex-col items-center gap-2 mb-5">
                  <span className="text-xs font-bold text-muted uppercase tracking-wider">
                    {t('nearbyCommunities')}
                  </span>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {activeCommunityDetail.neighbors.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          const comm = useCommunityStore.getState().communities.find((c) => c.id === n.id);
                          if (comm) useCommunityStore.getState().setSelectedCommunity(comm);
                        }}
                        className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-brand-soft hover:bg-brand-100 text-brand-soft-ink text-sm font-bold transition-colors"
                      >
                        <span>{t('browseNamedKitchens', { name: n.name })}</span>
                        <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={openSelectorModal} className="flame-btn rounded-xl">
                {t('switchCommunity')}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {kitchens.map((k) => {
                const isClosed = k.isOpen === false;
                const rating = displayRating(k.ratingAverage, k.totalReviews);
                const displayChef =
                  k.chefName && k.chefName.toLowerCase() !== k.businessName.toLowerCase()
                    ? k.chefName
                    : t('verifiedHomeChef');

                return (
                  <Link
                    key={k.id}
                    href={`/kitchens/${k.id}`}
                    onClick={(e) => {
                      // The closed-kitchen modal needs a real reopening time; without one,
                      // go straight to the kitchen page rather than show a made-up time.
                      if (isClosed && k.opensAt) {
                        e.preventDefault();
                        setClosedKitchenModalData(k);
                      }
                    }}
                    className={`group flex flex-col justify-between rounded-[20px] border bg-surface transition-all duration-200 overflow-hidden ${
                      isClosed
                        ? 'border-line opacity-80 hover:opacity-100 hover:border-line-strong'
                        : 'border-line hover:border-line-strong hover:shadow-[var(--shadow-card)]'
                    }`}
                  >
                    {/* Cover Image with Modern Aspect Ratio & Subtle Overlays */}
                    <div className="relative aspect-[16/10] overflow-hidden bg-raised">
                      <CoverImage
                        src={k.coverImageUrl}
                        alt={k.businessName}
                        label={k.businessName}
                        size="md"
                        className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                      />

                      {/* Clean Top Status */}
                      {isClosed ? (
                        <span className="absolute top-3 start-3 px-2.5 py-1 rounded-full text-ink text-[11px] font-extrabold bg-surface/95 inline-flex items-center gap-1.5 shadow-xs">
                          <span className="w-2 h-2 rounded-full bg-accent" />
                          <span>
                            {k.acceptsPreOrders
                              ? k.opensAt
                                ? t('closedPreorderAt', { time: k.opensAt })
                                : t('closedPreorder')
                              : k.opensAt
                              ? t('closedOpens', { time: k.opensAt })
                              : t('closed')}
                          </span>
                        </span>
                      ) : (
                        <span className="absolute top-3 start-3 px-2.5 py-1 rounded-full text-ink text-[11px] font-extrabold bg-surface/95 inline-flex items-center gap-1 shadow-xs">
                          <ChefHat className="w-3 h-3 text-brand-ink" />
                          <span>{t('homeKitchen')}</span>
                        </span>
                      )}

                      {/* Favorite Button */}
                      <button
                        onClick={(e) => handleToggleFavorite(e, k.id, k.businessName)}
                        className="absolute top-3 end-3 w-9 h-9 rounded-full bg-surface/95 hover:bg-surface flex items-center justify-center text-ink transition-all active:scale-90 shadow-xs z-10"
                        title={t('saveFavKitchens')}
                        aria-label={t('saveFavKitchens')}
                      >
                        <Heart
                          className={`w-4 h-4 transition-colors ${
                            favoriteSellerIds.has(k.id)
                              ? 'fill-red-500 text-red-500'
                              : 'text-muted hover:text-red-500'
                          }`}
                        />
                      </button>

                      {/* Bottom Left: the kitchen's own prep time. Delivery fee and ETA depend on
                          the kitchen's delivery terms and the buyer's address, so they are shown
                          on the dish cards and menu, not guessed here. */}
                      {k.minPrepTimeMinutes ? (
                        <div className="absolute bottom-3 start-3 px-2.5 py-1 rounded-full bg-surface/95 text-ink text-xs font-bold shadow-xs">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-muted" />
                            <span>{t('minPrep', { min: k.minPrepTimeMinutes })}</span>
                          </span>
                        </div>
                      ) : null}

                      {/* Bottom Right: Star Rating (or "New" until the kitchen has reviews) */}
                      <span className="absolute bottom-3 end-3 px-2.5 py-1 rounded-full bg-surface/95 text-ink text-xs font-extrabold flex items-center gap-1 shadow-xs">
                        {rating ? (
                          <>
                            <Star className="w-3 h-3 fill-accent text-accent" />
                            <span>{rating}</span>
                            {k.totalReviews ? (
                              <span className="text-muted text-[11px] font-semibold">({k.totalReviews})</span>
                            ) : null}
                          </>
                        ) : (
                          <span>{t('new')}</span>
                        )}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        {/* Header: Title + Verified Badge + Avatar */}
                        <div className="flex items-start justify-between gap-2.5 mb-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-extrabold text-ink text-base leading-tight truncate">
                                {k.businessName}
                              </h3>
                              <CheckCircle2 className="w-4 h-4 text-brand-ink shrink-0" />
                            </div>
                            <p className="text-[13px] text-muted truncate mt-0.5">
                              {displayChef} · {communityName}
                            </p>
                          </div>

                          {k.avatar && (
                            <img
                              src={imageVariant(k.avatar, 'sm')}
                              loading="lazy"
                              decoding="async"
                              alt={k.businessName}
                              className="w-9 h-9 rounded-full object-cover ring-2 ring-line shadow-2xs shrink-0"
                            />
                          )}
                        </div>

                        {/* Cuisines: Dot-Separated Clean Row */}
                        {k.cuisines && k.cuisines.length > 0 && (
                          <p className="text-[13px] text-muted line-clamp-1 mt-1">
                            {k.cuisines.slice(0, 4).join(' · ')}
                          </p>
                        )}

                        {/* One dish from the menu (the API returns a few, in no popularity order) */}
                        {k.products && k.products.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-muted truncate min-w-0">
                              <span className="px-2 py-0.5 rounded-full bg-accent-soft text-accent-soft-ink font-extrabold text-[11px] shrink-0">
                                {t('onTheMenu')}
                              </span>
                              <span className="font-semibold text-ink truncate">{k.products[0].name}</span>
                            </div>
                            <span className="font-black text-ink shrink-0 ms-2">Rs {k.products[0].price}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer CTA */}
                      <div className="pt-2 border-t border-line flex items-center justify-between text-xs">
                        <span
                          className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                            isClosed
                              ? 'text-accent-soft-ink bg-accent-soft'
                              : 'text-brand-soft-ink bg-brand-soft'
                          }`}
                        >
                          {isClosed ? (k.acceptsPreOrders ? t('preOrderSlot') : t('kitchenClosed')) : t('domesticKitchen')}
                        </span>
                        <span className="font-bold text-brand-ink inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          <span>{isClosed ? (k.acceptsPreOrders ? t('checkPreOrder') : t('viewSchedule')) : t('viewMenu')}</span>
                          <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Dishes & Frozen Packs View
    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <h3 className="text-base font-bold text-red-800 mb-1.5">{t('couldntLoadDishes')}</h3>
          <p className="text-red-600 text-xs mb-3">{t('loadDishesError')}</p>
          <Button onClick={() => loadProducts()} variant="outline" className="border-red-300 text-red-700 text-xs">
            {t('retry')}
          </Button>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted font-semibold text-sm">
            {selectedCommunity ? t('loadingDishesIn', { area: selectedCommunity.name }) : t('loadingDishes')}
          </p>
        </div>
      );
    }

    if (products.length === 0) {
      const hasFilters = isAnyFilterActive || selectedCategory !== 'all';
      return (
        <div className="bg-surface rounded-[20px] border border-dashed border-line-strong p-10 text-center">
          <h2 className="text-xl font-extrabold text-ink mb-1.5">
            {hasFilters
              ? t('noDishesMatch')
              : selectedCommunity
              ? t('noDishesListedIn', { area: selectedCommunity.name })
              : t('noDishesListed')}
          </h2>
          <p className="text-muted text-xs mb-5 max-w-md mx-auto">
            {hasFilters
              ? t('clearFiltersHint')
              : t('noDishesHint')}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            {hasFilters ? (
              <Button onClick={handleClearAllFilters} variant="outline" className="text-xs font-semibold">
                {t('clearFilters')}
              </Button>
            ) : (
              <Button onClick={openSelectorModal} variant="outline" className="text-xs font-semibold">
                {t('changeArea')}
              </Button>
            )}
            <button
              onClick={() => setViewMode('kitchens')}
              className="flame-btn px-4 py-2 text-xs font-bold rounded-xl"
            >
              {t('browseKitchens')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-muted">
            {t(totalProducts === 1 ? 'foundDishOne' : 'foundDishMany', { count: totalProducts })}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {products.map((product) => {
            const rating = displayRating(product.ratingAverage, product.totalReviews);
            const eta = deliveryEtaLabel(product, t);
            const feeLabel = deliveryFeeLabel(product, t);
            const distanceLabel = formatDeliveryDistance(product);
            const typeBadge = product.productType ? PRODUCT_TYPE_BADGES[product.productType] : undefined;
            const TypeIcon = typeBadge?.icon;
            const typeLabelKey = productTypeKey(product.productType);

            return (
              <Link
                key={product.id}
                href={`/products/${product.id}`}
                className="group flex flex-col justify-between bg-surface rounded-[20px] border border-line hover:border-line-strong hover:shadow-[var(--shadow-card)] transition-all duration-200 overflow-hidden"
              >
                <div className="aspect-[16/11] bg-raised relative overflow-hidden">
                  <CoverImage
                    src={product.primaryImage}
                    alt={product.name}
                    label={product.name}
                    size="md"
                    className="w-full h-full group-hover:scale-[1.03] transition-transform duration-500"
                  />

                  {/* Product type tag (Fresh Cook / Frozen / Ready to Eat / Ready to Cook), from the API */}
                  {typeBadge && TypeIcon && typeLabelKey && (
                    <span
                      className={`absolute top-2.5 start-2.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold ${typeBadge.className} shadow-xs z-10 flex items-center gap-1`}
                    >
                      <TypeIcon className="w-3 h-3" />
                      <span>{t(typeLabelKey)}</span>
                    </span>
                  )}

                  {/* Estimated delivery (API estimate; only when the kitchen delivers to the buyer) */}
                  {eta && (
                    <span className="absolute bottom-2.5 start-2.5 px-2 py-0.5 rounded-full bg-surface/95 text-ink text-[11px] font-bold flex items-center gap-1 z-10 shadow-xs">
                      <Clock className="w-3 h-3 text-muted" />
                      <span>{eta}</span>
                    </span>
                  )}

                  {/* Save / Favorite Kitchen Button */}
                  {product.seller?.id && (
                    <button
                      onClick={(e) => handleToggleFavorite(e, product.seller.id, product.seller.businessName)}
                      className="absolute top-2.5 end-2.5 w-9 h-9 rounded-full bg-surface/95 hover:bg-surface flex items-center justify-center text-ink transition-transform active:scale-90 shadow-xs z-10"
                      title={t('saveFavKitchens')}
                      aria-label={t('saveFavKitchens')}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 transition-colors ${
                          favoriteSellerIds.has(product.seller.id)
                            ? 'fill-red-500 text-red-500'
                            : 'text-muted hover:text-red-500'
                        }`}
                      />
                    </button>
                  )}
                </div>

                <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Clean Chef & Community Row */}
                    <h3 className="font-extrabold text-ink text-sm sm:text-[15px] leading-snug line-clamp-2">
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between gap-1.5 mt-1 flex-wrap">
                      <div className="flex items-center gap-1 min-w-0">
                        <ChefHat className="w-3.5 h-3.5 text-muted shrink-0" />
                        <span className="text-xs text-muted truncate">
                          {product.seller?.businessName || t('homeKitchen')}
                        </span>
                      </div>

                      {product.isSameCommunity ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-brand-soft text-brand-soft-ink text-[11px] font-extrabold flex items-center gap-1">
                          <Home className="w-2.5 h-2.5" />
                          <span>{t('inYourArea')}</span>
                        </span>
                      ) : distanceLabel ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-raised text-muted text-[11px] font-medium">
                          {distanceLabel}
                        </span>
                      ) : null}
                    </div>

                    {(feeLabel || product.unit) && (
                      <div className="flex items-center gap-1 text-[11px] text-muted mt-1">
                        {feeLabel && (
                          <>
                            <Bike className="w-3 h-3 text-muted shrink-0" />
                            <span title={product.delivery?.reason || undefined}>{feeLabel}</span>
                          </>
                        )}
                        {product.unit && <span>{feeLabel ? '• ' : ''}{t('perUnit', { unit: product.unit })}</span>}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      {promotionsByProductId[product.id]?.length ? (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[15px] font-extrabold text-ink">
                            {formatPrice(getStackedDiscountedPrice(product.price, promotionsByProductId[product.id]))}
                          </span>
                          <span className="text-xs text-muted line-through">
                            {formatPrice(product.price)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[15px] font-extrabold text-ink">
                          {formatPrice(product.price)}
                        </span>
                      )}
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-ink font-extrabold">
                        {rating ? (
                          <>
                            <Star className="w-3 h-3 fill-accent text-accent" />
                            <span>{rating}</span>
                            {product.totalReviews ? (
                              <span className="text-muted font-normal">({product.totalReviews})</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">{t('new')}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleQuickAddToCart(e, product)}
                      disabled={addingProductId === product.id}
                      title={t('addToCart')}
                      aria-label={t('addToCart')}
                      className="flex items-center justify-center gap-1 h-9 min-w-9 px-2.5 sm:px-3 rounded-[10px] bg-brand hover:bg-brand-500 text-on-brand font-extrabold text-sm transition-all active:scale-95 cursor-pointer"
                    >
                      {addingProductId === product.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4" strokeWidth={3} />
                          <span className="hidden sm:inline">{tc('add')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-center items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              size="sm"
              className="rounded-xl text-xs font-semibold"
            >
              {t('prevPage')}
            </Button>
            <span className="px-3 py-1.5 text-xs font-medium text-muted">
              {t('pageOf', { page, total: totalPages })}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              size="sm"
              className="rounded-xl text-xs font-semibold"
            >
              {t('nextPage')}
            </Button>
          </div>
        )}
      </>
    );
  }

  if (isAuthenticated) {
    return (
      <DashboardLayout
        title={t('dashTitle')}
        subtitle={t('dashSubtitle')}
        sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
        userType="customer"
      >
        <div className="space-y-6">
          {renderFilterBar()}
          {renderMarketplaceContent()}
        </div>
        <CartConflictModal isOpen={!!cartConflict} conflict={cartConflict} />
        <ClosedKitchenModal
          isOpen={!!closedKitchenModalData}
          onClose={() => setClosedKitchenModalData(null)}
          kitchenName={closedKitchenModalData?.businessName || t('homeKitchen')}
          chefName={closedKitchenModalData?.chefName}
          avatar={closedKitchenModalData?.avatar}
          opensAt={closedKitchenModalData?.opensAt}
          allowsPreOrder={closedKitchenModalData?.acceptsPreOrders === true}
          // '' (not undefined) hides the modal's "Next Slot" row instead of its built-in placeholder time
          nextAvailableSlot={closedKitchenModalData?.preOrderDeliveryTime ?? ''}
          onProceedToMenu={() => {
            if (closedKitchenModalData) {
              const preorderParam = closedKitchenModalData.acceptsPreOrders ? 'true' : 'false';
              router.push(`/kitchens/${closedKitchenModalData.id}?preorder=${preorderParam}`);
              setClosedKitchenModalData(null);
            }
          }}
          onBrowseOpenKitchens={() => {
            setOpenNow(true);
            setClosedKitchenModalData(null);
          }}
        />
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-screen bg-page text-ink pb-24">
      <SiteHeader />

      {/* Main Multi-Vendor Marketplace Container */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 md:py-10">
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-soft text-accent-soft-ink text-xs sm:text-[13px] font-extrabold mb-3">
            <ChefHat className="w-3.5 h-3.5" />
            <span>{t('catalogBadge')}</span>
          </div>
          <h1 className="text-[28px] sm:text-[40px] leading-tight font-extrabold text-ink tracking-tight">
            {selectedCommunity?.city ? t('publicTitleCity', { city: selectedCommunity.city }) : t('publicTitle')}
          </h1>
          <p className="mt-2 text-muted text-[15px] sm:text-base max-w-2xl leading-relaxed">
            {t('publicSubtitle')}
          </p>
        </div>

        <div className="space-y-6">
          {renderFilterBar()}
          {renderMarketplaceContent()}
        </div>
        <CartConflictModal isOpen={!!cartConflict} conflict={cartConflict} />
        <ClosedKitchenModal
          isOpen={!!closedKitchenModalData}
          onClose={() => setClosedKitchenModalData(null)}
          kitchenName={closedKitchenModalData?.businessName || t('homeKitchen')}
          chefName={closedKitchenModalData?.chefName}
          avatar={closedKitchenModalData?.avatar}
          opensAt={closedKitchenModalData?.opensAt}
          allowsPreOrder={closedKitchenModalData?.acceptsPreOrders === true}
          // '' (not undefined) hides the modal's "Next Slot" row instead of its built-in placeholder time
          nextAvailableSlot={closedKitchenModalData?.preOrderDeliveryTime ?? ''}
          onProceedToMenu={() => {
            if (closedKitchenModalData) {
              const preorderParam = closedKitchenModalData.acceptsPreOrders ? 'true' : 'false';
              router.push(`/kitchens/${closedKitchenModalData.id}?preorder=${preorderParam}`);
              setClosedKitchenModalData(null);
            }
          }}
          onBrowseOpenKitchens={() => {
            setOpenNow(true);
            setClosedKitchenModalData(null);
          }}
        />
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const t = useT(browseMessages);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-page flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-muted">{t('loadingFallback')}</p>
          </div>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
