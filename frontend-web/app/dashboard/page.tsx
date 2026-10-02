'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useCommunityStore } from '@/lib/store/community-store';
import { useToast } from '@/components/ui/toast';
import { isAxiosError } from 'axios';
import { apiClient, ApiError } from '@/lib/api-client';
import { formatPrice, displayRating } from '@/lib/utils';
import { sellerService, PublicSeller } from '@/lib/services/seller.service';
import { productService, Product } from '@/lib/services/product.service';
import { communityService, CommunityDetail } from '@/lib/services/community.service';
import { cartService } from '@/lib/services/cart.service';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { CoverImage } from '@/components/ui/CoverImage';
import { CuisineCarousel, PLATFORM_CUISINES } from '@/components/marketplace/CuisineCarousel';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Trophy,
  TrendingUp,
  Bike,
  ChefHat,
  Star,
  MapPin,
  Clock,
  ShieldCheck,
  Tag,
  Copy,
  Check,
  Flame,
  Snowflake,
  ShoppingBag,
  Plus,
  Info,
  ArrowRight,
  Gift,
  Zap,
  X,
  Dices,
  Shuffle,
  RotateCcw,
  SlidersHorizontal,
  Layers,
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { commonMessages, statusKey } from '@/lib/i18n/messages/common';
import { dashboardMessages } from '@/lib/i18n/messages/dashboard';

type DashboardT = ReturnType<typeof useT<typeof dashboardMessages.en>>;

interface Order {
  id: string;
  orderNumber: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
  itemsCount: number;
  items: Array<{
    id: string;
    productName: string;
    productImage: string | null;
    quantity: number;
  }>;
}

// The products API also returns each dish's category and preparation time.
type ListedProduct = Product & {
  category?: { name?: string | null } | null;
  preparationTime?: number | null;
};

/** A real dish from the products API, shaped for the dashboard rows. */
interface DashboardDish {
  id: string;
  name: string;
  nameUrdu?: string | null;
  kitchenName: string;
  sellerId: string;
  price: number;
  /** Only set when it is above the current price (a real discount). */
  originalPrice: number | null;
  photo: string | null;
  isFrozen: boolean;
  /** From displayRating(): null until the dish has reviews, shown as "New". */
  rating: string | null;
  prepTimeMinutes: number | null;
  /** Category, kitchen meal categories and name, lowercased, for the cuisine rows. */
  searchText: string;
}

function toDashboardDish(p: ListedProduct): DashboardDish {
  const price = Number(p.price) || 0;
  const originalPrice = Number(p.originalPrice) || 0;
  return {
    id: p.id,
    name: p.name,
    nameUrdu: p.nameUrdu,
    kitchenName: p.seller?.businessName || '',
    sellerId: p.seller?.id || '',
    price,
    originalPrice: originalPrice > price ? originalPrice : null,
    photo: p.primaryImage || null,
    isFrozen: p.productType === 'frozen',
    rating: displayRating(p.ratingAverage, p.totalReviews),
    prepTimeMinutes: p.preparationTime && p.preparationTime > 0 ? p.preparationTime : null,
    searchText: [p.category?.name, ...(p.seller?.mealCategories || []), p.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  };
}

/** The kitchen's real number of listed dishes (the list response only carries a few of them). */
function dishCountLabel(t: DashboardT, k: PublicSeller): string {
  const count = k.productCount ?? k.products?.length ?? 0;
  return t(count === 1 ? 'dishCountOne' : 'dishCount', { count });
}

/** "20% off" when the kitchen lists a higher original price; nothing otherwise. */
function DealBadge({ dish }: { dish: DashboardDish }) {
  const t = useT(dashboardMessages);
  if (!dish.originalPrice) return null;
  const percentOff = Math.round((1 - dish.price / dish.originalPrice) * 100);
  if (percentOff <= 0) return null;
  return (
    <span className="absolute top-2.5 start-2.5 px-2 py-0.5 rounded-lg text-white text-[10px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider flex items-center gap-1">
      <Tag className="w-3 h-3" />
      <span>{t('percentOff', { percent: percentOff })}</span>
    </span>
  );
}

// Cuisine → Kitchen mapping (which kitchen specialties match which cuisine query)
const CUISINE_KITCHEN_TAGS: Record<string, string[]> = {
  biryani: ['biryani', 'dum', 'rice', 'zafrani'],
  nihari: ['nihari', 'slow', 'maghaz', 'nalli', 'curry'],
  paratha: ['paratha', 'tiffin', 'nashta', 'breakfast', 'bread', 'ghee'],
  kebab: ['kebab', 'kabab', 'bbq', 'charcoal', 'grill', 'boti', 'seekh', 'shami'],
  halwa: ['halwa', 'puri', 'breakfast', 'nashta', 'morning', 'meetha'],
  karahi: ['karahi', 'curry', 'gosht', 'kunna', 'murgh'],
  frozen: ['frozen', 'sub-zero', 'cold', 'samosa', 'roll', 'patties', 'nuggets'],
  kheer: ['kheer', 'dessert', 'sweet', 'mithai', 'meetha', 'matka'],
  pulao: ['pulao', 'yakhni', 'rice', 'bannu'],
  samosa: ['samosa', 'snack', 'frozen', 'savories'],
};

// Pure Fisher-Yates array shuffler for random mode
function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { selectedCommunity } = useCommunityStore();
  const { addItem: addCartItem, appliedPromoCode, setAppliedPromoCode } = useCartStore();
  const { showToast } = useToast();
  const t = useT(dashboardMessages);
  const tc = useT(commonMessages);

  // Strict RBAC: Route non-customer roles directly to their specialized dashboards
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const role = user.userType || user.user_type;
    if (role === 'seller') {
      router.replace('/sellers/dashboard');
      return;
    }
    if (role === 'rider') {
      router.replace('/riders/dashboard');
      return;
    }
    if (role === 'admin') {
      router.replace('/admin/dashboard');
      return;
    }
  }, [isAuthenticated, user, router]);

  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [selectedCuisine, setSelectedCuisine] = useState<string>('');
  const [viewMode, setViewMode] = useState<'all' | 'kitchens' | 'trending' | 'top10' | 'cuisine'>('all');
  const [isRandomOrder, setIsRandomOrder] = useState(false);
  const [shuffleNonce, setShuffleNonce] = useState(0);
  const [dishesFilter, setDishesFilter] = useState<'all' | 'fresh' | 'frozen'>('all');
  const [dbSellers, setDbSellers] = useState<PublicSeller[]>([]);
  const [communityDetail, setCommunityDetail] = useState<CommunityDetail | null>(null);
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    existingKitchenName: string;
    dish: DashboardDish | null;
  }>({
    isOpen: false,
    existingKitchenName: '',
    dish: null,
  });
  const [switchingKitchen, setSwitchingKitchen] = useState(false);

  // Real dishes from the products API, most popular first (kitchens in the selected
  // community are listed first by the API).
  const [trendingDishes, setTrendingDishes] = useState<DashboardDish[]>([]);
  const [dishesLoading, setDishesLoading] = useState(true);

  // Label for selected cuisine
  const selectedCuisineLabel = useMemo(() => {
    if (!selectedCuisine) return '';
    return PLATFORM_CUISINES.find((c) => c.query === selectedCuisine)?.label || selectedCuisine;
  }, [selectedCuisine]);

  // Filtered trending dishes matching cuisine + prep type
  const matchingDishes = useMemo(() => {
    return trendingDishes.filter((dish) => {
      if (selectedCuisine) {
        const tags = CUISINE_KITCHEN_TAGS[selectedCuisine] || [selectedCuisine];
        if (!tags.some((t) => dish.searchText.includes(t))) return false;
      }
      if (dishesFilter === 'fresh' && dish.isFrozen) return false;
      if (dishesFilter === 'frozen' && !dish.isFrozen) return false;
      return true;
    });
  }, [trendingDishes, selectedCuisine, dishesFilter]);

  // Display dishes (algorithmic or shuffled randomly)
  const displayDishes = useMemo(() => {
    let list = [...matchingDishes];
    if (isRandomOrder) {
      list = shuffleArray(list);
    }
    return list;
  }, [matchingDishes, isRandomOrder, shuffleNonce]);

  // Filtered kitchens matching selected cuisine
  const matchingKitchens = useMemo(() => {
    if (!selectedCuisine || dbSellers.length === 0) return dbSellers;
    const tags = CUISINE_KITCHEN_TAGS[selectedCuisine] || [selectedCuisine];
    const matched = dbSellers.filter((k) => {
      const kitchenText = [
        k.businessName,
        ...(k.mealCategories || []),
        ...(k.products?.map((p: { name: string }) => p.name) || []),
      ]
        .join(' ')
        .toLowerCase();
      return tags.some((t) => kitchenText.includes(t));
    });
    // If no match, show all (graceful fallback)
    return matched.length > 0 ? matched : dbSellers;
  }, [dbSellers, selectedCuisine]);

  // Display kitchens (algorithmic or shuffled randomly)
  const displayKitchens = useMemo(() => {
    let list = [...matchingKitchens];
    if (isRandomOrder) {
      list = shuffleArray(list);
    }
    return list.slice(0, viewMode === 'kitchens' ? 12 : 6);
  }, [matchingKitchens, isRandomOrder, shuffleNonce, viewMode]);

  // Netflix-style Row Scrollers
  const top10RowRef = useRef<HTMLDivElement>(null);
  const kitchensRowRef = useRef<HTMLDivElement>(null);
  const biryaniRowRef = useRef<HTMLDivElement>(null);
  const slowPotRowRef = useRef<HTMLDivElement>(null);
  const frozenRowRef = useRef<HTMLDivElement>(null);

  const scrollRow = (ref: React.RefObject<HTMLDivElement | null>, offset: number) => {
    if (ref.current) {
      ref.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Top 10 dishes for signature Netflix row with giant numerals
  const top10Dishes = useMemo(() => {
    return displayDishes.slice(0, 10);
  }, [displayDishes]);

  // Biryani & Rice Degs rail
  const biryaniDishes = useMemo(() => {
    return displayDishes.filter((d) =>
      ['biryani', 'pulao', 'rice', 'dum'].some((t) => d.searchText.includes(t))
    );
  }, [displayDishes]);

  // Slow Pots: Nihari, Karahi, Slow Braise
  const slowPotDishes = useMemo(() => {
    return displayDishes.filter((d) =>
      ['nihari', 'karahi', 'curry', 'kunna', 'gosht', 'kebab'].some((t) => d.searchText.includes(t))
    );
  }, [displayDishes]);

  // Sub-Zero Frozen Savories
  const frozenSavoriesDishes = useMemo(() => {
    return displayDishes.filter((d) =>
      d.isFrozen || ['samosa', 'roll', 'frozen', 'patties', 'paratha', 'shami'].some((t) => d.searchText.includes(t))
    );
  }, [displayDishes]);

  const handleRandomize = () => {
    setIsRandomOrder(true);
    setShuffleNonce((prev) => prev + 1);
    showToast(t('toastShuffled'), 'info');
  };

  const handleResetOrder = () => {
    setIsRandomOrder(false);
    setShuffleNonce(0);
    showToast(t('toastRestored'), 'info');
  };

  // Load active orders and verified kitchens
  useEffect(() => {
    let cancelled = false;

    sellerService
      .getPublicSellers()
      .then((sellers) => {
        if (!cancelled && sellers) setDbSellers(sellers);
      })
      .catch((err) => console.error('Failed to load sellers on dashboard:', err));

    setDishesLoading(true);
    productService
      .getProducts({ sort: 'popular', limit: 40, communityId: selectedCommunity?.id })
      .then((res) => {
        if (cancelled) return;
        const products = (res?.data?.products || []) as ListedProduct[];
        setTrendingDishes(products.map(toDashboardDish));
      })
      .catch((err) => {
        console.error('Failed to load dishes on dashboard:', err);
        if (!cancelled) setTrendingDishes([]);
      })
      .finally(() => {
        if (!cancelled) setDishesLoading(false);
      });

    const commId = selectedCommunity?.id || selectedCommunity?.slug || 'askari-11';
    communityService
      .getCommunity(commId)
      .then((detail) => {
        if (!cancelled && detail) setCommunityDetail(detail);
      })
      .catch(() => {});

    if (isAuthenticated) {
      apiClient
        .get('/orders/me?page=1&limit=5')
        .then((res) => {
          if (!cancelled) {
            const orders: Order[] = res.data?.data?.orders || [];
            const lastPlacedId = typeof window !== 'undefined' ? sessionStorage.getItem('lastPlacedOrderId') : null;
            const active = orders.find((o) => {
              const isActiveStatus = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit'].includes(o.orderStatus);
              if (!isActiveStatus) return false;
              if (lastPlacedId && o.id === lastPlacedId) return true;
              const orderAgeHours = (Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60);
              return orderAgeHours <= 4;
            });
            setActiveOrder(active || null);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, [isAuthenticated, selectedCommunity?.id, selectedCommunity?.slug]);

  const handleAddToCart = async (dish: DashboardDish) => {
    // Server cart first: only show the dish in the tray once the API has accepted it.
    if (isAuthenticated) {
      try {
        await cartService.addToCart({
          productId: dish.id,
          quantity: 1,
          stockType: dish.isFrozen ? 'hub' : 'direct',
        });
      } catch (err) {
        const response = isAxiosError<ApiError>(err) ? err.response : undefined;
        if (response?.status === 409 || response?.data?.error?.code === 'CART_SELLER_MISMATCH') {
          const details = response?.data?.error?.details as { existingSeller?: { name?: string } } | undefined;
          setConflictModal({
            isOpen: true,
            existingKitchenName: details?.existingSeller?.name || t('anotherKitchen'),
            dish,
          });
          return;
        }
        showToast(response?.data?.error?.message || t('addFailed', { name: dish.name }), 'error');
        return;
      }
    }

    addCartItem({
      id: `${dish.id}-${Date.now()}`,
      productId: dish.id,
      productName: dish.name,
      productImage: dish.photo || undefined,
      sellerId: dish.sellerId,
      sellerName: dish.kitchenName,
      quantity: 1,
      unitPrice: dish.price,
      stockType: dish.isFrozen ? 'hub' : 'direct',
      subtotal: dish.price,
    });
    showToast(t('addedToTray', { name: dish.name }), 'success');
  };

  const handleConfirmSwitchKitchen = async () => {
    const dish = conflictModal.dish;
    if (!dish) return;
    setSwitchingKitchen(true);
    try {
      await cartService.addToCart({
        productId: dish.id,
        quantity: 1,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        clearAndAdd: true,
      });
      useCartStore.getState().clearCart();
      addCartItem({
        id: `${dish.id}-${Date.now()}`,
        productId: dish.id,
        productName: dish.name,
        productImage: dish.photo || undefined,
        sellerId: dish.sellerId,
        sellerName: dish.kitchenName,
        quantity: 1,
        unitPrice: dish.price,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        subtotal: dish.price,
      });
      showToast(t('trayUpdated', { kitchen: dish.kitchenName }), 'success');
      setConflictModal({ isOpen: false, existingKitchenName: '', dish: null });
    } catch {
      showToast(t('replaceFailed'), 'error');
    } finally {
      setSwitchingKitchen(false);
    }
  };

  const currentCommunityName = selectedCommunity?.name || null;

  return (
    <DashboardLayout
      title={t('title')}
      subtitle={
        currentCommunityName
          ? t('subtitleIn', { community: currentCommunityName })
          : t('subtitle')
      }
      sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
      userType="customer"
    >
      <div className="space-y-6 pb-12">

        {/* ── ACTIVE ORDER LIVE TRACKER ── */}
        {activeOrder && (
          <Link href={`/orders/${activeOrder.id}`} className="block">
            <div className="rounded-2xl p-4 sm:p-5 bg-white border border-[#FF5500]/40 shadow-xs hover:shadow-md transition-all flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#FF5500] flex items-center justify-center font-bold shrink-0">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">{t('activeDelivery')}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{t('orderNumber', { number: activeOrder.orderNumber })}</p>
                  <p className="text-xs text-slate-500 font-medium">
                    {t('statusLabel')} <span className="capitalize font-semibold text-slate-800">{statusKey(activeOrder.orderStatus) in commonMessages.en ? tc(statusKey(activeOrder.orderStatus)) : activeOrder.orderStatus.replace('_', ' ')}</span> · {t('itemsCount', { count: activeOrder.itemsCount })}
                  </p>
                </div>
              </div>
              <div className="text-end">
                <p className="text-base font-bold text-slate-900">{formatPrice(activeOrder.totalAmount)}</p>
                <span className="text-xs font-bold text-[#FF5500] inline-flex items-center gap-1 mt-0.5">
                  <span>{t('liveTrack')}</span>
                  <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* ── DISCOVERY & EXPLORE BY CUISINE — Unified Controls ── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-600 uppercase tracking-wider mb-0.5">
                <ChefHat className="w-3.5 h-3.5 text-[#FF5500]" />
                <span>{t('handcrafted')}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t('exploreByCuisine')}</h2>
              <p className="text-xs text-slate-500 font-medium">
                {selectedCuisine
                  ? t('showingCuisine', { cuisine: selectedCuisineLabel })
                  : t('tapCuisine')}
              </p>
            </div>

            {/* Quick View Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* All Rows */}
              <button
                type="button"
                onClick={() => { setViewMode('all'); setSelectedCuisine(''); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'all' && !selectedCuisine
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('allRows')}</span>
              </button>

              {/* Top 10 */}
              <button
                type="button"
                onClick={() => { setViewMode('top10'); setSelectedCuisine(''); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'top10' && !selectedCuisine
                    ? 'bg-[#FF5500] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>{t('top10')}</span>
              </button>

              {/* Kitchens */}
              <button
                type="button"
                onClick={() => { setViewMode('kitchens'); setSelectedCuisine(''); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'kitchens' && !selectedCuisine
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>{t('kitchens')}</span>
              </button>

              {/* Random / Surprise Me */}
              <button
                type="button"
                onClick={handleRandomize}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isRandomOrder
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100'
                }`}
                title={t('randomizeTitle')}
              >
                <Dices className={`w-3.5 h-3.5 ${isRandomOrder ? 'animate-bounce' : ''}`} />
                <span>{isRandomOrder ? t('shuffled') : t('surpriseMe')}</span>
              </button>

              {/* Clear Filter (when cuisine is active) */}
              {selectedCuisine && (
                <button
                  type="button"
                  onClick={() => { setSelectedCuisine(''); setViewMode('all'); }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-300 px-3 py-1.5 rounded-xl transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{t('clearFilter')}</span>
                </button>
              )}
            </div>
          </div>

          <CuisineCarousel
            selectedCuisine={selectedCuisine}
            onSelectCuisine={(q) => {
              if (selectedCuisine === q) {
                setSelectedCuisine('');
                setViewMode('all');
              } else {
                setSelectedCuisine(q);
                setViewMode('cuisine');
              }
            }}
          />
        </div>

        {/* ── CUISINE-SPECIFIC FILTER VIEW (WHEN A CUISINE IS SELECTED) ── */}
        {selectedCuisine ? (
          <div className="space-y-8">
            {/* Filtered Kitchens Row */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider mb-1">
                    <ChefHat className="w-3.5 h-3.5 text-[#FF5500]" />
                    <span>{t('verifiedDomesticCooks')}</span>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    {currentCommunityName
                      ? t('cuisineKitchensIn', { cuisine: selectedCuisineLabel, community: currentCommunityName })
                      : t('cuisineKitchens', { cuisine: selectedCuisineLabel })}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {t('cuisineKitchensSub', { cuisine: selectedCuisineLabel })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollRow(kitchensRowRef, -320)}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                    title={t('scrollLeft')}
                  >
                    <ChevronLeft className="rtl:-scale-x-100 w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollRow(kitchensRowRef, 320)}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                    title={t('scrollRight')}
                  >
                    <ChevronRight className="rtl:-scale-x-100 w-4 h-4" />
                  </button>
                </div>
              </div>

              <div
                ref={kitchensRowRef}
                className="flex gap-4 overflow-x-auto scrollbar-none pb-2 scroll-smooth"
              >
                {displayKitchens.map((k) => (
                  <div key={k.id} className="w-[280px] sm:w-[310px] shrink-0">
                    <Link
                      href={`/kitchens/${k.id}`}
                      className="group bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all overflow-hidden flex flex-col justify-between h-full"
                    >
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                        <CoverImage
                          src={k.coverImageUrl}
                          alt={k.businessName}
                          label={k.businessName}
                          size="md"
                          className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <span className="absolute bottom-2.5 start-2.5 px-2 py-0.5 rounded-md bg-emerald-600/90 text-white text-[10px] font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>{t('verified')}</span>
                        </span>
                        <span className="absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{displayRating(k.ratingAverage, k.totalReviews) ?? t('new')}</span>
                        </span>
                      </div>

                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2.5 mb-2">
                            <CoverImage
                              src={k.chef.avatar}
                              alt={k.chef.name}
                              label={k.chef.name}
                              size="sm"
                              className="w-8 h-8 rounded-xl border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors truncate">
                                {k.businessName}
                              </h3>
                              <p className="text-[11px] text-slate-500 truncate">
                                {[k.chef.name, k.chef.area].filter(Boolean).join(' • ')}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 mt-2">
                            {(k.minPrepTimeMinutes ?? 0) > 0 && (
                              <>
                                <span className="flex items-center gap-1 font-semibold text-slate-700">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {t('minutes', { count: k.minPrepTimeMinutes ?? 0 })}
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span>{dishCountLabel(t, k)}</span>
                          </div>
                        </div>

                        <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-[11px] font-semibold text-slate-500 truncate">
                            {k.mealCategories?.[0] || t('homeCooked')}
                          </span>
                          <span className="font-bold text-[#FF5500] inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
                            <span>{t('viewMenu')}</span>
                            <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </section>

            {/* Filtered Trending Dishes Row */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[10px] font-bold uppercase tracking-wider mb-1">
                    <Flame className="w-3.5 h-3.5 text-[#FF5500]" />
                    <span>{t('popularDishes')}</span>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    {t('cuisineDishes', { cuisine: selectedCuisineLabel })}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {t('cuisineDishesSub', { cuisine: selectedCuisineLabel })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollRow(top10RowRef, -300)}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                    title={t('scrollLeft')}
                  >
                    <ChevronLeft className="rtl:-scale-x-100 w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollRow(top10RowRef, 300)}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                    title={t('scrollRight')}
                  >
                    <ChevronRight className="rtl:-scale-x-100 w-4 h-4" />
                  </button>
                </div>
              </div>

              <div
                ref={top10RowRef}
                className="flex gap-4 overflow-x-auto scrollbar-none pb-2 scroll-smooth"
              >
                {displayDishes.length === 0 && (
                  <p className="text-xs text-slate-500 font-medium py-6">
                    {dishesLoading ? t('loadingDishes') : t('noCuisineDishes', { cuisine: selectedCuisineLabel })}
                  </p>
                )}
                {displayDishes.map((dish) => (
                  <div key={dish.id} className="w-[240px] sm:w-[270px] shrink-0">
                    <div className="group bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-orange-300 transition-all overflow-hidden flex flex-col justify-between h-full">
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                        <CoverImage
                          src={dish.photo}
                          alt={dish.name}
                          label={dish.name}
                          size="md"
                          className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                        <DealBadge dish={dish} />
                        <span className="absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          <span>{dish.rating ?? t('new')}</span>
                        </span>
                      </div>

                      <div className="p-3.5 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors leading-snug line-clamp-1">
                            {dish.name}
                          </h3>
                          {dish.nameUrdu && (
                            <p className="text-[11px] text-amber-700 font-semibold mt-0.5 font-urdu truncate">{dish.nameUrdu}</p>
                          )}
                          <div className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5 truncate">
                            <ChefHat className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-700 truncate">{dish.kitchenName}</span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-base font-bold text-slate-900">{formatPrice(dish.price)}</span>
                          <button
                            type="button"
                            onClick={() => handleAddToCart(dish)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-[#FF5500] text-white text-xs font-bold transition-colors shadow-2xs active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            <span>{t('add')}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          /* ── NETFLIX-STYLE MULTI-ROW CATALOG ── */
          <div className="space-y-10">

            {/* ── ROW 1: 🏆 TOP 10 TRENDING IN [COMMUNITY] (SIGNATURE NETFLIX ROW WITH GIANT NUMBERS) ── */}
            {(viewMode === 'all' || viewMode === 'top10') && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-[#FF5500] text-white text-[10px] font-black uppercase tracking-wider shadow-xs">
                        <Trophy className="w-3 h-3" />
                        <span>{t('top10Badge')}</span>
                      </div>
                      {isRandomOrder && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
                          <Dices className="w-3 h-3" />
                          <span>{t('shuffled')}</span>
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {t('top10Title')}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {selectedCommunity?.name
                        ? t('top10SubIn', { community: selectedCommunity.name })
                        : t('top10Sub')}
                    </p>
                  </div>

                  {/* Left / Right Carousel Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollRow(top10RowRef, -380)}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollLeft')}
                    >
                      <ChevronLeft className="rtl:-scale-x-100 w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(top10RowRef, 380)}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollRight')}
                    >
                      <ChevronRight className="rtl:-scale-x-100 w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>

                {/* Netflix-style Horizontal Row with Giant Rank Numerals */}
                <div
                  ref={top10RowRef}
                  className="flex gap-2 sm:gap-4 overflow-x-auto scrollbar-none pb-4 pt-1 px-1 scroll-smooth"
                >
                  {top10Dishes.length === 0 && (
                    <p className="text-xs text-slate-500 font-medium py-6">
                      {dishesLoading
                        ? t('loadingDishes')
                        : t('noDishes')}
                    </p>
                  )}
                  {top10Dishes.map((dish, index) => (
                    <div
                      key={dish.id}
                      className="relative flex items-end shrink-0 group select-none py-1"
                    >
                      {/* Giant Netflix Rank Numeral */}
                      <span
                        className="text-8xl sm:text-9xl font-black italic tracking-tighter leading-none select-none text-slate-100 group-hover:text-orange-500/25 transition-all me-[-28px] sm:me-[-36px] z-0 drop-shadow-sm pointer-events-none"
                        style={{
                          WebkitTextStroke: '3px #cbd5e1',
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                        }}
                      >
                        {index + 1}
                      </span>

                      {/* Food Poster Card (slightly overlaps the number) */}
                      <div className="relative z-10 w-[230px] sm:w-[260px] bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xl hover:border-orange-300 transition-all overflow-hidden flex flex-col justify-between shrink-0">
                        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                          <CoverImage
                            src={dish.photo}
                            alt={dish.name}
                            label={dish.name}
                            size="md"
                            className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

                          <DealBadge dish={dish} />

                          {(dish.isFrozen || dish.prepTimeMinutes) && (
                            <span className="absolute bottom-2.5 start-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1">
                              {dish.isFrozen ? (
                                <>
                                  <Snowflake className="w-3 h-3 text-cyan-400" />
                                  <span>{t('frozen')}</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3 text-amber-400" />
                                  <span>{t('cookMinutes', { count: dish.prepTimeMinutes })}</span>
                                </>
                              )}
                            </span>
                          )}

                          <span className="absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{dish.rating ?? t('new')}</span>
                          </span>
                        </div>

                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors leading-snug line-clamp-1">
                              {dish.name}
                            </h3>
                            {dish.nameUrdu && (
                              <p className="text-[11px] text-amber-700 font-semibold mt-0.5 font-urdu truncate">{dish.nameUrdu}</p>
                            )}

                            <div className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5 truncate">
                              <ChefHat className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-700 truncate">{dish.kitchenName}</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <div>
                              <span className="text-base font-bold text-slate-900">{formatPrice(dish.price)}</span>
                              {dish.originalPrice && (
                                <span className="text-xs text-slate-400 line-through ms-1 font-medium">
                                  {formatPrice(dish.originalPrice)}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleAddToCart(dish)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-[#FF5500] text-white text-xs font-bold transition-colors shadow-2xs active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>{t('add')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── ROW 2: 👨‍🍳 VERIFIED HOME KITCHENS ── */}
            {(viewMode === 'all' || viewMode === 'kitchens') && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider mb-1">
                      <ChefHat className="w-3.5 h-3.5 text-[#FF5500]" />
                      <span>{t('verifiedHomeCooks')}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {currentCommunityName
                        ? t('verifiedKitchensIn', { community: currentCommunityName })
                        : t('verifiedKitchens')}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {t('verifiedKitchensSub')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href="/kitchens"
                      className="hidden sm:inline-flex text-xs font-bold text-[#FF5500] hover:underline me-2"
                    >
                      {t('viewAllKitchens')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => scrollRow(kitchensRowRef, -320)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollLeft')}
                    >
                      <ChevronLeft className="rtl:-scale-x-100 w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(kitchensRowRef, 320)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollRight')}
                    >
                      <ChevronRight className="rtl:-scale-x-100 w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={kitchensRowRef}
                  className="flex gap-4 overflow-x-auto scrollbar-none pb-2 scroll-smooth"
                >
                  {displayKitchens.map((k) => (
                    <div key={k.id} className="w-[280px] sm:w-[310px] shrink-0">
                      <Link
                        href={`/kitchens/${k.id}`}
                        className="group bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-slate-300 transition-all overflow-hidden flex flex-col justify-between h-full"
                      >
                        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                          <CoverImage
                            src={k.coverImageUrl}
                            alt={k.businessName}
                            label={k.businessName}
                            size="md"
                            className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <span className="absolute bottom-2.5 start-2.5 px-2 py-0.5 rounded-md bg-emerald-600/90 text-white text-[10px] font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            <span>{t('verifiedDomesticCook')}</span>
                          </span>
                          <span className="absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{displayRating(k.ratingAverage, k.totalReviews) ?? t('new')}</span>
                          </span>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2.5 mb-2">
                              <CoverImage
                                src={k.chef.avatar}
                                alt={k.chef.name}
                                label={k.chef.name}
                                size="sm"
                                className="w-8 h-8 rounded-xl border border-slate-200 shrink-0"
                              />
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors truncate">
                                  {k.businessName}
                                </h3>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {[k.chef.name, k.chef.area].filter(Boolean).join(' • ')}
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-2">
                              {(k.minPrepTimeMinutes ?? 0) > 0 && (
                                <>
                                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {t('minPrep', { count: k.minPrepTimeMinutes ?? 0 })}
                                  </span>
                                  <span>•</span>
                                </>
                              )}
                              <span>{dishCountLabel(t, k)}</span>
                            </div>
                          </div>

                          <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-[11px] font-semibold text-slate-500 truncate">
                              {k.mealCategories?.[0] || t('homeCooked')}
                            </span>
                            <span className="font-bold text-[#FF5500] inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
                              <span>{t('viewMenu')}</span>
                              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── ROW 3: 🍛 DUM BIRYANIS & DEGI PULAO SPECIALS ── */}
            {viewMode === 'all' && biryaniDishes.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#FF5500]" />
                      <span>{t('generationalRecipes')}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {t('biryaniTitle')}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {t('biryaniSub')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollRow(biryaniRowRef, -300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollLeft')}
                    >
                      <ChevronLeft className="rtl:-scale-x-100 w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(biryaniRowRef, 300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollRight')}
                    >
                      <ChevronRight className="rtl:-scale-x-100 w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={biryaniRowRef}
                  className="flex gap-4 overflow-x-auto scrollbar-none pb-2 scroll-smooth"
                >
                  {biryaniDishes.map((dish) => (
                    <div key={dish.id} className="w-[240px] sm:w-[270px] shrink-0">
                      <div className="group bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-orange-300 transition-all overflow-hidden flex flex-col justify-between h-full">
                        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                          <CoverImage
                            src={dish.photo}
                            alt={dish.name}
                            label={dish.name}
                            size="md"
                            className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          <DealBadge dish={dish} />
                          <span className="absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{dish.rating ?? t('new')}</span>
                          </span>
                        </div>

                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors leading-snug line-clamp-1">
                              {dish.name}
                            </h3>
                            {dish.nameUrdu && (
                              <p className="text-[11px] text-amber-700 font-semibold mt-0.5 font-urdu truncate">{dish.nameUrdu}</p>
                            )}
                            <div className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5 truncate">
                              <ChefHat className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-700 truncate">{dish.kitchenName}</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-base font-bold text-slate-900">{formatPrice(dish.price)}</span>
                            <button
                              type="button"
                              onClick={() => handleAddToCart(dish)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-[#FF5500] text-white text-xs font-bold transition-colors shadow-2xs active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>{t('add')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── ROW 4: 🥩 SLOW-COOKED NIHARI & CLAY POT KARAHI ── */}
            {viewMode === 'all' && slowPotDishes.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider mb-1">
                      <Flame className="w-3.5 h-3.5 text-red-600" />
                      <span>{t('slowBraised')}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {t('nihariTitle')}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {t('nihariSub')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollRow(slowPotRowRef, -300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollLeft')}
                    >
                      <ChevronLeft className="rtl:-scale-x-100 w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(slowPotRowRef, 300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollRight')}
                    >
                      <ChevronRight className="rtl:-scale-x-100 w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={slowPotRowRef}
                  className="flex gap-4 overflow-x-auto scrollbar-none pb-2 scroll-smooth"
                >
                  {slowPotDishes.map((dish) => (
                    <div key={dish.id} className="w-[240px] sm:w-[270px] shrink-0">
                      <div className="group bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-orange-300 transition-all overflow-hidden flex flex-col justify-between h-full">
                        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                          <CoverImage
                            src={dish.photo}
                            alt={dish.name}
                            label={dish.name}
                            size="md"
                            className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          <DealBadge dish={dish} />
                          <span className="absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{dish.rating ?? t('new')}</span>
                          </span>
                        </div>

                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors leading-snug line-clamp-1">
                              {dish.name}
                            </h3>
                            {dish.nameUrdu && (
                              <p className="text-[11px] text-amber-700 font-semibold mt-0.5 font-urdu truncate">{dish.nameUrdu}</p>
                            )}
                            <div className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5 truncate">
                              <ChefHat className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-700 truncate">{dish.kitchenName}</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-base font-bold text-slate-900">{formatPrice(dish.price)}</span>
                            <button
                              type="button"
                              onClick={() => handleAddToCart(dish)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-[#FF5500] text-white text-xs font-bold transition-colors shadow-2xs active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>{t('add')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── ROW 5: ❄️ ARTISANAL FLASH FROZEN SAVORIES & PARATHAS ── */}
            {viewMode === 'all' && frozenSavoriesDishes.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800 text-[10px] font-bold uppercase tracking-wider mb-1">
                      <Snowflake className="w-3.5 h-3.5 text-cyan-600" />
                      <span>{t('freezerReady')}</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {t('frozenTitle')}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {t('frozenSub')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollRow(frozenRowRef, -300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollLeft')}
                    >
                      <ChevronLeft className="rtl:-scale-x-100 w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(frozenRowRef, 300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title={t('scrollRight')}
                    >
                      <ChevronRight className="rtl:-scale-x-100 w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={frozenRowRef}
                  className="flex gap-4 overflow-x-auto scrollbar-none pb-2 scroll-smooth"
                >
                  {frozenSavoriesDishes.map((dish) => (
                    <div key={dish.id} className="w-[240px] sm:w-[270px] shrink-0">
                      <div className="group bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-cyan-300 transition-all overflow-hidden flex flex-col justify-between h-full">
                        <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                          <CoverImage
                            src={dish.photo}
                            alt={dish.name}
                            label={dish.name}
                            size="md"
                            className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          {dish.isFrozen ? (
                            <span className="absolute top-2.5 start-2.5 px-2 py-0.5 rounded-lg text-white text-[10px] font-bold bg-cyan-600 shadow-xs uppercase tracking-wider flex items-center gap-1">
                              <Snowflake className="w-3 h-3" />
                              <span>{t('frozen')}</span>
                            </span>
                          ) : (
                            <DealBadge dish={dish} />
                          )}
                          <span className="absolute bottom-2.5 end-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{dish.rating ?? t('new')}</span>
                          </span>
                        </div>

                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors leading-snug line-clamp-1">
                              {dish.name}
                            </h3>
                            {dish.nameUrdu && (
                              <p className="text-[11px] text-amber-700 font-semibold mt-0.5 font-urdu truncate">{dish.nameUrdu}</p>
                            )}
                            <div className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5 truncate">
                              <ChefHat className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-700 truncate">{dish.kitchenName}</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-base font-bold text-slate-900">{formatPrice(dish.price)}</span>
                            <button
                              type="button"
                              onClick={() => handleAddToCart(dish)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-[#FF5500] text-white text-xs font-bold transition-colors shadow-2xs active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>{t('add')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </div>

      {/* Styled Modern Modal for Single Kitchen Batch Switching */}
      <ConfirmModal
        isOpen={conflictModal.isOpen}
        title={t('switchTitle')}
        message={t('switchMessage', { existing: conflictModal.existingKitchenName, kitchen: conflictModal.dish?.kitchenName ?? '' })}
        confirmText={t('switchConfirm')}
        cancelText={t('switchCancel')}
        variant="warning"
        loading={switchingKitchen}
        onConfirm={handleConfirmSwitchKitchen}
        onCancel={() => setConflictModal({ isOpen: false, existingKitchenName: '', dish: null })}
      />
    </DashboardLayout>
  );
}
