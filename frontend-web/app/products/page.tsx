'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { getStackedDiscountedPrice } from '@/lib/pricing';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { productService, Product } from '@/lib/services/product.service';
import { addressService } from '@/lib/services/address.service';
import { displayRating, formatPrice, imageVariant } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CoverImage } from '@/components/ui/CoverImage';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { apiClient } from '@/lib/api-client';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { BrandLockup } from '@/components/ui/Mark';
import { useCommunityStore } from '@/lib/store/community-store';
import { CommunitySelector } from '@/components/community/CommunitySelector';
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
  ShoppingBag,
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
  frozen: { icon: Snowflake, className: 'bg-sky-600/95 shadow-sky-600/30' },
  fresh: { icon: Flame, className: 'bg-[#FF5500]/95 shadow-orange-500/30' },
  ready_to_eat: { icon: Clock, className: 'bg-[#FF5500]/95 shadow-orange-500/30' },
  ready_to_cook: { icon: UtensilsCrossed, className: 'bg-[#FF5500]/95 shadow-orange-500/30' },
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
function deliveryFeeLabel(p: Product, t: BrowseT): string | null {
  if (!p.delivery) return null;
  if (!p.delivery.deliverable) return t('deliveryNotHere');
  return p.delivery.fee === 0 ? t('freeDelivery') : t('feeDelivery', { fee: p.delivery.fee });
}

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { showToast } = useToast();
  const { items: cartItems } = useCartStore();
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
  const [sortBy, setSortBy] = useState('newest');
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
  } = useCommunityStore();
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

  // Customer coordinates for accurate delivery distance
  useEffect(() => {
    if (!isAuthenticated) return;
    addressService
      .getAddresses()
      .then((res) => {
        const addresses = res.data || [];
        const withCoords = addresses.find((a) => a.isDefault && a.coordinates) || addresses.find((a) => a.coordinates);
        if (withCoords?.coordinates) {
          setCustomerLocation({ lat: withCoords.coordinates.latitude, lng: withCoords.coordinates.longitude });
        }
      })
      .catch(() => setCustomerLocation(null));
  }, [isAuthenticated]);

  useEffect(() => {
    loadProducts();
  }, [
    page, selectedCategory, selectedProductType, sortBy, searchQuery, openNow,
    deliveryAvailable, pickupAvailable, freeDelivery, offersAvailable,
    businessType, maxDistanceKm, fastDeliveryOnly, customerLocation, selectedCommunity?.id,
  ]);

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
      const productTypeValue = selectedProductType !== 'all' ? (selectedProductType as any) : undefined;
      const response = await productService.getProducts({
        page,
        limit: 24,
        categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
        productType: productTypeValue,
        sort: sortBy as any,
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
      router.push('/login');
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
    } catch (err: any) {
      if (err?.response?.status === 409 || err?.response?.data?.error?.code === 'CART_SELLER_MISMATCH') {
        const details = err?.response?.data?.error?.details;
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
        const msg = err?.response?.data?.error?.message || err?.message || t('toastAddDishFailed');
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
      router.push('/login');
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
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {viewMode === 'kitchens' ? t('titleKitchens') : t('titleDishes')}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
            <span>{selectedCommunity ? t('deliveringTo') : t('chooseAreaHint')}</span>
            <button
              type="button"
              onClick={openSelectorModal}
              className="font-bold text-[#FF5500] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3 h-3 text-[#FF5500]" />
              <span>{selectedCommunity?.name || t('selectArea')}</span>
            </button>
            {selectedCommunity?.city && (
              <>
                <span className="text-slate-300">•</span>
                <span>{selectedCommunity.city}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Unified Search & Filters Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3 sm:p-3.5 space-y-3">
        {/* Top Row: Search Input + View Mode Switcher + Sort */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Clean Search Input */}
          <form onSubmit={handleSearch} className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full ps-10 pe-20 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-slate-50/70 focus:bg-white transition-all h-10"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute end-12 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                title={t('clearSearch')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="absolute end-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              {tc('search')}
            </button>
          </form>

          {/* View Switcher: Kitchens vs Dishes */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60 h-10 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('kitchens')}
              className={`flex items-center gap-1.5 px-3.5 py-1 rounded-lg text-xs font-bold transition-all h-full cursor-pointer ${
                viewMode === 'kitchens'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>{t('viewKitchens')}</span>
              {activeCommunityDetail && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                    viewMode === 'kitchens' ? 'bg-slate-100 text-slate-900' : 'bg-white/40 text-slate-600'
                  }`}
                >
                  {(activeCommunityDetail.sellers || []).length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('dishes')}
              className={`flex items-center gap-1.5 px-3.5 py-1 rounded-lg text-xs font-bold transition-all h-full cursor-pointer ${
                viewMode === 'dishes'
                  ? 'bg-[#FF5500] text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>{t('viewDishes')}</span>
              {!loading && !error && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                    viewMode === 'dishes' ? 'bg-white/20 text-white' : 'bg-white/40 text-slate-600'
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
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="border border-slate-200 rounded-xl px-3 py-1 text-xs font-semibold text-slate-700 bg-white hover:border-slate-300 focus:ring-2 focus:ring-slate-900 h-10 cursor-pointer"
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
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {productTypeOptions.map((type) => {
              const isSelected = selectedProductType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => {
                    setSelectedProductType(type.value);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white font-bold shadow-2xs'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {t(type.labelKey)}
                </button>
              );
            })}

            <div className="h-4 w-px bg-slate-200 mx-1 shrink-0" />

            <button
              onClick={() => {
                setOpenNow(!openNow);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                openNow
                  ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${openNow ? 'bg-white' : 'bg-emerald-500'}`} />
              <span>{t('openNow')}</span>
            </button>

            <button
              onClick={() => {
                setFreeDelivery(!freeDelivery);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                freeDelivery
                  ? 'bg-slate-900 text-white font-bold shadow-2xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {t('freeDeliveryChip')}
            </button>

            <button
              onClick={() => {
                setFastDeliveryOnly(!fastDeliveryOnly);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                fastDeliveryOnly
                  ? 'bg-slate-900 text-white font-bold shadow-2xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {t('under45')}
            </button>
          </div>

          {isAnyFilterActive && (
            <button
              onClick={handleClearAllFilters}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors cursor-pointer py-1 px-2"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="h-80 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
          ))}
        </div>
      );

      // No community chosen (yet): there is nothing real to list, so ask the buyer to pick one.
      if (!selectedCommunity) {
        if (communitiesLoading || !communityListReady) return kitchenSkeleton;
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 text-[#FF5500] flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-7 h-7 text-[#FF5500]" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {communitiesError ? t('areasLoadError') : t('chooseYourArea')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
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
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[11px] font-bold uppercase tracking-wider mb-1">
                <MapPin className="w-3 h-3 text-[#FF5500]" />
                <span>{t('hyperlocal', { name: communityName })}</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {t('verifiedDomestic')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('independentChefs')}
              </p>
            </div>
            {activeCommunityDetail && (
              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
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
            <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 text-[#FF5500] flex items-center justify-center mx-auto mb-4">
                <Store className="w-7 h-7 text-[#FF5500]" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                {allKitchens.length > 0
                  ? t('noneOpenIn', { area: communityName })
                  : t('noneYetIn', { area: communityName })}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
                {allKitchens.length > 0
                  ? t('turnOffOpenNow')
                  : t('noneJoined', { area: communityName })}
              </p>

              {activeCommunityDetail?.neighbors && activeCommunityDetail.neighbors.length > 0 && (
                <div className="flex flex-col items-center gap-2 mb-5">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#FF5500] text-xs font-bold border border-orange-200 transition-colors shadow-2xs"
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    className={`group flex flex-col justify-between rounded-2xl border transition-all duration-300 overflow-hidden ${
                      isClosed
                        ? 'bg-slate-50/80 border-slate-300/80 opacity-75 grayscale-[25%] hover:opacity-100 hover:grayscale-0 hover:bg-white hover:border-amber-300 hover:shadow-lg'
                        : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xl hover:-translate-y-1'
                    }`}
                  >
                    {/* Cover Image with Modern Aspect Ratio & Subtle Overlays */}
                    <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                      <CoverImage
                        src={k.coverImageUrl}
                        alt={k.businessName}
                        label={k.businessName}
                        size="md"
                        className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15 pointer-events-none" />

                      {/* Clean Top Status */}
                      {isClosed ? (
                        <span className="absolute top-3 start-3 px-2.5 py-1 rounded-full text-white text-[11px] font-bold bg-black/80 backdrop-blur-md inline-flex items-center gap-1.5 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
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
                        <span className="absolute top-3 start-3 px-2.5 py-1 rounded-full text-white text-[11px] font-bold bg-black/50 backdrop-blur-md inline-flex items-center gap-1 shadow-2xs">
                          <ChefHat className="w-3 h-3 text-[#FF5500]" />
                          <span>{t('homeKitchen')}</span>
                        </span>
                      )}

                      {/* Favorite Button */}
                      <button
                        onClick={(e) => handleToggleFavorite(e, k.id, k.businessName)}
                        className="absolute top-3 end-3 w-8 h-8 rounded-full bg-white/90 hover:bg-white backdrop-blur-xs flex items-center justify-center text-slate-700 transition-all active:scale-90 shadow-xs z-10"
                        title={t('saveFavKitchens')}
                      >
                        <Heart
                          className={`w-4 h-4 transition-colors ${
                            favoriteSellerIds.has(k.id)
                              ? 'fill-red-500 text-red-500'
                              : 'text-slate-600 hover:text-red-500'
                          }`}
                        />
                      </button>

                      {/* Bottom Left: the kitchen's own prep time. Delivery fee and ETA depend on
                          the kitchen's delivery terms and the buyer's address, so they are shown
                          on the dish cards and menu, not guessed here. */}
                      {k.minPrepTimeMinutes ? (
                        <div className="absolute bottom-2.5 start-3 flex items-center gap-1.5 text-white text-xs font-semibold drop-shadow-sm">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-300" />
                            <span>{t('minPrep', { min: k.minPrepTimeMinutes })}</span>
                          </span>
                        </div>
                      ) : null}

                      {/* Bottom Right: Star Rating (or "New" until the kitchen has reviews) */}
                      <span className="absolute bottom-2.5 end-3 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1 shadow-2xs">
                        {rating ? (
                          <>
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{rating}</span>
                            {k.totalReviews ? (
                              <span className="text-white/60 text-[11px] font-normal">({k.totalReviews})</span>
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
                              <h3 className="font-extrabold text-slate-900 text-base group-hover:text-[#FF5500] transition-colors leading-tight truncate">
                                {k.businessName}
                              </h3>
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            </div>
                            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                              {displayChef} • {communityName}
                            </p>
                          </div>

                          {k.avatar && (
                            <img
                              src={imageVariant(k.avatar, 'sm')}
                              loading="lazy"
                              decoding="async"
                              alt={k.businessName}
                              className="w-9 h-9 rounded-full object-cover ring-2 ring-slate-100 shadow-2xs shrink-0"
                            />
                          )}
                        </div>

                        {/* Cuisines: Dot-Separated Clean Row */}
                        {k.cuisines && k.cuisines.length > 0 && (
                          <p className="text-xs text-slate-600 font-medium line-clamp-1 mt-1">
                            {k.cuisines.slice(0, 4).join(' • ')}
                          </p>
                        )}

                        {/* One dish from the menu (the API returns a few, in no popularity order) */}
                        {k.products && k.products.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-slate-600 truncate min-w-0">
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold text-[11px] uppercase tracking-wider shrink-0">
                                {t('onTheMenu')}
                              </span>
                              <span className="font-semibold text-slate-800 truncate">{k.products[0].name}</span>
                            </div>
                            <span className="font-black text-slate-900 shrink-0 ms-2">Rs {k.products[0].price}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer CTA */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            isClosed
                              ? 'text-amber-800 bg-amber-50'
                              : 'text-emerald-700 bg-emerald-50'
                          }`}
                        >
                          {isClosed ? (k.acceptsPreOrders ? t('preOrderSlot') : t('kitchenClosed')) : t('domesticKitchen')}
                        </span>
                        <span className="font-bold text-[#FF5500] inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
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
          <div className="w-10 h-10 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 font-semibold text-xs">
            {selectedCommunity ? t('loadingDishesIn', { area: selectedCommunity.name }) : t('loadingDishes')}
          </p>
        </div>
      );
    }

    if (products.length === 0) {
      const hasFilters = isAnyFilterActive || selectedCategory !== 'all';
      return (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-xs">
          <h2 className="text-xl font-bold text-slate-900 mb-1.5">
            {hasFilters
              ? t('noDishesMatch')
              : selectedCommunity
              ? t('noDishesListedIn', { area: selectedCommunity.name })
              : t('noDishesListed')}
          </h2>
          <p className="text-slate-500 text-xs mb-5 max-w-md mx-auto">
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
          <p className="text-xs font-semibold text-slate-500">
            {t(totalProducts === 1 ? 'foundDishOne' : 'foundDishMany', { count: totalProducts })}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
                className="group flex flex-col justify-between bg-white rounded-2xl border border-slate-200/80 hover:border-[#FF5500]/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="aspect-[16/11] bg-slate-100 relative overflow-hidden">
                  <CoverImage
                    src={product.primaryImage}
                    alt={product.name}
                    label={product.name}
                    size="md"
                    className="w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />

                  {/* Product type tag (Fresh Cook / Frozen / Ready to Eat / Ready to Cook), from the API */}
                  {typeBadge && TypeIcon && typeLabelKey && (
                    <span
                      className={`absolute top-2.5 start-2.5 px-2.5 py-1 rounded-full text-white text-[11px] font-bold ${typeBadge.className} shadow-xs z-10 flex items-center gap-1 backdrop-blur-xs`}
                    >
                      <TypeIcon className="w-3 h-3" />
                      <span>{t(typeLabelKey)}</span>
                    </span>
                  )}

                  {/* Estimated delivery (API estimate; only when the kitchen delivers to the buyer) */}
                  {eta && (
                    <span className="absolute bottom-2.5 start-2.5 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md text-white text-[11px] font-semibold flex items-center gap-1 z-10">
                      <Clock className="w-3 h-3 text-amber-300" />
                      <span>{eta}</span>
                    </span>
                  )}

                  {/* Save / Favorite Kitchen Button */}
                  {product.seller?.id && (
                    <button
                      onClick={(e) => handleToggleFavorite(e, product.seller.id, product.seller.businessName)}
                      className="absolute top-2.5 end-2.5 w-7 h-7 rounded-full bg-white/90 hover:bg-white backdrop-blur-xs flex items-center justify-center text-slate-700 transition-transform active:scale-90 shadow-xs z-10"
                      title={t('saveFavKitchens')}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 transition-colors ${
                          favoriteSellerIds.has(product.seller.id)
                            ? 'fill-red-500 text-red-500'
                            : 'text-slate-600 hover:text-red-500'
                        }`}
                      />
                    </button>
                  )}
                </div>

                <div className="p-3.5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Clean Chef & Community Row */}
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ChefHat className="w-3.5 h-3.5 text-[#FF5500] shrink-0" />
                        <span className="text-[11px] font-bold text-slate-700 truncate">
                          {product.seller?.businessName || t('homeKitchen')}
                        </span>
                      </div>

                      {product.isSameCommunity ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-bold flex items-center gap-1">
                          <Home className="w-2.5 h-2.5" />
                          <span>{t('inYourArea')}</span>
                        </span>
                      ) : distanceLabel ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                          {distanceLabel}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-1 group-hover:text-[#FF5500] transition-colors">
                      {product.name}
                    </h3>

                    {(feeLabel || product.unit) && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                        {feeLabel && (
                          <>
                            <Bike className="w-3 h-3 text-slate-400 shrink-0" />
                            <span title={product.delivery?.reason || undefined}>{feeLabel}</span>
                          </>
                        )}
                        {product.unit && <span>{feeLabel ? '• ' : ''}{t('perUnit', { unit: product.unit })}</span>}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      {promotionsByProductId[product.id]?.length ? (
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-base font-black text-slate-950">
                            {formatPrice(getStackedDiscountedPrice(product.price, promotionsByProductId[product.id]))}
                          </span>
                          <span className="text-xs text-slate-400 line-through">
                            {formatPrice(product.price)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-base font-black text-slate-950">
                          {formatPrice(product.price)}
                        </span>
                      )}
                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-amber-600 font-bold">
                        {rating ? (
                          <>
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{rating}</span>
                            {product.totalReviews ? (
                              <span className="text-slate-400 font-normal">({product.totalReviews})</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-slate-500">{t('new')}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleQuickAddToCart(e, product)}
                      disabled={addingProductId === product.id}
                      title={t('addToCart')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-[#FF5500] text-[#FF5500] hover:text-white border border-orange-200/80 hover:border-transparent font-bold text-xs transition-all active:scale-95 shadow-2xs cursor-pointer"
                    >
                      {addingProductId === product.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>{tc('add')}</span>
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
            <span className="px-3 py-1.5 text-xs font-medium text-slate-600">
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
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] pb-24">
      {/* Dedicated Public Catalog Header */}
      <header className="sticky top-0 z-40 pt-(--safe-top) bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="hover:opacity-95 transition-opacity shrink-0">
              <BrandLockup markSize={32} wordSize={22} />
            </Link>
            <div className="hidden sm:block">
              <CommunitySelector variant="navbar" />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            <Link
              href="/cart"
              className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 transition-colors"
            >
              <ShoppingBag className="w-4 h-4 text-slate-700" />
              {cartItems.length > 0 && (
                <span className="absolute -top-1 -end-1 w-4 h-4 bg-[#FF5500] text-white rounded-full text-[11px] font-bold flex items-center justify-center shadow-xs">
                  {cartItems.length}
                </span>
              )}
            </Link>
            <Link
              href="/login"
              className="h-9 inline-flex items-center px-2 sm:px-3.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {t('signInCaps')}
            </Link>
            <Link href="/register">
              <span className="flame-btn h-9 px-3 sm:px-4 text-xs font-bold rounded-xl">{t('joinNuray')}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Multi-Vendor Marketplace Container */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6 md:py-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[11px] font-bold uppercase tracking-wider mb-2">
            <ChefHat className="w-3 h-3 text-[#FF5500]" />
            <span>{t('catalogBadge')}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {selectedCommunity?.city ? t('publicTitleCity', { city: selectedCommunity.city }) : t('publicTitle')}
          </h1>
          <p className="mt-1 text-slate-500 text-xs sm:text-sm max-w-2xl">
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
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-black text-slate-700">{t('loadingFallback')}</p>
          </div>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
