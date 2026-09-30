'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Star,
  Clock,
  Bike,
  ShieldCheck,
  Heart,
  MapPin,
  Flame,
  Snowflake,
  ChefHat,
  SlidersHorizontal,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';
import { BrandLockup } from '@/components/ui/Mark';
import { sellerService, PublicSeller } from '@/lib/services/seller.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import { ShoppingBag } from 'lucide-react';

interface Kitchen {
  id: string;
  name: string;
  chef: string;
  area: string;
  rating: number;
  reviewsCount: number;
  eta: string;
  deliveryFee: string;
  distance: string;
  isOpen: boolean;
  closesAt: string;
  deal?: string;
  dealTag?: string;
  cuisine: string[];
  coverPhoto: string;
  avatar: string;
  badge: string;
  popularDish: string;
  minOrder: string;
  href: string;
  isSubZero?: boolean;
}

const ALL_KITCHENS: Kitchen[] = [
  {
    id: 'k-saima',
    name: "Saima's Craft Kitchen",
    chef: 'Chef Saima Akhtar',
    area: 'Gulshan-e-Iqbal, Block 4',
    rating: 4.8,
    reviewsCount: 245,
    eta: '20-30 min',
    deliveryFee: 'Free over Rs 500',
    distance: '1.2 km',
    isOpen: true,
    closesAt: '11:30 PM',
    deal: 'Free Delivery',
    dealTag: 'PROMO',
    cuisine: ['Desi Ghee Parathas', 'Shami Kebabs', 'Frozen Packs'],
    coverPhoto: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    badge: 'Verified Home Cook',
    popularDish: 'Hand-Rolled Aloo Paratha (6-pack)',
    minOrder: 'Rs 300',
    href: '/kitchens/k-saima',
    isSubZero: true,
  },
  {
    id: 'k-naseem',
    name: "Naseem's Dum Pukht",
    chef: 'Chef Naseem Bano',
    area: 'DHA Phase 6',
    rating: 4.9,
    reviewsCount: 480,
    eta: '25-35 min',
    deliveryFee: 'Rs 80 delivery',
    distance: '1.8 km',
    isOpen: true,
    closesAt: '11:00 PM',
    deal: '20% OFF (Code: DUM20)',
    dealTag: 'HOT DEAL',
    cuisine: ['Sindhi Dum Biryani', 'Yakhni Pulao', 'Zarda'],
    coverPhoto: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&q=80&auto=format&fit=crop',
    badge: 'Master Biryani Chef',
    popularDish: 'Special Zafrani Dum Biryani',
    minOrder: 'Rs 500',
    href: '/kitchens/k-naseem',
    isSubZero: false,
  },
  {
    id: 'k-asma',
    name: "Phupo Asma's Heritage Pot",
    chef: 'Asma Begum',
    area: 'PECHS Block 2',
    rating: 4.95,
    reviewsCount: 310,
    eta: '30-40 min',
    deliveryFee: 'Rs 100 delivery',
    distance: '2.6 km',
    isOpen: true,
    closesAt: '10:30 PM',
    deal: 'Buy 1 Get 1 Naan',
    dealTag: 'SPECIAL',
    cuisine: ['Slow-Cooked Beef Nihari', 'Kunna Gosht', 'Nalli'],
    coverPhoto: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&q=80&auto=format&fit=crop',
    badge: '12h Slow-Cook Specialist',
    popularDish: 'Royal Shahi Beef Nihari',
    minOrder: 'Rs 600',
    href: '/kitchens/k-asma',
    isSubZero: false,
  },
  {
    id: 'k-fareeha',
    name: "Fareeha's Frozen Savories",
    chef: 'Fareeha Tariq',
    area: 'Clifton Block 5',
    rating: 4.75,
    reviewsCount: 190,
    eta: 'Sub-Zero Dispatch',
    deliveryFee: 'Free over Rs 1,000',
    distance: '3.1 km',
    isOpen: true,
    closesAt: '12:00 AM',
    deal: 'Free Chutney Pack',
    dealTag: 'SNACK BONUS',
    cuisine: ['Cocktail Samosas', 'Spring Rolls', 'Patties'],
    coverPhoto: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&q=80&auto=format&fit=crop',
    badge: 'Sub-Zero Cold Chain',
    popularDish: 'Chicken & Cheese Spring Rolls (12-pack)',
    minOrder: 'Rs 400',
    href: '/kitchens/k-fareeha',
    isSubZero: true,
  },
  {
    id: 'k-burns',
    name: 'Burns Road Heritage Kitchen',
    chef: 'Chef Usman Qureshi',
    area: 'Saddar Downtown',
    rating: 4.88,
    reviewsCount: 620,
    eta: '25-35 min',
    deliveryFee: 'Rs 70 delivery',
    distance: '3.8 km',
    isOpen: true,
    closesAt: '2:00 AM',
    deal: 'Free Raita with Platter',
    dealTag: 'MIDNIGHT SPECIAL',
    cuisine: ['Seekh Kebabs', 'Beef Bihari', 'Dhaga Kebab'],
    coverPhoto: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80&auto=format&fit=crop',
    badge: 'Old Karachi Master',
    popularDish: 'Smoked Melt-in-Mouth Bihari Boti',
    minOrder: 'Rs 450',
    href: '/kitchens/k-burns',
    isSubZero: false,
  },
  {
    id: 'k-dadi',
    name: "Dadi's Desi Kitchen",
    chef: 'Zubaida Begum',
    area: 'Federal B Area',
    rating: 4.92,
    reviewsCount: 380,
    eta: '30-40 min',
    deliveryFee: 'Free over Rs 600',
    distance: '4.2 km',
    isOpen: true,
    closesAt: '10:00 PM',
    deal: 'Complimentary Kheer',
    dealTag: 'TRADITIONAL',
    cuisine: ['Daal Chawal', 'Kadhi Pakora', 'Aloo Gosht'],
    coverPhoto: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&q=80&auto=format&fit=crop',
    badge: 'Pure Home Comfort',
    popularDish: 'Tarka Daal with Basmati Chawal',
    minOrder: 'Rs 350',
    href: '/kitchens/k-dadi',
    isSubZero: false,
  },
];

export default function KitchensDirectoryPage() {
  const { isAuthenticated, user } = useAuthStore();
  const { items: cartItems } = useCartStore();
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'rating' | 'eta' | 'reviews'>('rating');
  const [dbKitchens, setDbKitchens] = useState<Kitchen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    sellerService.getPublicSellers().then((sellers) => {
      if (cancelled) return;
      if (sellers && sellers.length > 0) {
        const mapped: Kitchen[] = sellers.map((s) => {
          const locParts = [s.chef.area, s.chef.city || s.community?.city].filter(Boolean);
          const area = locParts.length > 0 ? locParts.join(', ') : (s.community?.name || 'Local Community');

          let deliveryFee = 'Free over Rs 500';
          if (s.freeDeliveryThreshold != null && Number(s.freeDeliveryThreshold) > 0) {
            deliveryFee = `Free over Rs ${s.freeDeliveryThreshold}`;
          } else if (s.deliveryFeeFixed != null && Number(s.deliveryFeeFixed) > 0) {
            deliveryFee = `Rs ${s.deliveryFeeFixed} delivery`;
          } else if (s.community?.deliveryBaseFee) {
            deliveryFee = `Rs ${s.community.deliveryBaseFee} delivery`;
          }

          let minOrder = 'No min order';
          if (s.minOrderAmountForDelivery != null && Number(s.minOrderAmountForDelivery) > 0) {
            minOrder = `Rs ${s.minOrderAmountForDelivery}`;
          }

          const isOpen = s.availability ? s.availability.isOpen : true;
          let closesAt = '11:00 PM';
          if (s.availability?.closesAt) {
            closesAt = new Date(s.availability.closesAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          }

          return {
            id: s.id,
            name: s.businessName,
            chef: s.chef.name,
            area,
            rating: Number(s.ratingAverage) || 4.8,
            reviewsCount: s.totalReviews || 120,
            eta: `${s.minPrepTimeMinutes || 20}-${(s.minPrepTimeMinutes || 20) + 10} min`,
            deliveryFee,
            distance: '1.4 km',
            isOpen,
            closesAt,
            deal: s.products.some((p) => p.originalPrice && p.originalPrice > p.price) ? 'Special Discount' : undefined,
            dealTag: s.products.some((p) => p.originalPrice && p.originalPrice > p.price) ? 'PROMO' : undefined,
            cuisine: s.mealCategories && s.mealCategories.length > 0 ? s.mealCategories : ['Home Cooked Meals', 'Family Recipes'],
            coverPhoto: s.coverImageUrl || 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop',
            avatar: s.chef.avatar || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
            badge: s.businessType === 'home_kitchen' ? 'Certified Home Chef' : 'Verified Domestic Cook',
            popularDish: s.products[0]?.name || 'Specialty Home Meal',
            minOrder,
            href: `/kitchens/${s.id}`,
            isSubZero: s.products.some((p) => p.productType === 'frozen'),
          };
        });
        setDbKitchens(mapped);
      }
    }).catch((err) => {
      console.error('Failed to load kitchens directory:', err);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const kitchenSource = dbKitchens.length > 0 ? dbKitchens : ALL_KITCHENS;

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredKitchens = useMemo(() => {
    return kitchenSource.filter((k) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = k.name.toLowerCase().includes(q);
        const matchesChef = k.chef.toLowerCase().includes(q);
        const matchesArea = k.area.toLowerCase().includes(q);
        const matchesCuisine = k.cuisine.some((c) => c.toLowerCase().includes(q));
        if (!matchesName && !matchesChef && !matchesArea && !matchesCuisine) return false;
      }

      if (selectedFilter === 'top_rated' && k.rating < 4.85) return false;
      if (selectedFilter === 'fast' && !k.eta.includes('20')) return false;
      if (selectedFilter === 'free_delivery' && !k.deliveryFee.toLowerCase().includes('free')) return false;
      if (selectedFilter === 'frozen' && !k.isSubZero) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'reviews') return b.reviewsCount - a.reviewsCount;
      return a.eta.localeCompare(b.eta);
    });
  }, [kitchenSource, search, selectedFilter, sortBy]);

  const renderToolbar = () => (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by kitchen, chef, area, or cuisine..."
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-slate-50 hover:bg-slate-100 focus:bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:border-[#FF5500] focus:ring-2 focus:ring-orange-500/10 outline-none transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {[
          { id: 'all', label: 'All Kitchens', icon: ChefHat },
          { id: 'top_rated', label: 'Top Rated (4.85+)', icon: Star },
          { id: 'fast', label: 'Under 30 min', icon: Clock },
          { id: 'free_delivery', label: 'Free Delivery', icon: Bike },
          { id: 'frozen', label: '-18°C Sub-Zero', icon: Snowflake },
        ].map((chip) => {
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

        <div className="h-4 w-px bg-slate-200 mx-1 hidden lg:block" />

        <div className="hidden lg:flex items-center gap-1 text-xs text-slate-500">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
          >
            <option value="rating">Highest Rated</option>
            <option value="reviews">Most Reviewed</option>
            <option value="eta">Fastest Delivery</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderKitchensGrid = (isPublic: boolean) => (
    <div className={isPublic ? 'max-w-[1400px] mx-auto px-4 sm:px-6 py-8' : 'py-2'}>
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs font-semibold text-slate-500">
          Showing <span className="font-bold text-slate-900">{filteredKitchens.length}</span> certified kitchens
        </p>
        {selectedFilter !== 'all' && (
          <button
            onClick={() => setSelectedFilter('all')}
            className="text-xs font-semibold text-[#FF5500] hover:underline"
          >
            Reset Filters
          </button>
        )}
      </div>

      {filteredKitchens.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-12">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">No kitchens match your filter</h3>
          <p className="text-xs text-slate-500 mb-5">
            Try adjusting your search or clearing your active filters.
          </p>
          <button
            onClick={() => {
              setSearch('');
              setSelectedFilter('all');
            }}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-black transition-colors"
          >
            View All Kitchens
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {filteredKitchens.map((kitchen) => {
            const isFav = favorites.has(kitchen.id);
            return (
              <Link
                key={kitchen.id}
                href={kitchen.href}
                className="group flex flex-col justify-between bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden"
              >
                {/* Photo Container */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                  <img
                    src={kitchen.coverPhoto}
                    alt={kitchen.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

                  {/* Deal Ribbon */}
                  {kitchen.deal && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-white text-[10px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider">
                      {kitchen.deal}
                    </span>
                  )}

                  {/* Heart Favorite Button */}
                  <button
                    onClick={(e) => toggleFavorite(kitchen.id, e)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-slate-700 hover:scale-110 transition-transform shadow-xs"
                    aria-label="Save to favorites"
                  >
                    <Heart
                      className={`w-4 h-4 transition-colors ${
                        isFav ? 'fill-red-500 text-red-500' : 'text-slate-600 hover:text-red-500'
                      }`}
                    />
                  </button>

                  {/* ETA Pill */}
                  <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{kitchen.eta}</span>
                  </span>

                  {/* Verified Chef Badge */}
                  <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{kitchen.badge}</span>
                  </span>
                </div>

                {/* Body Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={kitchen.avatar}
                          alt={kitchen.chef}
                          className="w-9 h-9 rounded-xl object-cover border border-slate-200 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <h2 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] truncate transition-colors">
                            {kitchen.name}
                          </h2>
                          <p className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1">
                            <span>{kitchen.chef}</span>
                            <span>•</span>
                            <MapPin className="w-3 h-3 text-slate-400 inline flex-shrink-0" />
                            <span>{kitchen.area.split(',')[0]}</span>
                          </p>
                        </div>
                      </div>

                      {/* Rating pill */}
                      <span className="flex-shrink-0 bg-amber-50 text-amber-900 px-2 py-0.5 rounded-lg text-xs font-bold border border-amber-200/80 flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        <span>{kitchen.rating}</span>
                      </span>
                    </div>

                    {/* Delivery Line */}
                    <div className="mt-2 text-xs text-slate-600 font-medium flex items-center gap-2">
                      <span className="flex items-center gap-1 text-slate-700">
                        <Bike className="w-3.5 h-3.5 text-slate-400" />
                        {kitchen.deliveryFee}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span>{kitchen.distance}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] text-slate-400">Min {kitchen.minOrder}</span>
                    </div>
                  </div>

                  {/* Cuisines */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1">
                    {kitchen.cuisine.map((c) => (
                      <span
                        key={c}
                        className="px-2 py-0.5 rounded-md bg-slate-50 text-[10px] font-semibold text-slate-600 border border-slate-100"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );

  // Authenticated customer: Render inside the customer DashboardLayout shell
  if (isAuthenticated) {
    return (
      <DashboardLayout
        title="Verified Kitchens"
        subtitle="Discover certified domestic kitchens and home cooks in your neighborhood"
        sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
        userType="customer"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-1">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF5500] transition-colors py-1.5 px-3 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              <span>Browse All Dishes</span>
            </Link>
            <span className="text-xs font-medium text-slate-500">
              Showing {filteredKitchens.length} domestic kitchens
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Community Certified Kitchens</h2>
                <p className="text-xs text-slate-500">
                  Order directly from independent domestic chefs or batch prep kitchens
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                  <ChefHat className="w-3.5 h-3.5 text-[#FF5500]" />
                  {kitchenSource.length} Verified Kitchens
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-50 border border-cyan-200 text-xs font-semibold text-cyan-800">
                  <Snowflake className="w-3.5 h-3.5 text-cyan-600" />
                  -18°C Sub-Zero Fleet
                </span>
              </div>
            </div>
            {renderToolbar()}
          </div>

          {renderKitchensGrid(false)}
        </div>
      </DashboardLayout>
    );
  }

  // Public visitor: Render with top marketplace header
  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 pb-24">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <BrandLockup markSize={30} wordSize={20} />
            </Link>
            <div className="hidden sm:block">
              <CommunitySelector variant="navbar" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/products"
              className="text-xs font-semibold text-slate-700 hover:text-[#FF5500] transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
            >
              Browse All Dishes
            </Link>
            <Link
              href="/cart"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold transition-colors"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Tray</span>
              {cartItems.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#FF5500] text-white flex items-center justify-center text-[10px] font-bold">
                  {cartItems.length}
                </span>
              )}
            </Link>
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-700 hover:text-[#FF5500] px-2 py-1.5"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-3.5 py-1.5 rounded-xl bg-[#FF5500] hover:bg-[#e04400] text-white text-xs font-bold transition-colors shadow-2xs"
            >
              Join
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <section className="bg-white border-b border-slate-200/80 py-8">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-[#FF5500] text-xs font-bold uppercase tracking-wider mb-2.5">
                <ChefHat className="w-3.5 h-3.5" />
                <span>Karachi Multi-Vendor Home Kitchens</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Verified Domestic Kitchens
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-2xl leading-relaxed">
                Discover independent home cooks crafting small-batch recipes, freshly cooked and delivered via express or -18°C cold-chain fleet.
              </p>
            </div>

            {/* Quick Metrics Pills */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-left">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Certified Kitchens</div>
                <div className="text-sm font-bold text-slate-900">{kitchenSource.length} Domestic Cooks</div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-left">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Cold-Chain</div>
                <div className="text-sm font-bold text-cyan-700">-18°C Insulated</div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-left">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Average Rating</div>
                <div className="text-sm font-bold text-amber-700 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  <span>4.87 / 5.0</span>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            {renderToolbar()}
          </div>
        </div>
      </section>

      {/* Kitchens Grid */}
      <main>
        {renderKitchensGrid(true)}
      </main>
    </div>
  );
}

