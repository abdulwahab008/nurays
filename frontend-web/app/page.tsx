'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  Gift,
  Sparkles,
  ChefHat,
  Heart,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  User,
  LogOut,
  Package,
  LayoutDashboard,
  UtensilsCrossed,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useToast } from '@/components/ui/toast';
import { BrandLockup } from '@/components/ui/Mark';
import { formatPrice } from '@/lib/utils';
import { SlideOverCartDrawer } from '@/components/marketplace/SlideOverCartDrawer';
import { UberLeftSidebar } from '@/components/marketplace/UberLeftSidebar';
import { CuisineCarousel } from '@/components/marketplace/CuisineCarousel';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import { sellerService } from '@/lib/services/seller.service';
import { productService } from '@/lib/services/product.service';
import { cartService } from '@/lib/services/cart.service';
import { apiClient } from '@/lib/api-client';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

// ============================================================
// MULTI-VENDOR PLATFORM DATA (Verified Karachi Home Kitchens)
// ============================================================

const HOME_KITCHENS = [
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
    deal: '20% OFF (DUM20)',
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
    deal: 'Cold Chain Delivery',
    dealTag: 'FROZEN',
    cuisine: ['Cocktail Samosas', 'Spring Rolls', 'Patties'],
    coverPhoto: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&q=80&auto=format&fit=crop',
    badge: 'Frozen Pantry',
    popularDish: 'Cocktail Keema Samosas (Dozen)',
    minOrder: 'Rs 400',
    href: '/kitchens/k-fareeha',
    isSubZero: true,
  },
  {
    id: 'k-burnsroad',
    name: "Burns Road Kitchenette",
    chef: 'Ustad Tariq & Family',
    area: 'Saddar Heritage',
    rating: 4.85,
    reviewsCount: 340,
    eta: '25-35 min',
    deliveryFee: 'Rs 90 delivery',
    distance: '3.8 km',
    isOpen: true,
    closesAt: '1:00 AM',
    deal: 'Free Chutney & Salad',
    dealTag: 'BBQ NIGHT',
    cuisine: ['Charcoal Seekh Kebabs', 'Chapli Kebabs', 'Puri Paratha'],
    coverPhoto: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80&auto=format&fit=crop',
    badge: 'Charcoal Master',
    popularDish: 'Melt-in-Mouth Seekh Kebabs',
    minOrder: 'Rs 450',
    href: '/kitchens/k-burnsroad',
    isSubZero: false,
  },
  {
    id: 'k-dadi',
    name: "Dadi's Traditional Sweets",
    chef: 'Dadi Bilqees',
    area: 'Bahadurabad',
    rating: 4.92,
    reviewsCount: 160,
    eta: '20-25 min',
    deliveryFee: 'Free over Rs 600',
    distance: '2.1 km',
    isOpen: true,
    closesAt: '10:00 PM',
    deal: 'Clay Matka Included',
    dealTag: 'SWEET TOOTH',
    cuisine: ['Saffron Matka Kheer', 'Shahi Tukray', 'Gajar Halwa'],
    coverPhoto: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=150&q=80&auto=format&fit=crop',
    badge: 'Artisanal Confectioner',
    popularDish: 'Saffron & Cardamom Matka Kheer',
    minOrder: 'Rs 350',
    href: '/kitchens/k-dadi',
    isSubZero: false,
  },
];

const DISH_ITEMS = [
  {
    id: 'b90ea763-3282-47de-9f1f-3db06d8b92a4',
    name: 'Special Zafrani Dum Biryani',
    kitchenName: "Naseem's Dum Pukht",
    kitchenId: '3dff122d-24ab-4869-8b66-11d346fc4a48',
    kitchenArea: 'DHA Phase 6',
    price: 850,
    originalPrice: 1000,
    rating: 4.9,
    eta: '25-35 min',
    isFrozen: false,
    badge: 'Hot Express',
    photo: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800&q=80&auto=format&fit=crop',
  },
  {
    id: '5279aabe-f81c-476b-bc5a-03a8b1edd629',
    name: 'Crispy Layered Aloo Paratha (6-Pack)',
    kitchenName: "Saima's Craft Kitchen",
    kitchenId: '849fc424-f1e3-4ff4-ad99-13bb78dd1e42',
    kitchenArea: 'Gulshan Block 4',
    price: 480,
    originalPrice: 600,
    rating: 4.8,
    eta: 'Frozen Dispatch',
    isFrozen: true,
    badge: 'Frozen Pack',
    photo: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=800&q=80&auto=format&fit=crop',
  },
  {
    id: '7c34954b-aceb-44f8-8e4b-3e924598fd8e',
    name: 'Royal Shahi Beef Nihari (12h Braise)',
    kitchenName: "Phupo Asma's Heritage Pot",
    kitchenId: '581383cf-7996-4cf7-b855-125452ef09a5',
    kitchenArea: 'PECHS Block 2',
    price: 1100,
    originalPrice: 1350,
    rating: 4.95,
    eta: '30-40 min',
    isFrozen: false,
    badge: 'Slow Cooked',
    photo: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80&auto=format&fit=crop',
  },
  {
    id: '68e77e09-f95d-49a0-900d-f081f49b16e9',
    name: 'Cocktail Keema Samosas (Dozen)',
    kitchenName: "Fareeha's Frozen Savories",
    kitchenId: 'c6b6f14a-7518-42bc-8004-331891e33101',
    kitchenArea: 'Clifton Block 5',
    price: 620,
    originalPrice: 750,
    rating: 4.75,
    eta: 'Frozen Dispatch',
    isFrozen: true,
    badge: 'Frozen Pack',
    photo: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80&auto=format&fit=crop',
  },
  {
    id: '89d451b5-224b-47cb-b22e-499035c2af4d',
    name: 'Melt-in-Mouth Seekh Kebabs (4 Skewers)',
    kitchenName: "Abdul's Charcoal Kitchen",
    kitchenId: '92ae05c9-0eb6-476f-8f62-7851e2064076',
    kitchenArea: 'Saddar',
    price: 620,
    originalPrice: 750,
    rating: 4.85,
    eta: '25-35 min',
    isFrozen: false,
    badge: 'Charcoal Smoked',
    photo: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80&auto=format&fit=crop',
  },
  {
    id: '7484393e-7cc0-4606-a909-2b69b7772a0c',
    name: 'Saffron & Cardamom Matka Kheer',
    kitchenName: "Tahira's Clay Pot Meetha",
    kitchenId: '4e84c8f1-494b-496f-a2d5-f89ca74e84c4',
    kitchenArea: 'Bahadurabad',
    price: 350,
    originalPrice: 420,
    rating: 4.92,
    eta: 'Chilled Express',
    isFrozen: false,
    badge: 'Artisanal Sweet',
    photo: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=800&q=80&auto=format&fit=crop',
  },
];

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { items: cartItems, addItem, getItemCount } = useCartStore();
  const { showToast } = useToast();

  const [orderMode, setOrderMode] = useState<'delivery' | 'pickup' | 'coldchain'>('delivery');
  const [selectedLocation, setSelectedLocation] = useState('Gulshan-e-Iqbal, Karachi');
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'top_rated' | 'fast' | 'free_delivery' | 'deals' | 'frozen'>('all');
  const [selectedCuisine, setSelectedCuisine] = useState<string>('');
  const [favoriteKitchenIds, setFavoriteKitchenIds] = useState<Set<string>>(new Set());

  const [dbKitchens, setDbKitchens] = useState<typeof HOME_KITCHENS>([]);
  const [dbDishes, setDbDishes] = useState<typeof DISH_ITEMS>([]);
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

  useEffect(() => {
    let cancelled = false;

    // Load active verified sellers from database
    sellerService
      .getPublicSellers({ limit: 12 })
      .then((sellers) => {
        if (cancelled) return;
        if (sellers && sellers.length > 0) {
          const mapped = sellers.map((s) => ({
            id: s.id,
            name: s.businessName,
            chef: s.chef.name,
            area: s.chef.area
              ? `${s.chef.area}, ${s.community?.city || ''}`
              : s.community?.name || 'Karachi',
            rating: Number(s.ratingAverage) || 4.8,
            reviewsCount: s.totalReviews || 120,
            eta: `${s.minPrepTimeMinutes || 20}-${(s.minPrepTimeMinutes || 20) + 10} min`,
            deliveryFee: s.community ? `Rs ${s.community.deliveryBaseFee} delivery` : 'Free over Rs 500',
            distance: '1.4 km',
            isOpen: true,
            closesAt: '11:00 PM',
            deal: s.products.some((p) => p.originalPrice && p.originalPrice > p.price)
              ? 'Special Discount'
              : 'Free Delivery',
            dealTag: s.products.some((p) => p.originalPrice && p.originalPrice > p.price)
              ? 'PROMO'
              : 'TOP RATED',
            cuisine:
              s.mealCategories && s.mealCategories.length > 0
                ? s.mealCategories
                : ['Home Cooked Meals', 'Family Recipes'],
            coverPhoto:
              s.coverImageUrl ||
              'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop',
            avatar:
              s.chef.avatar ||
              'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
            badge: s.businessType || 'Verified Home Cook',
            popularDish: s.products[0]?.name || 'Specialty Home Meal',
            minOrder: 'Rs 350',
            href: `/kitchens/${s.id}`,
            isSubZero: s.products.some((p) => p.productType === 'frozen'),
          }));
          setDbKitchens(mapped);
        }
      })
      .catch((err) => {
        console.error('Failed to load landing kitchens:', err);
      });

    // Load active approved products from database
    productService
      .getProducts({ limit: 12 })
      .then((prodData) => {
        if (cancelled) return;
        const prods = prodData?.data?.products;
        if (prods && prods.length > 0) {
          const mappedDishes = prods.slice(0, 8).map((p) => ({
            id: p.id,
            name: p.name,
            kitchenName: p.seller.businessName,
            kitchenId: p.seller.id,
            kitchenArea: p.community?.name || 'Karachi',
            price: Number(p.price),
            originalPrice: p.originalPrice ? Number(p.originalPrice) : Math.round(Number(p.price) * 1.2),
            rating: Number(p.ratingAverage) || 4.8,
            eta:
              p.productType === 'frozen'
                ? 'Frozen Dispatch'
                : `${p.estimatedDeliveryMinMinutes || 25}-${p.estimatedDeliveryMaxMinutes || 35} min`,
            isFrozen: p.productType === 'frozen',
            badge: p.productType === 'frozen' ? 'Frozen Pack' : 'Hot Express',
            photo:
              p.primaryImage ||
              'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop',
          }));
          setDbDishes(mappedDishes);
        }
      })
      .catch((err) => {
        console.error('Failed to load landing dishes:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const kitchenSource = dbKitchens.length > 0 ? dbKitchens : HOME_KITCHENS;
  const dishSource = dbDishes.length > 0 ? dbDishes : DISH_ITEMS;

  useEffect(() => {
    if (isAuthenticated && user) {
      const userType = user.userType || user.user_type;
      if (userType === 'admin') router.push('/admin/dashboard');
      else if (userType === 'seller') router.push('/sellers/dashboard');
      else if (userType === 'rider') router.push('/riders/dashboard');
    }
  }, [isAuthenticated, user, router]);

  const toggleFavorite = (kitchenId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavoriteKitchenIds((prev) => {
      const next = new Set(prev);
      if (next.has(kitchenId)) {
        next.delete(kitchenId);
        showToast('Removed from saved kitchens', 'info');
      } else {
        next.add(kitchenId);
        showToast('Saved to your favorite kitchens', 'success');
      }
      return next;
    });
  };

  const handleAddDishToCart = async (dish: typeof DISH_ITEMS[0], e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    addItem({
      id: `${dish.id}-${Date.now()}`,
      productId: dish.id,
      productName: dish.name,
      productImage: dish.photo,
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
    showToast(`Added ${dish.name} to tray!`, 'success');
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
        productImage: dish.photo,
        sellerId: dish.kitchenId || dish.sellerId,
        sellerName: dish.kitchenName,
        quantity: 1,
        unitPrice: dish.price,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        subtotal: dish.price,
      });
      showToast(`Tray updated with dishes from ${dish.kitchenName}!`, 'success');
      setConflictModal({ isOpen: false, existingKitchenName: '', dish: null });
    } catch {
      showToast('Failed to replace cart items', 'error');
    } finally {
      setSwitchingKitchen(false);
    }
  };

  const filteredKitchens = kitchenSource.filter((k) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches =
        k.name.toLowerCase().includes(q) ||
        k.chef.toLowerCase().includes(q) ||
        k.area.toLowerCase().includes(q) ||
        k.cuisine.some((c) => c.toLowerCase().includes(q));
      if (!matches) return false;
    }
    if (selectedCuisine) {
      const matchesCuisine = k.cuisine.some((c) => c.toLowerCase().includes(selectedCuisine.toLowerCase()));
      if (!matchesCuisine) return false;
    }
    if (selectedFilter === 'top_rated') return k.rating >= 4.85;
    if (selectedFilter === 'fast') return k.eta.includes('20');
    if (selectedFilter === 'free_delivery') return k.deliveryFee.toLowerCase().includes('free');
    if (selectedFilter === 'deals') return !!k.deal;
    if (selectedFilter === 'frozen') return k.cuisine.some((c) => c.toLowerCase().includes('frozen'));
    return true;
  });

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
        onSelectFilter={(f) => setSelectedFilter(f as any)}
      />

      {/* Top Notification / Fleet Status Bar */}
      <div className="bg-[#0C1016] text-white px-4 py-1.5 text-xs font-medium border-b border-white/5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold uppercase text-[10px] tracking-wider">PLATFORM LIVE</span>
            <span className="text-slate-300 hidden sm:inline text-xs">
              180+ Certified Karachi Home Kitchens Active • Insulated Fleet Ready
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-300">
            <Link href="/sellers/register" className="text-[#FF5500] hover:text-[#ff7333] font-semibold flex items-center gap-1">
              <ChefHat className="w-3 h-3" />
              <span>Open a Home Kitchen</span>
            </Link>
            <Link href="/riders/dashboard" className="hidden md:inline hover:text-white text-slate-400">
              Cold-Chain Rider Portal
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
              aria-label="Open navigation menu"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <Link href="/" className="hover:opacity-95 transition-opacity">
              <BrandLockup markSize={32} wordSize={22} />
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
              <span>Fresh Delivery</span>
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
              <span>Pickup</span>
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
              <span>Frozen Hub</span>
            </button>
          </div>

          {/* Delivery Location Selector */}
          <div className="relative hidden md:block flex-shrink-0">
            <CommunitySelector variant="navbar" />
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md relative hidden sm:block">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search biryani, shami kebabs, parathas, or home chef..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-slate-50 hover:bg-slate-100 focus:bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:border-[#FF5500] focus:ring-2 focus:ring-orange-500/10 transition-all outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 text-xs text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Right Action Buttons: Cart Drawer Trigger & Auth */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Slide-over Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative flex items-center gap-1.5 h-10 px-3 sm:px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-900 border border-slate-200 text-xs font-bold transition-colors"
              aria-label="Open food tray"
            >
              <ShoppingBag className="w-4 h-4 text-slate-700" />
              <span className="hidden md:inline">Tray</span>
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
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50">
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{user.profile?.fullName || 'Customer'}</p>
                      <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                    </div>
                    <Link
                      href="/orders"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <Package className="w-3.5 h-3.5 text-slate-500" />
                      <span>My Orders</span>
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-slate-500" />
                      <span>Customer Dashboard</span>
                    </Link>
                    <Link
                      href="/profile/addresses"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>Saved Addresses</span>
                    </Link>
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors mt-1 border-t border-slate-100"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/login"
                  className="h-10 inline-flex items-center px-3 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="h-10 inline-flex items-center px-3.5 rounded-xl text-xs font-bold bg-[#FF5500] hover:bg-[#E04400] text-white shadow-2xs transition-colors"
                >
                  Join
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
            {[
              { id: 'all', label: 'All Kitchens', icon: ChefHat },
              { id: 'top_rated', label: 'Top Rated (4.85+)', icon: Star },
              { id: 'fast', label: 'Under 30 min', icon: Clock },
              { id: 'free_delivery', label: 'Free Delivery', icon: Bike },
              { id: 'deals', label: 'Special Deals', icon: Tag },
              { id: 'frozen', label: 'Frozen', icon: Snowflake },
            ].map((chip) => {
              const Icon = chip.icon;
              const isActive = selectedFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => setSelectedFilter(chip.id as any)}
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
            <span>Browse 180+ Menus</span>
            <ChevronRight className="w-3.5 h-3.5" />
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
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/25 text-[10px] font-bold uppercase tracking-wider mb-2">
                <Flame className="w-3 h-3 text-orange-200" />
                <span>Authentic Home Food</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
                Crave it? Get it fresh.
              </h2>
              <p className="text-xs text-orange-100 mt-1 max-w-[260px] font-normal leading-relaxed">
                Handmade family recipes from verified Karachi cooks delivered directly.
              </p>
            </div>
            <div className="relative z-10 pt-3">
              <Link
                href="/products"
                className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <span>Find Kitchens</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Banner 2: Free Delivery Promo */}
          <div className="relative rounded-2xl p-5 sm:p-6 overflow-hidden bg-gradient-to-br from-[#B45309] via-[#92400E] to-[#78350F] text-white shadow-md flex flex-col justify-between min-h-[155px] group">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/30 text-[10px] font-bold uppercase tracking-wider mb-2">
                <Gift className="w-3 h-3 text-amber-200" />
                <span>First 3 Orders</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
                Rs 0 Delivery Fee
              </h2>
              <p className="text-xs text-amber-100 mt-1 max-w-[260px] font-normal leading-relaxed">
                Complimentary dispatch on all home kitchen orders over Rs 500.
              </p>
            </div>
            <div className="relative z-10 pt-3">
              <Link
                href="/products?delivery=free"
                className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <span>Claim Free Delivery</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Banner 3: Sub-Zero Cold Chain */}
          <div className="relative rounded-2xl p-5 sm:p-6 overflow-hidden bg-gradient-to-br from-[#0284C7] via-[#0369A1] to-[#075985] text-white shadow-md flex flex-col justify-between min-h-[155px] group">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/30 text-[10px] font-bold uppercase tracking-wider mb-2">
                <Snowflake className="w-3 h-3 text-cyan-200" />
                <span>Sub-Zero Guarantee</span>
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
                Artisanal Frozen Pantry
              </h2>
              <p className="text-xs text-cyan-100 mt-1 max-w-[260px] font-normal leading-relaxed">
                Hand-rolled parathas &amp; shami kebabs delivered in refrigerated fleet.
              </p>
            </div>
            <div className="relative z-10 pt-3">
              <Link
                href="/products?productType=frozen"
                className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
              >
                <span>Stock My Freezer</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          "STORES & KITCHENS NEAR YOU" (Refined Avatar Row)
          ============================================================ */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Stores &amp; Kitchens Near You
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Verified domestic kitchens operating in your immediate radius
            </p>
          </div>
          <Link
            href="/kitchens"
            className="text-xs font-bold text-[#FF5500] hover:underline flex items-center gap-1"
          >
            <span>See all</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Compact Avatar Row */}
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none py-1 px-0.5">
          {kitchenSource.map((k) => (
            <Link
              key={k.id}
              href={k.href}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 group text-center"
            >
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border border-slate-200 group-hover:border-[#FF5500] transition-all shadow-2xs">
                <img
                  src={k.avatar}
                  alt={k.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 border border-white" title="Open now" />
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-900 group-hover:text-[#FF5500] max-w-[85px] sm:max-w-[95px] truncate">
                  {k.name}
                </span>
                <span className="block text-[10px] text-slate-500 font-medium">
                  {k.eta}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============================================================
          "FEATURED ON NURAY FOOD" (High-Density Cards)
          ============================================================ */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FF5500] mb-0.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Featured Home Kitchens</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Featured on Nuray Food
            </h2>
          </div>
          <Link
            href="/kitchens"
            className="text-xs font-bold text-[#FF5500] hover:underline flex items-center gap-1"
          >
            <span>View all ({filteredKitchens.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
          {filteredKitchens.map((kitchen) => {
            const isFav = favoriteKitchenIds.has(kitchen.id);
            return (
              <Link
                key={kitchen.id}
                href={kitchen.href}
                className="group flex flex-col justify-between bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden"
              >
                {/* Cover Image */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                  <img
                    src={kitchen.coverPhoto}
                    alt={kitchen.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

                  {/* Promo Tag */}
                  {kitchen.deal && (
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-white text-[10px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider">
                      {kitchen.deal}
                    </span>
                  )}

                  {/* Heart Button */}
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

                  {/* Delivery ETA Pill */}
                  <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{kitchen.eta}</span>
                  </span>

                  {/* Verified Cook Badge */}
                  <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{kitchen.badge}</span>
                  </span>
                </div>

                {/* Card Body */}
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
                          <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] truncate transition-colors">
                            {kitchen.name}
                          </h3>
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

                    {/* Delivery Fee line */}
                    <div className="mt-2 text-xs text-slate-600 font-medium flex items-center gap-2">
                      <span className="flex items-center gap-1 text-slate-700">
                        <Bike className="w-3.5 h-3.5 text-slate-400" />
                        <span>{kitchen.deliveryFee}</span>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span>{kitchen.distance}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] text-slate-400">Min {kitchen.minOrder}</span>
                    </div>
                  </div>

                  {/* Specialty Tags */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1">
                    {kitchen.cuisine.map((c) => (
                      <span key={c} className="px-2 py-0.5 rounded-md bg-slate-50 text-[10px] font-semibold text-slate-600 border border-slate-100">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ============================================================
          "TODAY'S MOST-ORDERED HOMEMADE DISHES" (Compact Grid)
          ============================================================ */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FF5500] mb-0.5">
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>Today&apos;s Best Dishes</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Most-Ordered Homemade Dishes
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Click &apos;+&apos; to add directly to your food tray
            </p>
          </div>
          <Link
            href="/products"
            className="text-xs font-bold text-[#FF5500] hover:underline flex items-center gap-1"
          >
            <span>Explore all dishes</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Dishes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
          {dishSource.map((dish) => (
            <div
              key={dish.id}
              className="group bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
            >
              {/* Dish Photo */}
              <div className="relative aspect-square overflow-hidden bg-slate-100">
                <img
                  src={dish.photo}
                  alt={dish.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Cold Chain or Fresh Tag */}
                <span
                  className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-white text-[9px] font-bold flex items-center gap-0.5 ${
                    dish.isFrozen ? 'bg-cyan-600' : 'bg-[#FF5500]'
                  }`}
                >
                  {dish.isFrozen ? (
                    <>
                      <Snowflake className="w-2.5 h-2.5" />
                      <span>Frozen</span>
                    </>
                  ) : (
                    <>
                      <Flame className="w-2.5 h-2.5" />
                      <span>Fresh</span>
                    </>
                  )}
                </span>

                {/* Direct Add to Cart Button */}
                <button
                  onClick={(e) => handleAddDishToCart(dish, e)}
                  className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-[#FF5500] hover:bg-[#e04400] text-white shadow-md flex items-center justify-center font-bold text-sm transition-transform active:scale-95"
                  title="Add to food tray"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Dish Info */}
              <div className="p-3 flex-1 flex flex-col justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 truncate flex items-center gap-1">
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
                    <span className="text-[10px] text-slate-400 line-through">
                      {formatPrice(dish.originalPrice)}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-amber-200/60">
                    <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                    <span>{dish.rating}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ============================================================
          PLATFORM STATS & CREDIBILITY BAR
          ============================================================ */}
      <section className="bg-slate-900 text-white py-12 border-t border-slate-800">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 text-center">
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Authentic homemade food, standard-compliant.
          </h3>
          <p className="text-slate-400 text-xs sm:text-sm mt-1.5 max-w-xl mx-auto font-normal">
            Connecting verified domestic culinary masters across Karachi with customers seeking real home cooking.
          </p>

          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <ChefHat className="w-5 h-5 text-orange-400 mx-auto" />
              <div className="text-xl font-bold text-white mt-2">180+</div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Verified Cooks</div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <MapPin className="w-5 h-5 text-emerald-400 mx-auto" />
              <div className="text-xl font-bold text-white mt-2">15+</div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Karachi Sectors</div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <Snowflake className="w-5 h-5 text-cyan-400 mx-auto" />
              <div className="text-xl font-bold text-[#00E5FF] mt-2">-18°C</div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Sub-Zero Fleet</div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              <Star className="w-5 h-5 text-amber-400 mx-auto" />
              <div className="text-xl font-bold text-amber-400 mt-2">4.87 / 5</div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Average Rating</div>
            </div>
          </div>
        </div>
      </section>

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
                Karachi&apos;s Domestic Food &amp; Cold-Chain Platform
              </span>
            </div>

            <div className="flex items-center gap-5 text-xs font-medium text-slate-600">
              <Link href="/kitchens" className="hover:text-[#FF5500]">All Kitchens</Link>
              <Link href="/products" className="hover:text-[#FF5500]">Dishes &amp; Packs</Link>
              <Link href="/products?productType=frozen" className="hover:text-[#FF5500]">Frozen Pantry</Link>
              <Link href="/sellers/register" className="hover:text-[#FF5500]">Open Kitchen</Link>
              <Link href="/riders/dashboard" className="hover:text-[#FF5500]">Rider Portal</Link>
              <Link href="/support" className="hover:text-[#FF5500]">Help</Link>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 font-normal gap-2">
            <p>© {new Date().getFullYear()} Nuray Food &amp; Frost Ltd. All rights reserved.</p>
            <p>Sindh Food Authority Compliant • Karachi, Pakistan</p>
          </div>
        </div>
      </footer>

      {/* Styled Modern Modal for Single Kitchen Batch Switching */}
      <ConfirmModal
        isOpen={conflictModal.isOpen}
        title="Start Order from This Kitchen?"
        message={`Your tray currently contains dishes from ${conflictModal.existingKitchenName}. Nuray ensures single-kitchen direct artisanal batches for guaranteed freshness. Would you like to clear your existing tray and start a new order with ${conflictModal.dish?.kitchenName}?`}
        confirmText="Clear Tray & Add Dish"
        cancelText="Keep Existing Tray"
        variant="warning"
        loading={switchingKitchen}
        onConfirm={handleConfirmSwitchKitchen}
        onCancel={() => setConflictModal({ isOpen: false, existingKitchenName: '', dish: null })}
      />
    </div>
  );
}
