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
import { useAuthStore, hasSession } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { SlideOverCartDrawer } from '@/components/marketplace/SlideOverCartDrawer';
import { UberLeftSidebar } from '@/components/marketplace/UberLeftSidebar';
import { cartService } from '@/lib/services/cart.service';
import { favoriteService } from '@/lib/services/favorite.service';
import { errorMessage } from '@/lib/api-client';
import { useLocale, useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { browseMessages } from '@/lib/i18n/messages/browse';
import { toHomeDish, toHomeKitchen } from '@/lib/home-feed';
import { filterKitchens, isKitchenFilter, type HomeDish, type KitchenFilter } from '@/lib/home-filters';
import { SiteHeader } from '@/components/layout/SiteHeader';
import HomeHero from '@/components/home/HomeHero';
import FilterBar from '@/components/home/FilterBar';
import PromoBanners from '@/components/home/PromoBanners';
import { KitchenGrid, TrendingKitchens } from '@/components/home/KitchenSections';
import { OrderAgainDishes, PopularDishes, RecommendedDishes } from '@/components/home/DishSections';
import StatsBand from '@/components/home/StatsBand';
import HomeFooter from '@/components/home/HomeFooter';
import { useHomeFeed } from '@/components/home/useHomeFeed';
import { useCommunityStore } from '@/lib/store/community-store';
import { quoteOf, type QuotedSeller } from '@/components/marketplace/delivery-quote';
import { formatPrice } from '@/lib/utils';
import { getStackedDiscountedPrice, type CatalogPromotionLike } from '@/lib/pricing';
import type { HomeT } from '@/lib/home-feed';

/** The kitchen's delivery fee and time to the chosen area, when the API quoted them. */
function quoteLabel(s: QuotedSeller, t: HomeT): string | null {
  const q = quoteOf(s.delivery);
  if (!q) return null;
  if (q.min == null || q.max == null) return q.fee === 0 ? t('freeDelivery') : t('deliveryFixed', { fee: formatPrice(q.fee) });
  return q.fee === 0 ? t('freeDeliveryQuote', { min: q.min, max: q.max }) : t('deliveryQuote', { fee: formatPrice(q.fee), min: q.min, max: q.max });
}

/** A dish at its kitchen's deal price, the menu price struck through, as the storefront and tray show it. */
function withDeal(dish: HomeDish, promos: CatalogPromotionLike[] | undefined): HomeDish {
  const price = getStackedDiscountedPrice(dish.price, promos);
  return price < dish.price ? { ...dish, price, originalPrice: dish.price } : dish;
}

/** Kitchens shown on the home page before "View all". */
const HOME_KITCHEN_LIMIT = 6;
/** Popular dishes shown on the home page before "View all": one row on a desktop. */
const HOME_DISH_LIMIT = 6;

interface CartErrorBody {
  error?: { code?: string; details?: { existingSeller?: { name?: string } } };
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const addItem = useCartStore((s) => s.addItem);
  const { showToast } = useToast();
  const t = useT(homeMessages);
  const tb = useT(browseMessages);
  const { locale } = useLocale();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
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
  const { selectedCommunity, openSelectorModal } = useCommunityStore(
    useShallow((s) => ({ selectedCommunity: s.selectedCommunity, openSelectorModal: s.openSelectorModal })),
  );

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
    promotions,
  } = useHomeFeed(isAuthenticated, selectedCommunity?.id ?? null);

  useEffect(() => {
    if (isAuthenticated && user) {
      const userType = user.userType || user.user_type;
      if (userType === 'admin') router.replace('/admin/dashboard');
      else if (userType === 'seller') router.replace('/sellers/dashboard');
      else if (userType === 'rider') router.replace('/riders/dashboard');
    }
  }, [isAuthenticated, user, router]);

  // Mapped at render so the labels follow the chosen language.
  const kitchens = useMemo(
    () =>
      sellers.map((s) => {
        const k = toHomeKitchen(s, t, locale);
        return { ...k, deliveryFee: quoteLabel(s, t) ?? k.deliveryFee };
      }),
    [sellers, t, locale],
  );
  const dishes = useMemo(() => products.map((p) => withDeal(toHomeDish(p, t), promotions[p.id])), [products, t, promotions]);
  const trendingKitchens = useMemo(() => trendingSellers.map((s) => toHomeKitchen(s, t, locale)), [trendingSellers, t, locale]);
  const recommendedDishes = useMemo(
    () => recommended.map((p) => ({ dish: withDeal(toHomeDish(p, t), promotions[p.id]), reason: p.recommendationReason })),
    [recommended, t, promotions],
  );
  const orderAgainDishes = useMemo(() => orderAgain.map((p) => withDeal(toHomeDish(p, t), promotions[p.id])), [orderAgain, t, promotions]);
  // Dishes already in "Order again" or "Recommended for you" are not offered a second time as popular.
  const popularDishes = useMemo(() => {
    const shownAbove = new Set([...orderAgain, ...recommended].map((p) => p.id));
    return dishes.filter((d) => !shownAbove.has(d.id)).slice(0, HOME_DISH_LIMIT);
  }, [dishes, orderAgain, recommended]);
  const firstName = user?.profile?.fullName?.trim().split(/\s+/)[0] ?? null;
  const filtering = selectedCuisine !== '' || selectedFilter !== 'all';
  const matching = filterKitchens(kitchens, '', selectedCuisine, selectedFilter);
  const filteredKitchens = filtering ? matching : matching.slice(0, HOME_KITCHEN_LIMIT);

  const clearFilters = () => {
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

    // One kitchen per order: ask before mixing kitchens in the tray (signed in or not).
    const other = useCartStore.getState().items.find((i) => i.sellerId !== dish.kitchenId);
    if (other) {
      setConflictModal({ isOpen: true, existingKitchenName: other.sellerName || t('anotherKitchen'), dish });
      return;
    }

    const stockType = dish.isFrozen ? 'hub' : 'direct';
    if (hasSession()) {
      try {
        await cartService.addToCart({ productId: dish.id, quantity: 1, stockType });
      } catch (err: unknown) {
        const response = isAxiosError(err) ? err.response : undefined;
        const apiError = (response?.data as CartErrorBody | undefined)?.error;
        if (response?.status === 409 || apiError?.code === 'CART_SELLER_MISMATCH') {
          setConflictModal({
            isOpen: true,
            existingKitchenName: apiError?.details?.existingSeller?.name || t('anotherKitchen'),
            dish,
          });
        } else {
          showToast(apiError?.code === 'INSUFFICIENT_STOCK' ? tb('toastInsufficientStock') : errorMessage(err, tb('toastAddToCartFailed')), 'error');
        }
        return;
      }
    }

    addItem({
      id: `${dish.id}-${Date.now()}`,
      productId: dish.id,
      productName: dish.name,
      productImage: dish.photo ?? undefined,
      sellerId: dish.kitchenId,
      sellerName: dish.kitchenName,
      quantity: 1,
      unitPrice: dish.price,
      stockType,
      subtotal: dish.price,
    });
    showToast(t('addedToTray', { name: dish.name }), 'success');
  };

  const handleConfirmSwitchKitchen = async () => {
    const dish = conflictModal.dish;
    if (!dish) return;
    setSwitchingKitchen(true);
    try {
      if (isAuthenticated) {
        await cartService.addToCart({
          productId: dish.id,
          quantity: 1,
          stockType: dish.isFrozen ? 'hub' : 'direct',
          clearAndAdd: true,
        });
      }
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
        search
        onOpenNav={() => setIsSidebarOpen(true)}
        onOpenTray={() => setIsCartOpen(true)}
        onFrozen={() => setSelectedFilter('frozen')}
      />
      <HomeHero dishes={dishes} greetingName={isAuthenticated ? firstName : undefined} />
      <FilterBar
        selectedCuisine={selectedCuisine}
        onSelectCuisine={setSelectedCuisine}
        selectedFilter={selectedFilter}
        onSelectFilter={setSelectedFilter}
      />
      {/* A visitor learns what Nuray is; a signed-in customer goes straight to what they order. */}
      {!isAuthenticated && <PromoBanners />}
      <OrderAgainDishes dishes={orderAgainDishes} onAdd={handleAddDishToCart} />
      <TrendingKitchens kitchens={trendingKitchens} />
      <KitchenGrid
        title={selectedCommunity ? t('kitchensForArea', { area: selectedCommunity.name }) : undefined}
        areaPrompt={selectedCommunity ? undefined : { text: t('chooseAreaPrompt'), action: t('chooseAreaButton'), onChoose: openSelectorModal }}
        kitchens={kitchens}
        filteredKitchens={filteredKitchens}
        state={kitchensState}
        onRetry={retryKitchens}
        onClearFilters={clearFilters}
        isAuthenticated={isAuthenticated}
        favoriteKitchenIds={favoriteKitchenIds}
        onToggleFavorite={toggleFavorite}
        phoneLimit={!filtering}
      />
      <RecommendedDishes dishes={recommendedDishes} onAdd={handleAddDishToCart} />
      <PopularDishes dishes={popularDishes} state={dishesState} onRetry={retryDishes} onAdd={handleAddDishToCart} />
      {!isAuthenticated && <StatsBand stats={stats} />}
      <HomeFooter />

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
