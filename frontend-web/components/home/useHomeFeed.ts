'use client';

/**
 * Everything the home page reads from the API, each with its own state so one failure does not blank the page:
 * kitchens and dishes say when they could not load (with Try again); the numbers, trending kitchens, saved
 * kitchens and the signed-in lists just stay hidden when they fail.
 */
import { useEffect, useState } from 'react';
import type { PublicSeller } from '@/lib/services/seller.service';
import { productService, type Product } from '@/lib/services/product.service';
import { favoriteService } from '@/lib/services/favorite.service';
import { apiClient, type ApiResponse } from '@/lib/api-client';
import { parseStats, type LoadState, type PublicStats } from '@/lib/home-filters';

const NONE: never[] = [];

export function useHomeFeed(isAuthenticated: boolean) {
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
  const [favoriteKitchenIds, setFavoriteKitchenIds] = useState<Set<string>>(new Set());

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
  };
}
