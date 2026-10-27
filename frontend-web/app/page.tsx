'use client';

/**
 * The home page: kitchens and dishes from the live API, filters, and adding a dish to the tray. Its parts are in
 * components/home/; what it reads is in useHomeFeed, and the card data and filters in lib/home-feed.ts and
 * lib/home-filters.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SlideOverCartDrawer } from '@/components/marketplace/SlideOverCartDrawer';
import { UberLeftSidebar } from '@/components/marketplace/UberLeftSidebar';
import { cartService } from '@/lib/services/cart.service';
import { favoriteService } from '@/lib/services/favorite.service';
import { apiClient } from '@/lib/api-client';
import { useLocale, useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { toHomeDish, toHomeKitchen } from '@/lib/home-feed';
import { filterKitchens, isKitchenFilter, type HomeDish, type KitchenFilter } from '@/lib/home-filters';
import { SiteHeader } from '@/components/layout/SiteHeader';
import HomeHero from '@/components/home/HomeHero';
import FilterBar from '@/components/home/FilterBar';
import PromoBanners from '@/components/home/PromoBanners';
import { KitchenAvatarRow, KitchenGrid, TrendingKitchens } from '@/components/home/KitchenSections';
import { PersonalDishes, PopularDishes } from '@/components/home/DishSections';
import StatsBand from '@/components/home/StatsBand';
import HomeFooter from '@/components/home/HomeFooter';
import { useHomeFeed } from '@/components/home/useHomeFeed';

interface CartErrorBody {
  error?: { code?: string; details?: { existingSeller?: { name?: string } } };
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const addItem = useCartStore((s) => s.addItem);
  const { showToast } = useToast();
  const t = useT(homeMessages);
  const { locale } = useLocale();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<KitchenFilter>('all');
  const [selectedCuisine, setSelectedCuisine] = useState<string>('');

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

  const {
    sellers,
    kitchensState,
    retryKitchens,
    products,
    dishesState,
    retryDishes,
    trendingSellers,
    recommended,
    orderAgain,
    stats,
    favoriteKitchenIds,
    setFavoriteKitchenIds,
  } = useHomeFeed(isAuthenticated);

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
    [recommended, t],
  );
  const orderAgainDishes = useMemo(() => orderAgain.map((p) => toHomeDish(p, t)), [orderAgain, t]);
  const filteredKitchens = filterKitchens(kitchens, searchQuery, selectedCuisine, selectedFilter);

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

  return (
    <div className="min-h-screen bg-page text-ink">
      <SlideOverCartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <UberLeftSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeFilter={selectedFilter}
        onSelectFilter={(f) => {
          if (isKitchenFilter(f)) setSelectedFilter(f);
        }}
      />

      <SiteHeader
        search={{ query: searchQuery, onChange: setSearchQuery }}
        onOpenNav={() => setIsSidebarOpen(true)}
        onOpenTray={() => setIsCartOpen(true)}
        onFrozen={() => setSelectedFilter('frozen')}
      />
      <HomeHero dishes={dishes} />
      <FilterBar
        selectedCuisine={selectedCuisine}
        onSelectCuisine={setSelectedCuisine}
        selectedFilter={selectedFilter}
        onSelectFilter={setSelectedFilter}
      />
      <PromoBanners />
      <TrendingKitchens kitchens={trendingKitchens} />
      <KitchenAvatarRow kitchens={kitchens} state={kitchensState} />
      <KitchenGrid
        kitchens={kitchens}
        filteredKitchens={filteredKitchens}
        state={kitchensState}
        onRetry={retryKitchens}
        onClearFilters={clearFilters}
        isAuthenticated={isAuthenticated}
        favoriteKitchenIds={favoriteKitchenIds}
        onToggleFavorite={toggleFavorite}
      />
      <PersonalDishes orderAgainDishes={orderAgainDishes} recommendedDishes={recommendedDishes} onAdd={handleAddDishToCart} />
      <PopularDishes dishes={dishes} state={dishesState} onRetry={retryDishes} onAdd={handleAddDishToCart} />
      <StatsBand stats={stats} />
      <HomeFooter />

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
