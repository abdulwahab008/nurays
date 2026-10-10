'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAxiosError } from 'axios';
import {
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
  Heart,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  LogOut,
  Package,
  LayoutDashboard,
  UtensilsCrossed,
  Plus,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useToast } from '@/components/ui/toast';
import { BrandLockup, Mark } from '@/components/ui/Mark';
import { CoverImage } from '@/components/ui/CoverImage';
import { displayRating, formatPrice } from '@/lib/utils';
import { SlideOverCartDrawer } from '@/components/marketplace/SlideOverCartDrawer';
import { UberLeftSidebar } from '@/components/marketplace/UberLeftSidebar';
import { CuisineCarousel } from '@/components/marketplace/CuisineCarousel';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import type { PublicSeller, PublicSellerAvailability } from '@/lib/services/seller.service';
import { productService, type Product } from '@/lib/services/product.service';
import { cartService } from '@/lib/services/cart.service';
import { favoriteService } from '@/lib/services/favorite.service';
import { apiClient, type ApiResponse } from '@/lib/api-client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useLocale, useT, type Locale, type Vars } from '@/lib/i18n';
import { homeMessages, type HomeKey } from '@/lib/i18n/messages/home';

/** The home page's translate function, passed to the helpers below. */
type HomeT = (key: HomeKey, vars?: Vars) => string;

// ============================================================
// TYPES — everything on this page comes from the live API
// ============================================================

type LoadState = 'loading' | 'ready' | 'error';

const KITCHEN_FILTERS = ['all', 'top_rated', 'fast', 'free_delivery', 'deals', 'frozen'] as const;
type KitchenFilter = (typeof KITCHEN_FILTERS)[number];

const isKitchenFilter = (value: string): value is KitchenFilter =>
  (KITCHEN_FILTERS as readonly string[]).includes(value);

/** A kitchen card's data, mapped from a real PublicSeller. Missing values are null, never invented. */
interface HomeKitchen {
  id: string;
  name: string;
  /** Chef's name; empty when it's just the business name again. */
  chef: string;
  area: string;
  /** Display rating ("4.6"), or null when there are no reviews yet (shown as "New"). */
  rating: string | null;
  ratingValue: number;
  reviewsCount: number;
  prepMinutes: number | null;
  isOpen: boolean;
  /** "Open now" / "Closed" / "Busy right now" …, or null when availability is unknown. */
  statusLabel: string | null;
  closesAt: string | null;
  opensAt: string | null;
  /** "Deal" only when one of the kitchen's dishes is really discounted. */
  deal: string | null;
  deliveryFee: string | null;
  offersFreeDelivery: boolean;
  minOrder: string | null;
  cuisine: string[];
  coverPhoto: string | null;
  avatar: string | null;
  badge: string;
  hasFrozen: boolean;
  searchText: string;
  href: string;
}

/** A dish card's data, mapped from a real Product. */
interface HomeDish {
  id: string;
  name: string;
  kitchenName: string;
  kitchenId: string;
  price: number;
  /** Only set when the API gives an original price above the current price. */
  originalPrice: number | null;
  rating: string | null;
  isFrozen: boolean;
  typeLabel: string | null;
  photo: string | null;
}

/** GET /stats/public */
interface PublicStats {
  kitchens: number;
  communities: number;
  dishes: number;
  reviews: number;
  averageRating: number | null;
}

interface CartErrorBody {
  error?: { code?: string; details?: { existingSeller?: { name?: string } } };
}

// ============================================================
// MAPPING HELPERS
// ============================================================

const TOP_RATED_MIN_RATING = 4.5;
const TOP_RATED_MIN_REVIEWS = 5;
const QUICK_PREP_MAX_MINUTES = 30;
const PK_TIME_ZONE = 'Asia/Karachi';

const AVAILABILITY_LABELS: Record<PublicSellerAvailability['status'], HomeKey> = {
  open: 'avail.open',
  closed: 'avail.closed',
  busy: 'avail.busy',
  vacation: 'avail.vacation',
  holiday: 'avail.holiday',
  preorder_only: 'avail.preorder_only',
};

const BUSINESS_TYPE_LABELS: Record<string, HomeKey> = {
  home_kitchen: 'biz.home_kitchen',
  restaurant: 'biz.restaurant',
  bakery: 'biz.bakery',
  cafe: 'biz.cafe',
  cloud_kitchen: 'biz.cloud_kitchen',
};

const PRODUCT_TYPE_LABELS: Record<string, HomeKey> = {
  frozen: 'ptype.frozen',
  fresh: 'ptype.fresh',
  ready_to_eat: 'ptype.ready_to_eat',
  ready_to_cook: 'ptype.ready_to_cook',
};

/** "evening_snacks" → "Evening snacks"; labels that already have capitals are kept as typed. */
function humanize(value: unknown): string {
  const text = String(value ?? '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text === text.toLowerCase() ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function businessTypeLabel(t: HomeT, type?: string | null): string {
  if (!type) return t('biz.home_kitchen');
  const key = BUSINESS_TYPE_LABELS[type];
  return key ? t(key) : humanize(type) || t('biz.home_kitchen');
}

const pkDayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: PK_TIME_ZONE }).format(date);

/** A kitchen open/close instant as "11:00 PM", "tomorrow 9:00 AM", "Mon 9:00 AM" or "Oct 20 9:00 AM" (Pakistan time). */
function formatKitchenTime(t: HomeT, locale: Locale, value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PK_TIME_ZONE }).format(date);
  const now = new Date();
  const day = pkDayKey(date);
  if (day === pkDayKey(now)) return time;
  if (day === pkDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return t('tomorrowAt', { time });
  const withinWeek = date.getTime() - now.getTime() < 6 * 24 * 60 * 60 * 1000;
  const prefix = new Intl.DateTimeFormat(
    locale === 'ur' ? 'ur-PK' : 'en-US',
    withinWeek ? { weekday: 'short', timeZone: PK_TIME_ZONE } : { month: 'short', day: 'numeric', timeZone: PK_TIME_ZONE }
  ).format(date);
  return `${prefix} ${time}`;
}

/** Only the delivery terms the kitchen actually configured; nothing when it set none. */
function deliveryTerms(t: HomeT, s: PublicSeller): { text: string | null; free: boolean } {
  const fixed = s.deliveryFeeFixed != null ? Number(s.deliveryFeeFixed) : null;
  if (s.deliveryFeeType === 'fixed' && fixed != null && Number.isFinite(fixed) && fixed >= 0) {
    return fixed === 0 ? { text: t('freeDelivery'), free: true } : { text: t('deliveryFixed', { fee: formatPrice(fixed) }), free: false };
  }
  const threshold = s.freeDeliveryThreshold != null ? Number(s.freeDeliveryThreshold) : null;
  if (threshold != null && Number.isFinite(threshold)) {
    return threshold > 0
      ? { text: t('freeDeliveryOver', { amount: formatPrice(threshold) }), free: true }
      : { text: t('freeDelivery'), free: true };
  }
  return { text: null, free: false };
}

function toHomeKitchen(s: PublicSeller, t: HomeT, locale: Locale): HomeKitchen {
  const products = s.products ?? [];
  const cuisine = Array.from(new Set((s.mealCategories ?? []).map(humanize).filter(Boolean)));
  const area = (s.chef?.area || s.community?.name || '').split(',')[0].trim();
  const city = s.chef?.city || s.community?.city || '';
  const availability = s.availability;
  const isOpen = availability?.isOpen === true;
  const prep = Number(s.minPrepTimeMinutes);
  const minOrder = s.minOrderAmountForDelivery != null ? Number(s.minOrderAmountForDelivery) : null;
  const ratingValue = Number(s.ratingAverage) || 0;
  const reviewsCount = Number(s.totalReviews) || 0;
  const delivery = deliveryTerms(t, s);

  return {
    id: s.id,
    name: s.businessName,
    chef: s.chef?.name && s.chef.name !== s.businessName ? s.chef.name : '',
    area,
    rating: displayRating(ratingValue, reviewsCount),
    ratingValue,
    reviewsCount,
    prepMinutes: Number.isFinite(prep) && prep > 0 ? prep : null,
    isOpen,
    statusLabel: availability ? t(isOpen ? 'avail.open' : AVAILABILITY_LABELS[availability.status] ?? 'avail.closed') : null,
    closesAt: isOpen ? formatKitchenTime(t, locale, availability?.closesAt) : null,
    opensAt: isOpen ? null : formatKitchenTime(t, locale, availability?.opensAt ?? availability?.nextOpenAt),
    deal: products.some((p) => p.originalPrice != null && Number(p.originalPrice) > Number(p.price)) ? t('deal') : null,
    deliveryFee: delivery.text,
    offersFreeDelivery: delivery.free,
    minOrder: minOrder != null && Number.isFinite(minOrder) && minOrder > 0 ? formatPrice(minOrder) : null,
    cuisine,
    coverPhoto: s.coverImageUrl || null,
    avatar: s.chef?.avatar || null,
    badge: businessTypeLabel(t, s.businessType),
    hasFrozen: products.some((p) => p.productType === 'frozen') || cuisine.some((c) => /frozen/i.test(c)),
    searchText: [s.businessName, s.chef?.name, area, city, s.community?.name, ...cuisine, ...products.map((p) => p.name)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
    href: `/kitchens/${s.id}`,
  };
}

function toHomeDish(p: Product, t: HomeT): HomeDish {
  const price = Number(p.price);
  const original = p.originalPrice != null ? Number(p.originalPrice) : null;
  return {
    id: p.id,
    name: p.name,
    kitchenName: p.seller?.businessName ?? '',
    kitchenId: p.seller?.id ?? '',
    price,
    originalPrice: original != null && Number.isFinite(original) && original > price ? original : null,
    rating: displayRating(p.ratingAverage, p.totalReviews),
    isFrozen: p.productType === 'frozen',
    typeLabel: p.productType && PRODUCT_TYPE_LABELS[p.productType] ? t(PRODUCT_TYPE_LABELS[p.productType]) : null,
    photo: p.primaryImage || null,
  };
}

function parseStats(data: unknown): PublicStats | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!isCount(d.kitchens) || !isCount(d.communities) || !isCount(d.dishes)) return null;
  return {
    kitchens: d.kitchens,
    communities: d.communities,
    dishes: d.dishes,
    reviews: isCount(d.reviews) ? d.reviews : 0,
    averageRating: typeof d.averageRating === 'number' && Number.isFinite(d.averageRating) ? d.averageRating : null,
  };
}

function matchesText(k: HomeKitchen, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  return k.searchText.includes(q) || (q === 'frozen' && k.hasFrozen);
}

const formatCount = (n: number) => n.toLocaleString('en-US');
/** "1 review" / "12 reviews": the one/many message keys, filled with the formatted count. */
const countLabel = (t: HomeT, n: number, one: HomeKey, many: HomeKey) => t(n === 1 ? one : many, { n: formatCount(n) });

function kitchenCaption(t: HomeT, k: HomeKitchen): string | null {
  const prep = k.prepMinutes != null ? t('minPrep', { n: k.prepMinutes }) : null;
  if (k.isOpen) return prep ?? t('avail.open');
  return k.statusLabel ?? prep;
}

// ============================================================
// LOADING / EMPTY / ERROR STATES
// ============================================================

function SectionNotice({
  title,
  message,
  action,
  role,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div role={role} className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {message && <p className="text-xs text-slate-500 font-medium mt-1 max-w-md mx-auto">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  const t = useT(homeMessages);
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      <span>{t('tryAgain')}</span>
    </button>
  );
}

function KitchenAvatarSkeleton() {
  return (
    <div aria-hidden="true" className="flex-shrink-0 flex flex-col items-center gap-1.5">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-200 animate-pulse" />
      <div className="h-2.5 w-16 rounded bg-slate-200 animate-pulse" />
      <div className="h-2 w-10 rounded bg-slate-100 animate-pulse" />
    </div>
  );
}

function KitchenCardSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="aspect-[16/10] w-full bg-slate-200 animate-pulse" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-slate-200 animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded bg-slate-200 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
        <div className="h-2.5 w-3/4 rounded bg-slate-100 animate-pulse" />
        <div className="pt-2.5 border-t border-slate-100 flex gap-1">
          <div className="h-4 w-16 rounded-md bg-slate-100 animate-pulse" />
          <div className="h-4 w-12 rounded-md bg-slate-100 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function DishCardSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <div className="aspect-square bg-slate-200 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-2.5 w-2/3 rounded bg-slate-100 animate-pulse" />
        <div className="h-3 w-full rounded bg-slate-200 animate-pulse" />
        <div className="pt-2 border-t border-slate-100">
          <div className="h-3 w-1/3 rounded bg-slate-200 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { addItem, getItemCount } = useCartStore();
  const { showToast } = useToast();
  const t = useT(homeMessages);
  const { locale } = useLocale();

  const [orderMode, setOrderMode] = useState<'delivery' | 'pickup' | 'coldchain'>('delivery');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<KitchenFilter>('all');
  const [selectedCuisine, setSelectedCuisine] = useState<string>('');
  const [favoriteKitchenIds, setFavoriteKitchenIds] = useState<Set<string>>(new Set());

  const [sellers, setSellers] = useState<PublicSeller[]>([]);
  const [kitchensState, setKitchensState] = useState<LoadState>('loading');
  const [kitchensAttempt, setKitchensAttempt] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  // Kitchens people are ordering from right now, and personal dish lists (signed in).
  const [trendingSellers, setTrendingSellers] = useState<PublicSeller[]>([]);
  const [recommended, setRecommended] = useState<Array<Product & { recommendationReason?: string }>>([]);
  const [orderAgain, setOrderAgain] = useState<Product[]>([]);
  const [dishesState, setDishesState] = useState<LoadState>('loading');
  const [dishesAttempt, setDishesAttempt] = useState(0);
  const [stats, setStats] = useState<PublicStats | null>(null);

  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    existingKitchenName: string;
    dish: HomeDish | null;
  }>({
    isOpen: false,
    existingKitchenName: '',
    dish: null,
  });
  const [switchingKitchen, setSwitchingKitchen] = useState(false);

  // Verified kitchens. Requested directly rather than through sellerService.getPublicSellers,
  // which turns a failed request into an empty list — we need to tell "none yet" from "failed".
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ApiResponse<PublicSeller[]>>('/sellers', { params: { limit: 12 } })
      .then((res) => {
        if (cancelled) return;
        setSellers(res.data?.data ?? []);
        setKitchensState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load landing kitchens:', err);
        setKitchensState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [kitchensAttempt]);

  // Approved dishes, most-ordered first.
  useEffect(() => {
    let cancelled = false;
    productService
      .getProducts({ limit: 12, sort: 'popular' })
      .then((res) => {
        if (cancelled) return;
        setProducts(res?.data?.products ?? []);
        setDishesState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load landing dishes:', err);
        setDishesState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [dishesAttempt]);

  // Real platform numbers. If this fails the numbers are simply not shown.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ApiResponse<PublicStats>>('/stats/public')
      .then((res) => {
        if (!cancelled) setStats(parseStats(res.data?.data));
      })
      .catch(() => {
        // Leave stats null: the stats band stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The signed-in customer's saved kitchens, so the hearts reflect what is really saved.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    favoriteService
      .getFavorites()
      .then((favs) => {
        if (!cancelled) setFavoriteKitchenIds(new Set(favs.map((f) => f.sellerId)));
      })
      .catch(() => {
        // Hearts just start empty.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Trending kitchens: only ones with real recent orders (the section hides when there are none).
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ApiResponse<PublicSeller[]>>('/sellers', { params: { sort: 'trending', limit: 10 } })
      .then((res) => {
        if (!cancelled) setTrendingSellers(res.data?.data ?? []);
      })
      .catch(() => {
        // The section just stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Order again" and "Recommended for you" for a signed-in customer.
  useEffect(() => {
    if (!isAuthenticated) {
      setRecommended([]);
      setOrderAgain([]);
      return;
    }
    let cancelled = false;
    type DishList = ApiResponse<{ products: Array<Product & { recommendationReason?: string }> }>;
    apiClient
      .get<DishList>('/products/order-again', { params: { limit: 6 } })
      .then((res) => {
        if (!cancelled) setOrderAgain(res.data?.data?.products ?? []);
      })
      .catch(() => undefined);
    apiClient
      .get<DishList>('/products/recommended', { params: { limit: 6 } })
      .then((res) => {
        if (!cancelled) setRecommended(res.data?.data?.products ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const userType = user.userType || user.user_type;
      if (userType === 'admin') router.push('/admin/dashboard');
      else if (userType === 'seller') router.push('/sellers/dashboard');
      else if (userType === 'rider') router.push('/riders/dashboard');
    }
  }, [isAuthenticated, user, router]);

  // Mapped at render so the labels follow the chosen language.
  const kitchens = useMemo(() => sellers.map((s) => toHomeKitchen(s, t, locale)), [sellers, t, locale]);
  const dishes = useMemo(() => products.map((p) => toHomeDish(p, t)), [products, t]);
  const trendingKitchens = useMemo(() => trendingSellers.map((s) => toHomeKitchen(s, t, locale)), [trendingSellers, t, locale]);
  const recommendedDishes = useMemo(
    () => recommended.map((p) => ({ dish: toHomeDish(p, t), reason: p.recommendationReason })),
    [recommended, t]
  );
  const orderAgainDishes = useMemo(() => orderAgain.map((p) => toHomeDish(p, t)), [orderAgain, t]);

  /** One dish card (popular, order again, recommended). `note` is a small line above the name. */
  const renderDishCard = (dish: HomeDish, note?: string) => (
    <div
      key={dish.id}
      className="group bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
    >
      {/* Dish Photo */}
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        <CoverImage
          src={dish.photo}
          alt={dish.name}
          label={dish.name}
          size="md"
          className="w-full h-full group-hover:scale-105 transition-transform duration-300"
        />

        {/* Product Type Tag (as set by the kitchen) */}
        {dish.typeLabel && (
          <span
            className={`absolute top-2 start-2 px-1.5 py-0.5 rounded-md text-white text-[11px] font-bold flex items-center gap-0.5 ${
              dish.isFrozen ? 'bg-cyan-600' : 'bg-[#FF5500]'
            }`}
          >
            {dish.isFrozen ? <Snowflake className="w-2.5 h-2.5" /> : <Flame className="w-2.5 h-2.5" />}
            <span>{dish.typeLabel}</span>
          </span>
        )}

        {/* Direct Add to Cart Button */}
        <button
          onClick={(e) => handleAddDishToCart(dish, e)}
          className="absolute bottom-2 end-2 w-8 h-8 rounded-full bg-[#FF5500] hover:bg-[#e04400] text-white shadow-md flex items-center justify-center font-bold text-sm transition-transform active:scale-95"
          title={t('addToTray')}
          aria-label={t('addNameToTray', { name: dish.name })}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Dish Info */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          {note && <p className="text-[11px] font-bold text-[#FF5500] truncate mb-0.5">{note}</p>}
            <p className="text-[11px] font-semibold text-slate-500 truncate flex items-center gap-1">
            <ChefHat className="w-3 h-3 text-slate-400" />
            <span>{dish.kitchenName}</span>
          </p>
          <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2 mt-0.5 group-hover:text-[#FF5500] transition-colors">
            {dish.name}
          </h4>
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-950 block">
              {formatPrice(dish.price)}
            </span>
            {dish.originalPrice != null && (
              <span className="text-[11px] text-slate-400 line-through">
                {formatPrice(dish.originalPrice)}
              </span>
            )}
          </div>
          {dish.rating && (
            <span className="text-[11px] font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-amber-200/60">
              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
              <span>{dish.rating}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const retryKitchens = () => {
    setKitchensState('loading');
    setKitchensAttempt((n) => n + 1);
  };

  const retryDishes = () => {
    setDishesState('loading');
    setDishesAttempt((n) => n + 1);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCuisine('');
    setSelectedFilter('all');
  };

  const toggleFavorite = async (kitchenId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      showToast(t('signInToSave'), 'info');
      return;
    }
    const wasSaved = favoriteKitchenIds.has(kitchenId);
    const setSaved = (saved: boolean) =>
      setFavoriteKitchenIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(kitchenId);
        else next.delete(kitchenId);
        return next;
      });
    setSaved(!wasSaved);
    try {
      if (wasSaved) await favoriteService.removeFavorite(kitchenId);
      else await favoriteService.addFavorite(kitchenId);
      showToast(wasSaved ? t('removedSaved') : t('savedFav'), wasSaved ? 'info' : 'success');
    } catch {
      setSaved(wasSaved);
      showToast(t('favFailed'), 'error');
    }
  };

  const handleAddDishToCart = async (dish: HomeDish, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    addItem({
      id: `${dish.id}-${Date.now()}`,
      productId: dish.id,
      productName: dish.name,
      productImage: dish.photo ?? undefined,
      sellerId: dish.kitchenId,
      sellerName: dish.kitchenName,
      quantity: 1,
      unitPrice: dish.price,
      stockType: dish.isFrozen ? 'hub' : 'direct',
      subtotal: dish.price,
    });

    const token = apiClient.getAccessToken();
    if (token || isAuthenticated) {
      try {
        await cartService.addToCart({
          productId: dish.id,
          quantity: 1,
          stockType: dish.isFrozen ? 'hub' : 'direct',
        });
      } catch (err: unknown) {
        const response = isAxiosError(err) ? err.response : undefined;
        const apiError = (response?.data as CartErrorBody | undefined)?.error;
        if (response?.status === 409 || apiError?.code === 'CART_SELLER_MISMATCH') {
          setConflictModal({
            isOpen: true,
            existingKitchenName: apiError?.details?.existingSeller?.name || t('anotherKitchen'),
            dish,
          });
          return;
        }
      }
    }
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
      useCartStore.getState().addItem({
        id: `${dish.id}-${Date.now()}`,
        productId: dish.id,
        productName: dish.name,
        productImage: dish.photo ?? undefined,
        sellerId: dish.kitchenId,
        sellerName: dish.kitchenName,
        quantity: 1,
        unitPrice: dish.price,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        subtotal: dish.price,
      });
      showToast(t('trayUpdated', { name: dish.kitchenName }), 'success');
      setConflictModal({ isOpen: false, existingKitchenName: '', dish: null });
    } catch {
      showToast(t('replaceFailed'), 'error');
    } finally {
      setSwitchingKitchen(false);
    }
  };

  const filteredKitchens = kitchens.filter((k) => {
    if (!matchesText(k, searchQuery)) return false;
    if (selectedCuisine && !matchesText(k, selectedCuisine)) return false;
    switch (selectedFilter) {
      case 'top_rated':
        return k.ratingValue >= TOP_RATED_MIN_RATING && k.reviewsCount >= TOP_RATED_MIN_REVIEWS;
      case 'fast':
        return k.prepMinutes != null && k.prepMinutes < QUICK_PREP_MAX_MINUTES;
      case 'free_delivery':
        return k.offersFreeDelivery;
      case 'deals':
        return k.deal != null;
      case 'frozen':
        return k.hasFrozen;
      default:
        return true;
    }
  });

  const filterChips: Array<{ id: KitchenFilter; label: string; icon: LucideIcon }> = [
    { id: 'all', label: t('fAll'), icon: ChefHat },
    { id: 'top_rated', label: t('fTopRated', { n: TOP_RATED_MIN_RATING }), icon: Star },
    { id: 'fast', label: t('fFast', { n: QUICK_PREP_MAX_MINUTES }), icon: Clock },
    { id: 'free_delivery', label: t('fFree'), icon: Bike },
    { id: 'deals', label: t('fDeals'), icon: Tag },
    { id: 'frozen', label: t('fFrozen'), icon: Snowflake },
  ];

  const statCards: Array<{ key: string; icon: LucideIcon; iconClass: string; valueClass: string; value: string; label: string }> =
    stats && stats.kitchens > 0
      ? [
          {
            key: 'kitchens',
            icon: ChefHat,
            iconClass: 'text-orange-400',
            valueClass: 'text-white',
            value: formatCount(stats.kitchens),
            label: stats.kitchens === 1 ? t('statKitchen') : t('statKitchens'),
          },
          {
            key: 'communities',
            icon: MapPin,
            iconClass: 'text-emerald-400',
            valueClass: 'text-white',
            value: formatCount(stats.communities),
            label: stats.communities === 1 ? t('statCommunity') : t('statCommunities'),
          },
          {
            key: 'dishes',
            icon: UtensilsCrossed,
            iconClass: 'text-cyan-400',
            valueClass: 'text-white',
            value: formatCount(stats.dishes),
            label: stats.dishes === 1 ? t('statDish') : t('statDishes'),
          },
          ...(stats.averageRating != null
            ? [
                {
                  key: 'rating',
                  icon: Star,
                  iconClass: 'text-amber-400',
                  valueClass: 'text-amber-400',
                  value: `${stats.averageRating.toFixed(1)} / 5`,
                  label: t('statAvg', { reviews: countLabel(t, stats.reviews, 'reviewsOne', 'reviewsMany') }),
                },
              ]
            : []),
        ]
      : [];

  const cartCount = getItemCount();

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#0F172A]">
      {/* Slide-over Cart Drawer */}
      <SlideOverCartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />

      {/* Left Navigation Drawer */}
      <UberLeftSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeFilter={selectedFilter}
        onSelectFilter={(f) => {
          if (isKitchenFilter(f)) setSelectedFilter(f);
        }}
      />

      {/* Top Notification / Platform Status Bar */}
      <div className="bg-[#0C1016] text-white px-4 py-1.5 text-xs font-medium border-b border-white/5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold uppercase text-[11px] tracking-wider">{t('platformLive')}</span>
            {stats && stats.kitchens > 0 && (
              <span className="text-slate-300 hidden sm:inline text-xs">
                {t('liveLine', {
                  kitchens: countLabel(t, stats.kitchens, 'liveKitchensOne', 'liveKitchens'),
                  dishes: countLabel(t, stats.dishes, 'liveDishOne', 'liveDishes'),
                })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-300">
            <Link href="/sellers/register" className="text-[#FF5500] hover:text-[#ff7333] font-semibold flex items-center gap-1">
              <ChefHat className="w-3 h-3" />
              <span>{t('openHomeKitchen')}</span>
            </Link>
            <Link href="/riders/dashboard" className="hidden md:inline hover:text-white text-slate-400">
              {t('riderPortal')}
            </Link>
          </div>
        </div>
      </div>

      {/* ============================================================
          MAIN TOP NAVIGATION BAR (Streamlined Nordic/US Standards)
          ============================================================ */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
          {/* Left section: Hamburger & Logo */}
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200/80 flex items-center justify-center text-slate-700 transition-colors"
              aria-label={t('openNav')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <Link href="/" className="hover:opacity-95 transition-opacity" aria-label="Nuray">
              {/* Just the mark on small phones, so the header's buttons fit (Urdu labels run longer). */}
              <span className="sm:hidden"><Mark size={32} /></span>
              <span className="hidden sm:inline"><BrandLockup markSize={32} wordSize={22} /></span>
            </Link>
          </div>

          {/* Delivery / Pickup Mode Toggle Pill */}
          <div className="hidden lg:flex items-center bg-slate-100 p-0.5 rounded-full border border-slate-200/80 flex-shrink-0">
            <button
              onClick={() => setOrderMode('delivery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                orderMode === 'delivery'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bike className="w-3.5 h-3.5 text-slate-600" />
              <span>{t('freshDelivery')}</span>
            </button>
            <button
              onClick={() => setOrderMode('pickup')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                orderMode === 'pickup'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-slate-600" />
              <span>{t('pickup')}</span>
            </button>
            <button
              onClick={() => {
                setOrderMode('coldchain');
                setSelectedFilter('frozen');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                orderMode === 'coldchain'
                  ? 'bg-cyan-50 text-cyan-900 border border-cyan-300/80 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5 text-cyan-600" />
              <span>{t('frozenHub')}</span>
            </button>
          </div>

          {/* Delivery Location Selector */}
          <div className="relative hidden md:block flex-shrink-0">
            <CommunitySelector variant="navbar" />
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md relative hidden sm:block">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute start-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full h-10 ps-10 pe-4 rounded-xl bg-slate-50 hover:bg-slate-100 focus:bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:border-[#FF5500] focus:ring-2 focus:ring-orange-500/10 transition-all outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label={t('clearSearch')}
                  className="absolute end-3 text-xs text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Right Action Buttons: Cart Drawer Trigger & Auth */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <LanguageSwitcher className="px-2" />

            {/* Slide-over Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center gap-1.5 h-10 px-3 sm:px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-900 border border-slate-200 text-xs font-bold transition-colors"
              aria-label={t('openTray')}
            >
              <ShoppingBag className="w-4 h-4 text-slate-700" />
              <span className="hidden md:inline">{t('tray')}</span>
              {cartCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#FF5500] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                  {cartCount}
                </span>
              )}
            </button>

            {/* User Dropdown or Sign in */}
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 h-10 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs font-semibold text-slate-800 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-[#FF5500] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                    {(user.profile?.fullName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <span className="hidden xl:inline max-w-[80px] truncate">
                    {user.profile?.fullName?.split(' ')[0] || user.email?.split('@')[0]}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute end-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50">
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{user.profile?.fullName || t('customer')}</p>
                      <p className="text-[11px] text-slate-500 truncate" data-ltr>{user.email}</p>
                    </div>
                    <Link
                      href="/orders"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <Package className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('myOrders')}</span>
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('customerDashboard')}</span>
                    </Link>
                    <Link
                      href="/profile/addresses"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('savedAddresses')}</span>
                    </Link>
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-start flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors mt-1 border-t border-slate-100"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-500" />
                      <span>{t('signOut')}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/login"
                  className="h-10 hidden sm:inline-flex items-center px-3 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {t('signIn')}
                </Link>
                <Link
                  href="/register"
                  className="h-10 inline-flex items-center px-3.5 rounded-xl text-xs font-bold bg-[#FF5500] hover:bg-[#E04400] text-white shadow-2xs transition-colors"
                >
                  {t('join')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ============================================================
          CUISINES & CRAVINGS CAROUSEL
          ============================================================ */}
      <section className="bg-white border-b border-slate-200/80 py-3">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
          <CuisineCarousel
            selectedCuisine={selectedCuisine}
            onSelectCuisine={(q) => {
              setSelectedCuisine(selectedCuisine === q ? '' : q);
            }}
          />
        </div>
      </section>

      {/* ============================================================
          QUICK FILTER CHIPS BAR
          ============================================================ */}
      <section className="bg-white/90 backdrop-blur-md border-b border-slate-200/70 py-2.5 sticky top-16 z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {filterChips.map((chip) => {
              const Icon = chip.icon;
              const isActive = selectedFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setSelectedFilter(chip.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          <Link
            href="/products"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-[#FF5500] hover:text-[#e04400] whitespace-nowrap"
          >
            <span>{t('browseAllMenus')}</span>
            <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* ============================================================
          HERO PROMOTIONAL BANNERS (Refined Nordic Dimensions)
          ============================================================ */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-6 pb-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {/* Banner 1: Authentic Home Food */}
          <div className="relative rounded-2xl p-5 sm:p-6 overflow-hidden bg-gradient-to-br from-[#EA580C] via-[#C2410C] to-[#9A3412] text-white shadow-md flex flex-col justify-between min-h-[155px] group">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/25 text-[11px] font-bold uppercase tracking-wider mb-2">
                <Flame className="w-3 h-3 text-orange-200" />
                <span>{t('b1Tag')}</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight text-white">
                {t('b1Title')}
              </h2>
              <p className="text-xs text-orange-100 mt-1 max-w-[260px] font-normal leading-relaxed">
                {t('b1Body')}
              </p>
            </div>
            <div className="relative z-10 pt-3">
              <Link
                href="/products"
                className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <span>{t('b1Cta')}</span>
                <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Banner 2: Open a home kitchen */}
          <div className="relative rounded-2xl p-5 sm:p-6 overflow-hidden bg-gradient-to-br from-[#B45309] via-[#92400E] to-[#78350F] text-white shadow-md flex flex-col justify-between min-h-[155px] group">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/30 text-[11px] font-bold uppercase tracking-wider mb-2">
                <ChefHat className="w-3 h-3 text-amber-200" />
                <span>{t('b2Tag')}</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight text-white">
                {t('b2Title')}
              </h2>
              <p className="text-xs text-amber-100 mt-1 max-w-[260px] font-normal leading-relaxed">
                {t('b2Body')}
              </p>
            </div>
            <div className="relative z-10 pt-3">
              <Link
                href="/sellers/register"
                className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <span>{t('b2Cta')}</span>
                <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Banner 3: Frozen pantry */}
          <div className="relative rounded-2xl p-5 sm:p-6 overflow-hidden bg-gradient-to-br from-[#0284C7] via-[#0369A1] to-[#075985] text-white shadow-md flex flex-col justify-between min-h-[155px] group">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/30 text-[11px] font-bold uppercase tracking-wider mb-2">
                <Snowflake className="w-3 h-3 text-cyan-200" />
                <span>{t('b3Tag')}</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight text-white">
                {t('b3Title')}
              </h2>
              <p className="text-xs text-cyan-100 mt-1 max-w-[260px] font-normal leading-relaxed">
                {t('b3Body')}
              </p>
            </div>
            <div className="relative z-10 pt-3">
              <Link
                href="/products?productType=frozen"
                className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <span>{t('b3Cta')}</span>
                <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          TRENDING KITCHENS — most ordered from right now (recent orders count most;
          see backend utils/ranking.ts). Hidden until there is real recent demand.
          ============================================================ */}
      {trendingKitchens.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-6" data-testid="trending-kitchens">
          <div className="mb-3">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Flame className="w-5 h-5 text-[#FF5500]" />
              {t('trendingKitchens')}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{t('trendingKitchensSub')}</p>
          </div>
          <div className="flex items-stretch gap-3 overflow-x-auto scrollbar-none py-1 px-0.5">
            {trendingKitchens.map((k, i) => (
              <Link
                key={k.id}
                href={k.href}
                className="flex-shrink-0 w-56 flex items-center gap-3 p-2.5 rounded-2xl bg-white border border-slate-200/80 hover:border-[#FF5500] shadow-2xs transition-colors group"
              >
                <span className="w-6 text-center text-lg font-black text-[#FF5500]">{i + 1}</span>
                <div className="relative w-12 h-12 rounded-full overflow-hidden border border-slate-200 flex-shrink-0">
                  <CoverImage src={k.avatar || k.coverPhoto} alt={k.name} label={k.name} size="sm" className="w-full h-full" />
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 truncate group-hover:text-[#FF5500]">{k.name}</span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {[k.rating ? `★ ${k.rating}` : null, k.statusLabel].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ============================================================
          "KITCHENS ON NURAY" (Compact Avatar Row)
          Hidden when there is nothing to show; the grid below explains why.
          ============================================================ */}
      {(kitchensState === 'loading' || (kitchensState === 'ready' && kitchens.length > 0)) && (
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                {t('kitchensOnNuray')}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {t('kitchensOnNuraySub')}
              </p>
            </div>
            <Link
              href="/kitchens"
              className="text-xs font-bold text-[#FF5500] hover:underline flex items-center gap-1"
            >
              <span>{t('seeAll')}</span>
              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Compact Avatar Row */}
          <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none py-1 px-0.5">
            {kitchensState === 'loading'
              ? Array.from({ length: 8 }, (_, i) => <KitchenAvatarSkeleton key={i} />)
              : kitchens.map((k) => {
                  const caption = kitchenCaption(t, k);
                  return (
                    <Link
                      key={k.id}
                      href={k.href}
                      className="flex-shrink-0 flex flex-col items-center gap-1.5 group text-center"
                    >
                      <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border border-slate-200 group-hover:border-[#FF5500] transition-all shadow-2xs">
                        <CoverImage
                          src={k.avatar || k.coverPhoto}
                          alt={k.name}
                          label={k.name}
                          size="sm"
                          className="w-full h-full group-hover:scale-105 transition-transform"
                        />
                        {k.statusLabel && (
                          <span
                            className={`absolute bottom-0.5 end-0.5 w-3 h-3 rounded-full border border-white ${
                              k.isOpen ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                            title={k.statusLabel}
                          />
                        )}
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-slate-900 group-hover:text-[#FF5500] max-w-[85px] sm:max-w-[95px] truncate">
                          {k.name}
                        </span>
                        {caption && (
                          <span className="block text-[11px] text-slate-500 font-medium">
                            {caption}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
          </div>
        </section>
      )}

      {/* ============================================================
          KITCHEN GRID (High-Density Cards)
          ============================================================ */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FF5500] mb-0.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('verifiedKitchens')}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {t('browseHomeKitchens')}
            </h2>
          </div>
          <Link
            href="/kitchens"
            className="text-xs font-bold text-[#FF5500] hover:underline flex items-center gap-1"
          >
            <span>{t('viewAll')}</span>
            <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
          </Link>
        </div>

        {kitchensState === 'loading' ? (
          <div role="status" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
            <span className="sr-only">{t('loadingKitchens')}</span>
            {Array.from({ length: 6 }, (_, i) => (
              <KitchenCardSkeleton key={i} />
            ))}
          </div>
        ) : kitchensState === 'error' ? (
          <SectionNotice
            role="alert"
            title={t('kitchensError')}
            message={t('checkConnection')}
            action={<RetryButton onClick={retryKitchens} />}
          />
        ) : kitchens.length === 0 ? (
          <SectionNotice
            title={t('noKitchens')}
            message={t('noKitchensBody')}
            action={
              <Link
                href="/sellers/register"
                className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>{t('openHomeKitchen')}</span>
              </Link>
            }
          />
        ) : filteredKitchens.length === 0 ? (
          <SectionNotice
            title={t('noMatch')}
            message={t('noMatchBody')}
            action={
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                {t('clearFilters')}
              </button>
            }
          />
        ) : (
          /* Responsive Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
            {filteredKitchens.map((kitchen) => {
              const isFav = isAuthenticated && favoriteKitchenIds.has(kitchen.id);
              return (
                <Link
                  key={kitchen.id}
                  href={kitchen.href}
                  className="group flex flex-col justify-between bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden"
                >
                  {/* Cover Image */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                    <CoverImage
                      src={kitchen.coverPhoto}
                      alt={kitchen.name}
                      label={kitchen.name}
                      size="md"
                      className="w-full h-full transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

                    {/* Deal Tag — only when one of its dishes is really discounted */}
                    {kitchen.deal && (
                      <span className="absolute top-3 start-3 px-2.5 py-1 rounded-md text-white text-[11px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider">
                        {kitchen.deal}
                      </span>
                    )}

                    {/* Heart Button */}
                    <button
                      onClick={(e) => toggleFavorite(kitchen.id, e)}
                      className="absolute top-3 end-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-slate-700 hover:scale-110 transition-transform shadow-xs"
                      aria-label={isFav ? t('removeSaved') : t('saveFav')}
                      aria-pressed={isFav}
                    >
                      <Heart
                        className={`w-4 h-4 transition-colors ${
                          isFav ? 'fill-red-500 text-red-500' : 'text-slate-600 hover:text-red-500'
                        }`}
                      />
                    </button>

                    {/* Prep Time Pill (the kitchen's own minimum prep time) */}
                    {kitchen.prepMinutes != null && (
                      <span className="absolute bottom-3 end-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{t('minPrep', { n: kitchen.prepMinutes })}</span>
                      </span>
                    )}

                    {/* Kitchen Type Badge (every listed kitchen is verified) */}
                    <span className="absolute bottom-3 start-3 px-2 py-0.5 rounded-md bg-emerald-600/90 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>{kitchen.badge}</span>
                    </span>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CoverImage
                            src={kitchen.avatar}
                            alt={kitchen.chef || kitchen.name}
                            label={kitchen.chef || kitchen.name}
                            size="sm"
                            className="w-9 h-9 rounded-xl border border-slate-200 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] truncate transition-colors">
                              {kitchen.name}
                            </h3>
                            {(kitchen.chef || kitchen.area) && (
                              <p className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1">
                                {kitchen.chef && <span>{kitchen.chef}</span>}
                                {kitchen.chef && kitchen.area && <span>•</span>}
                                {kitchen.area && (
                                  <>
                                    <MapPin className="w-3 h-3 text-slate-400 inline flex-shrink-0" />
                                    <span>{kitchen.area}</span>
                                  </>
                                )}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Rating pill: the real rating, or "New" before any reviews */}
                        {kitchen.rating ? (
                          <span
                            className="flex-shrink-0 bg-amber-50 text-amber-900 px-2 py-0.5 rounded-lg text-xs font-bold border border-amber-200/80 flex items-center gap-1"
                            title={countLabel(t, kitchen.reviewsCount, 'reviewsOne', 'reviewsMany')}
                          >
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{kitchen.rating}</span>
                            <span className="font-medium text-amber-700/80">({formatCount(kitchen.reviewsCount)})</span>
                          </span>
                        ) : (
                          <span className="flex-shrink-0 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-lg text-xs font-bold border border-slate-200">
                            {t('newBadge')}
                          </span>
                        )}
                      </div>

                      {/* Open / closed, from the kitchen's real schedule */}
                      {kitchen.statusLabel && (
                        <div className="mt-2 text-[11px] font-semibold flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              kitchen.isOpen ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          <span className={kitchen.isOpen ? 'text-emerald-700' : 'text-slate-500'}>
                            {kitchen.statusLabel}
                          </span>
                          {kitchen.isOpen && kitchen.closesAt && (
                            <span className="font-medium text-slate-400">{t('closesAt', { time: kitchen.closesAt })}</span>
                          )}
                          {!kitchen.isOpen && kitchen.opensAt && (
                            <span className="font-medium text-slate-400">{t('opensAt', { time: kitchen.opensAt })}</span>
                          )}
                        </div>
                      )}

                      {/* Delivery terms — only what the kitchen has set */}
                      {(kitchen.deliveryFee || kitchen.minOrder) && (
                        <div className="mt-2 text-xs text-slate-600 font-medium flex items-center gap-2">
                          {kitchen.deliveryFee && (
                            <span className="flex items-center gap-1 text-slate-700">
                              <Bike className="w-3.5 h-3.5 text-slate-400" />
                              <span>{kitchen.deliveryFee}</span>
                            </span>
                          )}
                          {kitchen.deliveryFee && kitchen.minOrder && <span className="text-slate-300">•</span>}
                          {kitchen.minOrder && (
                            <span className="text-[11px] text-slate-400">{t('minOrder', { amount: kitchen.minOrder })}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Meal categories the kitchen chose */}
                    {kitchen.cuisine.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1">
                        {kitchen.cuisine.map((c) => (
                          <span key={c} className="px-2 py-0.5 rounded-md bg-slate-50 text-[11px] font-semibold text-slate-600 border border-slate-100">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ============================================================
          ORDER AGAIN / RECOMMENDED FOR YOU — signed-in customers only
          ============================================================ */}
      {orderAgainDishes.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-8" data-testid="order-again">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-4">{t('orderAgain')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {orderAgainDishes.map((dish) => renderDishCard(dish))}
          </div>
        </section>
      )}
      {recommendedDishes.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-8" data-testid="recommended">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{t('recommendedForYou')}</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5 mb-4">{t('recommendedForYouSub')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {recommendedDishes.map(({ dish, reason }) =>
              renderDishCard(dish, reason === 'similar_customers' ? t('reasonSimilar') : reason === 'kitchen_you_like' ? t('reasonKitchen') : reason === 'category_you_like' ? t('reasonCategory') : t('reasonTrending'))
            )}
          </div>
        </section>
      )}

      {/* ============================================================
          POPULAR DISHES (Compact Grid) — what people are ordering now (trend score)
          ============================================================ */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FF5500] mb-0.5">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>{t('fromHomeKitchens')}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {t('popularDishes')}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {t('popularDishesSub')}
            </p>
          </div>
          <Link
            href="/products"
            className="text-xs font-bold text-[#FF5500] hover:underline flex items-center gap-1"
          >
            <span>{t('exploreAllDishes')}</span>
            <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
          </Link>
        </div>

        {dishesState === 'loading' ? (
          <div role="status" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
            <span className="sr-only">{t('loadingDishes')}</span>
            {Array.from({ length: 6 }, (_, i) => (
              <DishCardSkeleton key={i} />
            ))}
          </div>
        ) : dishesState === 'error' ? (
          <SectionNotice
            role="alert"
            title={t('dishesError')}
            message={t('checkConnection')}
            action={<RetryButton onClick={retryDishes} />}
          />
        ) : dishes.length === 0 ? (
          <SectionNotice
            title={t('noDishes')}
            message={t('noDishesBody')}
          />
        ) : (
          /* Dishes Grid */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {dishes.map((dish) => renderDishCard(dish))}
          </div>
        )}
      </section>

      {/* ============================================================
          PLATFORM STATS — real numbers from GET /stats/public, hidden if unavailable
          ============================================================ */}
      {statCards.length > 0 && (
        <section className="bg-slate-900 text-white py-12 border-t border-slate-800">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-8 text-center">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {t('statsTitle')}
            </h3>
            <p className="text-slate-400 text-xs sm:text-sm mt-1.5 max-w-xl mx-auto font-normal">
              {t('statsBody')}
            </p>

            <div
              className={`mt-8 grid gap-4 max-w-3xl mx-auto ${
                statCards.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'
              }`}
            >
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.key} className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <Icon className={`w-5 h-5 mx-auto ${card.iconClass}`} />
                    <div className={`text-xl font-bold mt-2 ${card.valueClass}`}>{card.value}</div>
                    <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">{card.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ============================================================
          PLATFORM FOOTER
          ============================================================ */}
      <footer className="bg-white border-t border-slate-200 py-8">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BrandLockup markSize={28} wordSize={20} />
              <span className="text-xs text-slate-300">|</span>
              <span className="text-xs font-medium text-slate-500">
                {t('footerTagline')}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-600">
              <Link href="/kitchens" className="hover:text-[#FF5500]">{t('allKitchens')}</Link>
              <Link href="/products" className="hover:text-[#FF5500]">{t('dishesPacks')}</Link>
              <Link href="/products?productType=frozen" className="hover:text-[#FF5500]">{t('frozenPantry')}</Link>
              <Link href="/sellers/register" className="hover:text-[#FF5500]">{t('openKitchen')}</Link>
              <Link href="/riders/dashboard" className="hover:text-[#FF5500]">{t('riderPortal')}</Link>
              <Link href="/help" className="hover:text-[#FF5500]">{t('help')}</Link>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 font-normal gap-2">
            <p>{t('rights', { year: new Date().getFullYear() })}</p>
            <nav aria-label={t('legal')} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <Link href="/terms" className="hover:text-[#FF5500]">{t('terms')}</Link>
              <Link href="/privacy" className="hover:text-[#FF5500]">{t('privacy')}</Link>
              <Link href="/refund-policy" className="hover:text-[#FF5500]">{t('refund')}</Link>
            </nav>
            <p>{t('cities')}</p>
          </div>
        </div>
      </footer>

      {/* Styled Modern Modal for Single Kitchen Batch Switching */}
      <ConfirmModal
        isOpen={conflictModal.isOpen}
        title={t('conflictTitle')}
        message={t('conflictBody', { existing: conflictModal.existingKitchenName, kitchen: conflictModal.dish?.kitchenName })}
        confirmText={t('conflictConfirm')}
        cancelText={t('conflictCancel')}
        variant="warning"
        loading={switchingKitchen}
        onConfirm={handleConfirmSwitchKitchen}
        onCancel={() => setConflictModal({ isOpen: false, existingKitchenName: '', dish: null })}
      />
    </div>
  );
}
