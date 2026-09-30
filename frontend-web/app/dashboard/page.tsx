'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useCommunityStore } from '@/lib/store/community-store';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { sellerService, PublicSeller } from '@/lib/services/seller.service';
import { communityService, CommunityDetail } from '@/lib/services/community.service';
import { cartService } from '@/lib/services/cart.service';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { getSmartTrendingDishes, TrendingDishItem } from '@/lib/utils/trending-algorithm';
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
    dish: any | null;
  }>({
    isOpen: false,
    existingKitchenName: '',
    dish: null,
  });
  const [switchingKitchen, setSwitchingKitchen] = useState(false);

  // Load trending dishes calculated by the smart algorithm
  const trendingDishes = useMemo(() => {
    return getSmartTrendingDishes();
  }, []);

  // Label for selected cuisine
  const selectedCuisineLabel = useMemo(() => {
    if (!selectedCuisine) return '';
    return PLATFORM_CUISINES.find((c) => c.query === selectedCuisine)?.label || selectedCuisine;
  }, [selectedCuisine]);

  // Filtered trending dishes matching cuisine + prep type
  const matchingDishes = useMemo(() => {
    return trendingDishes.filter((dish) => {
      if (selectedCuisine) {
        const dishText = (dish.category + ' ' + dish.cuisine + ' ' + dish.name).toLowerCase();
        const tags = CUISINE_KITCHEN_TAGS[selectedCuisine] || [selectedCuisine];
        if (!tags.some((t) => dishText.includes(t))) return false;
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
      ['biryani', 'pulao', 'rice', 'dum'].some((t) => (d.category + ' ' + d.name + ' ' + d.cuisine).toLowerCase().includes(t))
    );
  }, [displayDishes]);

  // Slow Pots: Nihari, Karahi, Slow Braise
  const slowPotDishes = useMemo(() => {
    return displayDishes.filter((d) =>
      ['nihari', 'karahi', 'curry', 'kunna', 'gosht', 'kebab'].some((t) => (d.category + ' ' + d.name + ' ' + d.cuisine).toLowerCase().includes(t))
    );
  }, [displayDishes]);

  // Sub-Zero Frozen Savories
  const frozenSavoriesDishes = useMemo(() => {
    return displayDishes.filter((d) =>
      d.isFrozen || ['samosa', 'roll', 'frozen', 'patties', 'paratha', 'shami'].some((t) => (d.category + ' ' + d.name).toLowerCase().includes(t))
    );
  }, [displayDishes]);

  const handleRandomize = () => {
    setIsRandomOrder(true);
    setShuffleNonce((prev) => prev + 1);
    showToast('🎲 Random order applied! Shuffled kitchens & dishes', 'info');
  };

  const handleResetOrder = () => {
    setIsRandomOrder(false);
    setShuffleNonce(0);
    showToast('Restored default ranking order', 'info');
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

  const handleAddToCart = async (dish: TrendingDishItem) => {
    addCartItem({
      id: `${dish.id}-${Date.now()}`,
      productId: dish.id,
      productName: dish.name,
      productImage: dish.photo,
      sellerId: dish.sellerId,
      sellerName: dish.kitchenName,
      quantity: 1,
      unitPrice: dish.price,
      stockType: dish.isFrozen ? 'hub' : 'direct',
      subtotal: dish.price,
    });

    if (isAuthenticated) {
      try {
        await cartService.addToCart({
          productId: dish.id,
          quantity: 1,
          stockType: dish.isFrozen ? 'hub' : 'direct',
        });
      } catch (err: any) {
        if (err?.response?.status === 409 || err?.response?.data?.error?.code === 'CART_SELLER_MISMATCH') {
          const details = err?.response?.data?.error?.details;
          setConflictModal({
            isOpen: true,
            existingKitchenName: details?.existingSeller?.name || 'another kitchen',
            dish,
          });
          return;
        }
      }
    }

    showToast(`Added ${dish.name} to tray`, 'success');
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
        productImage: dish.photo,
        sellerId: dish.sellerId,
        sellerName: dish.kitchenName,
        quantity: 1,
        unitPrice: dish.price,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        subtotal: dish.price,
      });
      showToast(`Tray updated with dishes from ${dish.kitchenName}!`, 'success');
      setConflictModal({ isOpen: false, existingKitchenName: '', dish: null });
    } catch {
      showToast('Failed to replace tray items', 'error');
    } finally {
      setSwitchingKitchen(false);
    }
  };

  const currentCommunityName = selectedCommunity?.name || 'Askari 11';

  return (
    <DashboardLayout
      title="Kitchens &amp; Menus"
      subtitle={`Certified home kitchens, signature recipes & provisions in ${currentCommunityName}`}
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Active Delivery</span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">Order #{activeOrder.orderNumber}</p>
                  <p className="text-xs text-slate-500 font-medium">
                    Status: <span className="capitalize font-semibold text-slate-800">{activeOrder.orderStatus.replace('_', ' ')}</span> · {activeOrder.itemsCount} items
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-slate-900">{formatPrice(activeOrder.totalAmount)}</p>
                <span className="text-xs font-bold text-[#FF5500] inline-flex items-center gap-1 mt-0.5">
                  <span>Live Track</span>
                  <ChevronRight className="w-3.5 h-3.5" />
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
                <span>Handcrafted Recipes &amp; Provisions</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Explore by Cuisine</h2>
              <p className="text-xs text-slate-500 font-medium">
                {selectedCuisine
                  ? `Showing kitchens & signature dishes for "${selectedCuisineLabel}"`
                  : 'Tap any cuisine below to filter rows, or switch views'}
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
                <span>All Rows</span>
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
                <span>Top 10</span>
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
                <span>Kitchens</span>
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
                title="Randomize dishes and kitchens order"
              >
                <Dices className={`w-3.5 h-3.5 ${isRandomOrder ? 'animate-bounce' : ''}`} />
                <span>{isRandomOrder ? 'Shuffled' : 'Surprise Me'}</span>
              </button>

              {/* Clear Filter (when cuisine is active) */}
              {selectedCuisine && (
                <button
                  type="button"
                  onClick={() => { setSelectedCuisine(''); setViewMode('all'); }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-300 px-3 py-1.5 rounded-xl transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear Filter</span>
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
                    <span>Verified Domestic Cooks</span>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    "{selectedCuisineLabel}" Kitchens in {currentCommunityName}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Showing verified domestic kitchens specializing in {selectedCuisineLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollRow(kitchensRowRef, -320)}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                    title="Scroll left"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollRow(kitchensRowRef, 320)}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                    title="Scroll right"
                  >
                    <ChevronRight className="w-4 h-4" />
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
                        <img
                          src={k.coverImageUrl || 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop'}
                          alt={k.businessName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-emerald-600/90 text-white text-[10px] font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Verified</span>
                        </span>
                        <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{k.ratingAverage || 4.9}</span>
                        </span>
                      </div>

                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2.5 mb-2">
                            <img
                              src={k.chef.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop'}
                              alt={k.chef.name}
                              className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors truncate">
                                {k.businessName}
                              </h3>
                              <p className="text-[11px] text-slate-500 truncate">
                                {k.chef.name} • {k.chef.area || currentCommunityName}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 mt-2">
                            <span className="flex items-center gap-1 font-semibold text-slate-700">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {k.minPrepTimeMinutes || 25} min
                            </span>
                            <span>•</span>
                            <span>{k.products?.length || 4} dishes</span>
                          </div>
                        </div>

                        <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-[11px] font-semibold text-slate-500 truncate">
                            {k.mealCategories?.[0] || selectedCuisineLabel}
                          </span>
                          <span className="font-bold text-[#FF5500] inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
                            <span>View Menu</span>
                            <ChevronRight className="w-3.5 h-3.5" />
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
                    <span>Real-Time Trending</span>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Trending "{selectedCuisineLabel}" Dishes
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Most requested {selectedCuisineLabel} preparations right now
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollRow(top10RowRef, -300)}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                    title="Scroll left"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollRow(top10RowRef, 300)}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                    title="Scroll right"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div
                ref={top10RowRef}
                className="flex gap-4 overflow-x-auto scrollbar-none pb-2 scroll-smooth"
              >
                {displayDishes.map((dish) => (
                  <div key={dish.id} className="w-[240px] sm:w-[270px] shrink-0">
                    <div className="group bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-lg hover:border-orange-300 transition-all overflow-hidden flex flex-col justify-between h-full">
                      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                        <img
                          src={dish.photo}
                          alt={dish.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg text-white text-[10px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider flex items-center gap-1">
                          <Flame className="w-3 h-3" />
                          <span>{dish.trendingBadge}</span>
                        </span>
                        <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          <span>{dish.rating}</span>
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
                            <span>Add</span>
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
                        <span>TOP 10 TODAY</span>
                      </div>
                      {isRandomOrder && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
                          <Dices className="w-3 h-3" />
                          <span>Shuffled</span>
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Top 10 Trending in {currentCommunityName}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Updated hourly · Ranked by 24h order volume, repeat reorders & live kitchen preparation
                    </p>
                  </div>

                  {/* Left / Right Carousel Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollRow(top10RowRef, -380)}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll left"
                    >
                      <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(top10RowRef, 380)}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll right"
                    >
                      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>

                {/* Netflix-style Horizontal Row with Giant Rank Numerals */}
                <div
                  ref={top10RowRef}
                  className="flex gap-2 sm:gap-4 overflow-x-auto scrollbar-none pb-4 pt-1 px-1 scroll-smooth"
                >
                  {top10Dishes.map((dish, index) => (
                    <div
                      key={dish.id}
                      className="relative flex items-end shrink-0 group select-none py-1"
                    >
                      {/* Giant Netflix Rank Numeral */}
                      <span
                        className="text-8xl sm:text-9xl font-black italic tracking-tighter leading-none select-none text-slate-100 group-hover:text-orange-500/25 transition-all mr-[-28px] sm:mr-[-36px] z-0 drop-shadow-sm pointer-events-none"
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
                          <img
                            src={dish.photo}
                            alt={dish.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

                          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg text-white text-[10px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            <span>{dish.trendingBadge}</span>
                          </span>

                          <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1">
                            {dish.isFrozen ? (
                              <>
                                <Snowflake className="w-3 h-3 text-cyan-400" />
                                <span>Frozen</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>{dish.prepTimeMinutes}m Cook</span>
                              </>
                            )}
                          </span>

                          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{dish.rating}</span>
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

                            <div className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-2">
                              <span className="text-slate-600 font-semibold">{dish.orderCount24h} orders</span>
                              <span>•</span>
                              <span className="text-emerald-600 font-semibold">{dish.repeatOrderPercent}% reorder</span>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <div>
                              <span className="text-base font-bold text-slate-900">{formatPrice(dish.price)}</span>
                              {dish.originalPrice && (
                                <span className="text-xs text-slate-400 line-through ml-1 font-medium">
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
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── ROW 2: 👨‍🍳 CERTIFIED DOMESTIC KITCHENS ── */}
            {(viewMode === 'all' || viewMode === 'kitchens') && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider mb-1">
                      <ChefHat className="w-3.5 h-3.5 text-[#FF5500]" />
                      <span>Certified Domestic Cooks</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Certified Kitchens in {currentCommunityName}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Independent home cooks preparing authentic recipes with hygiene verification
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href="/kitchens"
                      className="hidden sm:inline-flex text-xs font-bold text-[#FF5500] hover:underline mr-2"
                    >
                      View All Kitchens →
                    </Link>
                    <button
                      type="button"
                      onClick={() => scrollRow(kitchensRowRef, -320)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll left"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(kitchensRowRef, 320)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll right"
                    >
                      <ChevronRight className="w-4 h-4" />
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
                          <img
                            src={k.coverImageUrl || 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop'}
                            alt={k.businessName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-emerald-600/90 text-white text-[10px] font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Verified Domestic Cook</span>
                          </span>
                          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{k.ratingAverage || 4.9}</span>
                          </span>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center gap-2.5 mb-2">
                              <img
                                src={k.chef.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop'}
                                alt={k.chef.name}
                                className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                              />
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] transition-colors truncate">
                                  {k.businessName}
                                </h3>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {k.chef.name} • {k.chef.area || currentCommunityName}
                                </p>
                              </div>
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-2">
                              <span className="flex items-center gap-1 font-semibold text-slate-700">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {k.minPrepTimeMinutes || 25} min prep
                              </span>
                              <span>•</span>
                              <span>{k.products?.length || 4} dishes</span>
                            </div>
                          </div>

                          <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-[11px] font-semibold text-slate-500 truncate">
                              {k.mealCategories?.[0] || 'Home Cooked'}
                            </span>
                            <span className="font-bold text-[#FF5500] inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
                              <span>View Menu</span>
                              <ChevronRight className="w-3.5 h-3.5" />
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
                      <span>Generational Recipes</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Dum Biryani &amp; Degi Pulao Specials
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Slow-cooked dum pukht rice with saffron, brown onions and premium cuts
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollRow(biryaniRowRef, -300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll left"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(biryaniRowRef, 300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll right"
                    >
                      <ChevronRight className="w-4 h-4" />
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
                          <img
                            src={dish.photo}
                            alt={dish.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg text-white text-[10px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            <span>{dish.trendingBadge}</span>
                          </span>
                          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{dish.rating}</span>
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
                              <span>Add</span>
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
                      <span>Slow Braised · Live Off Deg</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Royal Shahi Nihari &amp; Shinwari Karahi
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      12-hour simmered bone marrow gravies and live wok butter karahis
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollRow(slowPotRowRef, -300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll left"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(slowPotRowRef, 300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll right"
                    >
                      <ChevronRight className="w-4 h-4" />
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
                          <img
                            src={dish.photo}
                            alt={dish.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg text-white text-[10px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider flex items-center gap-1">
                            <Flame className="w-3 h-3" />
                            <span>{dish.trendingBadge}</span>
                          </span>
                          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{dish.rating}</span>
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
                              <span>Add</span>
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
                      <span>Artisanal Freezer Ready</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      Flash Frozen Savories &amp; Hand-Rolled Parathas
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Stock your home freezer with artisanal cocktail samosas, spring rolls and ready-to-fry parathas
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollRow(frozenRowRef, -300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll left"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollRow(frozenRowRef, 300)}
                      className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-400 bg-white flex items-center justify-center text-slate-700 shadow-2xs transition-colors"
                      title="Scroll right"
                    >
                      <ChevronRight className="w-4 h-4" />
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
                          <img
                            src={dish.photo}
                            alt={dish.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg text-white text-[10px] font-bold bg-cyan-600 shadow-xs uppercase tracking-wider flex items-center gap-1">
                            <Snowflake className="w-3 h-3" />
                            <span>Frozen</span>
                          </span>
                          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/95 text-slate-900 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{dish.rating}</span>
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
                              <span>Add</span>
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
        title="Start Order from This Kitchen?"
        message={`Your tray currently contains dishes from ${conflictModal.existingKitchenName}. Nuray ensures direct, single-kitchen artisanal batches for guaranteed freshness. Would you like to clear your tray and start a new order with ${conflictModal.dish?.kitchenName}?`}
        confirmText="Clear Tray & Add Dish"
        cancelText="Keep Existing Tray"
        variant="warning"
        loading={switchingKitchen}
        onConfirm={handleConfirmSwitchKitchen}
        onCancel={() => setConflictModal({ isOpen: false, existingKitchenName: '', dish: null })}
      />
    </DashboardLayout>
  );
}
