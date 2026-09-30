'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { favoriteService, FavoriteSellerItem } from '@/lib/services/favorite.service';
import { useCommunityStore } from '@/lib/store/community-store';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteSellerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedCommunity } = useCommunityStore();
  const { showToast } = useToast();

  const fetchFavorites = async () => {
    setLoading(true);
    try {
      const lat = selectedCommunity?.centerLatitude;
      const lng = selectedCommunity?.centerLongitude;
      const items = await favoriteService.getFavorites(lat, lng);
      setFavorites(items);
    } catch (err: any) {
      console.error(err);
      showToast('Could not load favorite kitchens', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, [selectedCommunity]);

  const handleRemove = async (sellerId: string, name: string) => {
    try {
      await favoriteService.removeFavorite(sellerId);
      setFavorites((prev) => prev.filter((f) => f.sellerId !== sellerId));
      showToast(`Removed "${name}" from favorites`, 'info');
    } catch (err: any) {
      showToast('Failed to remove favorite', 'error');
    }
  };

  return (
    <DashboardLayout
      title="Favorite Kitchens"
      subtitle="Quick access to your saved community home chefs, bakeries, and restaurants"
      sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
      userType="customer"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header summary banner */}
        <div className="rounded-2xl bg-[#0C1016] text-white p-6 border border-white/10 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">❤️</span>
              <h2 className="text-xl sm:text-2xl font-black">Your Saved Kitchens</h2>
            </div>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1">
              Never lose your favorite local biryani makers, paratha masters, or home bakers.
            </p>
          </div>
          <Link href="/products">
            <Button className="flame-btn px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl">
              Explore More Kitchens
            </Button>
          </Link>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-neutral-300 bg-white shadow-sm">
            <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-3xl mx-auto mb-4">
              🤍
            </div>
            <h3 className="text-lg font-bold text-neutral-900">No favorite kitchens saved yet</h3>
            <p className="text-sm text-neutral-500 max-w-md mx-auto mt-1 mb-6">
              When browsing community kitchens in {selectedCommunity?.name || 'your community'}, tap the heart icon on any kitchen to save it here for fast reordering.
            </p>
            <Link href="/products">
              <Button className="flame-btn px-6 py-2.5 text-sm font-semibold rounded-xl">
                Browse Community Kitchens
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="group rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition flex flex-col"
              >
                {/* Cover header */}
                <div className="relative h-32 bg-neutral-900 overflow-hidden">
                  {fav.coverImageUrl ? (
                    <img
                      src={fav.coverImageUrl}
                      alt={fav.businessName}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#0C1016] to-[#1E293B] flex items-center justify-center text-3xl">
                      👩‍🍳
                    </div>
                  )}
                  {/* Heart button */}
                  <button
                    type="button"
                    onClick={() => handleRemove(fav.sellerId, fav.businessName)}
                    className="absolute top-3 right-3 p-2 rounded-full bg-black/60 backdrop-blur-sm text-rose-500 hover:bg-black/90 hover:scale-110 transition"
                    title="Remove from favorites"
                  >
                    <svg className="w-4 h-4 fill-rose-500" viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </button>

                  {/* Status badge */}
                  <div className="absolute bottom-3 left-3">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full backdrop-blur-md shadow ${
                        fav.availability.isOpen
                          ? 'bg-emerald-500/90 text-white'
                          : 'bg-neutral-900/90 text-neutral-300'
                      }`}
                    >
                      {fav.availability.isOpen ? 'Open for Orders' : 'Closed'}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-neutral-900 text-base leading-snug group-hover:text-[#FF5500] transition">
                        {fav.businessName}
                      </h3>
                      <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 shrink-0">
                        <span className="text-amber-500 text-xs">★</span>
                        <span className="text-xs font-bold text-amber-900">
                          {fav.ratingAverage > 0 ? fav.ratingAverage.toFixed(1) : 'New'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-neutral-500">
                      {fav.community && (
                        <span className="px-2 py-0.5 rounded bg-neutral-100 font-medium text-neutral-700">
                          📍 {fav.community.name}
                        </span>
                      )}
                      {fav.distanceKm != null && (
                        <span>• {fav.distanceKm} km away</span>
                      )}
                      <span className="capitalize">• {fav.businessType.replace('_', ' ')}</span>
                    </div>

                    {/* Sample Menu Items */}
                    {fav.sampleProducts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-100">
                        <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                          Popular Dishes
                        </p>
                        <div className="space-y-1">
                          {fav.sampleProducts.map((dish) => (
                            <div key={dish.id} className="flex items-center justify-between text-xs">
                              <span className="text-neutral-700 truncate max-w-[170px]">{dish.name}</span>
                              <span className="font-semibold text-neutral-900">{formatPrice(dish.price)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-100">
                    <Link href={`/products?sellerId=${fav.sellerId}`} className="block">
                      <Button className="w-full flame-btn py-2 text-xs font-bold uppercase tracking-wider rounded-xl">
                        View Menu & Order
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
