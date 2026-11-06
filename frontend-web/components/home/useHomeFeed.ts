'use client';

/**
 * Everything the home page reads from the API, each with its own state so one failure does not blank the page:
 * kitchens and dishes say when they could not load (with Try again); the numbers, trending kitchens, saved
 * kitchens and the signed-in lists just stay hidden when they fail.
 */
import { useEffect, useState } from 'react';
import { productService, type Product } from '@/lib/services/product.service';
import { favoriteService } from '@/lib/services/favorite.service';
import { apiClient, type ApiResponse } from '@/lib/api-client';
import { parseStats, type LoadState, type PublicStats } from '@/lib/home-filters';
import { kitchensForArea, quoteParams, type QuotedSeller } from '@/components/marketplace/delivery-quote';
import type { CatalogPromotionLike } from '@/lib/pricing';

const NONE: never[] = [];

/**
 * `communityId` is the customer's chosen area: with it the kitchens are those that deliver there (the area's own first),
 * each with its delivery fee and time, and the dishes from that area come first.
 */
export function useHomeFeed(isAuthenticated: boolean, communityId: string | null) {
  const [sellers, setSellers] = useState<QuotedSeller[]>([]);
  const [kitchensState, setKitchensState] = useState<LoadState>('loading');
  const [kitchensAttempt, setKitchensAttempt] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  // Kitchens people are ordering from right now, and personal dish lists (signed in).
  const [trendingSellers, setTrendingSellers] = useState<QuotedSeller[]>([]);
  const [recommended, setRecommended] = useState<Array<Product & { recommendationReason?: string }>>([]);
  const [orderAgain, setOrderAgain] = useState<Product[]>([]);
  const [dishesState, setDishesState] = useState<LoadState>('loading');
  const [dishesAttempt, setDishesAttempt] = useState(0);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [favoriteKitchenIds, setFavoriteKitchenIds] = useState<Set<string>>(new Set());
  const [promotions, setPromotions] = useState<Record<string, CatalogPromotionLike[]>>({});

  // Verified kitchens. Requested directly rather than through sellerService.getPublicSellers,
  // which turns a failed request into an empty list — we need to tell "none yet" from "failed".
  useEffect(() => {
    let cancelled = false;
    setKitchensState('loading');
    // With an area, every kitchen is asked for so the ones that deliver there can be picked out.
    apiClient
      .get<ApiResponse<QuotedSeller[]>>('/sellers', { params: { limit: communityId ? 50 : 12, ...quoteParams(communityId) } })
      .then((res) => {
        if (cancelled) return;
        setSellers(kitchensForArea(res.data?.data ?? [], communityId));
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
  }, [kitchensAttempt, communityId]);

  // Approved dishes, most-ordered first.
  useEffect(() => {
    let cancelled = false;
    productService
      .getProducts({ limit: 12, sort: 'popular', communityId: communityId ?? undefined })
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
  }, [dishesAttempt, communityId]);

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
      .get<ApiResponse<QuotedSeller[]>>('/sellers', { params: { sort: 'trending', limit: 10, ...quoteParams(communityId) } })
      .then((res) => {
        if (!cancelled) setTrendingSellers(kitchensForArea(res.data?.data ?? [], communityId));
      })
      .catch(() => {
        // The section just stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  // "Order again" and "Recommended for you" for a signed-in customer (after signing out they are no longer shown: see below).
  useEffect(() => {
    if (!isAuthenticated) return;
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

  // The kitchens' running deals on the dishes shown, so a card's price is the one the storefront, tray and order charge.
  const dishIdsKey = [...new Set([...products, ...recommended, ...orderAgain].map((p) => p.id))].sort().join(',');
  useEffect(() => {
    if (!dishIdsKey) return;
    let cancelled = false;
    apiClient
      .get<ApiResponse<Record<string, CatalogPromotionLike[]>>>('/promotions/catalog', { params: { productIds: dishIdsKey } })
      .then((res) => {
        if (!cancelled) setPromotions(res.data?.data ?? {});
      })
      .catch(() => {
        if (!cancelled) setPromotions({});
      });
    return () => {
      cancelled = true;
    };
  }, [dishIdsKey, isAuthenticated]);

  const retryKitchens = () => {
    setKitchensState('loading');
    setKitchensAttempt((n) => n + 1);
  };

  const retryDishes = () => {
    setDishesState('loading');
    setDishesAttempt((n) => n + 1);
  };

  return {
    sellers,
    kitchensState,
    retryKitchens,
    products,
    dishesState,
    retryDishes,
    trendingSellers,
    recommended: isAuthenticated ? recommended : NONE,
    orderAgain: isAuthenticated ? orderAgain : NONE,
    stats,
    favoriteKitchenIds,
    setFavoriteKitchenIds,
    promotions,
  };
}
