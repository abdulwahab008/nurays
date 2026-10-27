'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { favoriteService, FavoriteSellerItem } from '@/lib/services/favorite.service';
import { useCommunityStore } from '@/lib/store/community-store';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { loginUrlHere } from '@/lib/auth-redirect';
import { browseMessages, businessTypeKey } from '@/lib/i18n/messages/browse';
import { useShallow } from 'zustand/react/shallow';

export default function FavoritesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const [favorites, setFavorites] = useState<FavoriteSellerItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the list could not be read; shown instead of "no favourites yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const { selectedCommunity } = useCommunityStore(useShallow((s) => ({ selectedCommunity: s.selectedCommunity })));
  const { showToast } = useToast();
  const t = useT(browseMessages);

  const fetchFavorites = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const lat = selectedCommunity?.centerLatitude;
      const lng = selectedCommunity?.centerLongitude;
      const items = await favoriteService.getFavorites(lat, lng);
      setFavorites(items);
    } catch (err: unknown) {
      console.error(err);
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Signed out: go and sign in, without first asking the server for a list it will refuse.
    if (!isAuthenticated && !apiClient.getAccessToken()) {
      router.push(loginUrlHere());
      return;
    }
    fetchFavorites();
  }, [selectedCommunity, isAuthenticated]);

  const handleRemove = async (sellerId: string, name: string) => {
    try {
      await favoriteService.removeFavorite(sellerId);
      setFavorites((prev) => prev.filter((f) => f.sellerId !== sellerId));
      showToast(t('favRemovedQuoted', { name }), 'info');
    } catch (err) {
      showToast(t('favRemoveFailed'), 'error');
    }
  };

  return (
    <DashboardLayout
      title={t('favTitle')}
      subtitle={t('favSubtitle')}
      sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
      userType="customer"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header summary banner */}
        <div className="rounded-[20px] bg-surface border border-line p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">❤️</span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-ink">{t('favSaved')}</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted mt-1">
              {t('favNeverLose')}
            </p>
          </div>
          <Link href="/products">
            <Button className="h-11 px-5 text-sm font-extrabold rounded-xl">
              {t('favExplore')}
            </Button>
          </Link>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-raised animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <LoadError error={loadError} onRetry={fetchFavorites} title={t('favLoadFailed')} />
        ) : favorites.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-line-strong bg-surface">
            <div className="w-16 h-16 rounded-3xl bg-brand-soft flex items-center justify-center text-3xl mx-auto mb-4">
              🤍
            </div>
            <h3 className="text-lg font-bold text-ink">{t('favNone')}</h3>
            <p className="text-sm text-muted max-w-md mx-auto mt-1 mb-6">
              {t('favEmptyHint', { area: selectedCommunity?.name || t('favYourCommunity') })}
            </p>
            <Link href="/products">
              <Button className="flame-btn px-6 py-2.5 text-sm font-semibold rounded-xl">
                {t('favBrowse')}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="group rounded-[20px] border border-line bg-surface overflow-hidden hover:border-line-strong transition-colors flex flex-col"
              >
                {/* Cover header */}
                <div className="relative h-36 bg-raised overflow-hidden">
                  {fav.coverImageUrl ? (
                    <img
                      src={fav.coverImageUrl}
                      alt={fav.businessName}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-brand-soft flex items-center justify-center text-3xl">
                      👩‍🍳
                    </div>
                  )}
                  {/* Heart button */}
                  <button
                    type="button"
                    onClick={() => handleRemove(fav.sellerId, fav.businessName)}
                    className="absolute top-3 end-3 w-9 h-9 flex items-center justify-center rounded-full bg-surface/95 text-red-500 shadow-xs hover:scale-105 transition"
                    title={t('favRemoveTitle')}
                    aria-label={t('favRemoveTitle')}
                  >
                    <svg className="w-4 h-4 fill-red-500" viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </button>

                  {/* Status badge */}
                  <div className="absolute bottom-3 start-3">
                    <span
                      className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full shadow-xs ${
                        fav.availability.isOpen ? 'bg-brand-soft text-brand-soft-ink' : 'bg-surface/95 text-ink'
                      }`}
                    >
                      {fav.availability.isOpen ? t('favOpen') : t('closed')}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-extrabold text-ink text-base leading-snug">
                        {fav.businessName}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-accent text-sm" aria-hidden>★</span>
                        <span className="text-sm font-extrabold text-ink">
                          {fav.ratingAverage > 0 ? fav.ratingAverage.toFixed(1) : t('new')}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted">
                      {fav.community && (
                        <span className="px-2 py-0.5 rounded bg-raised font-medium text-ink">
                          📍 {fav.community.name}
                        </span>
                      )}
                      {fav.distanceKm != null && (
                        <span>• {t('kmAway', { km: fav.distanceKm })}</span>
                      )}
                      <span className="capitalize">• {(() => {
                        const key = businessTypeKey(fav.businessType);
                        return key ? t(key) : fav.businessType.replace('_', ' ');
                      })()}</span>
                    </div>

                    {/* Sample Menu Items */}
                    {fav.sampleProducts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-line">
                        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                          {t('favPopular')}
                        </p>
                        <div className="space-y-1">
                          {fav.sampleProducts.map((dish) => (
                            <div key={dish.id} className="flex items-center justify-between text-xs">
                              <span className="text-ink truncate max-w-[170px]">{dish.name}</span>
                              <span className="font-semibold text-ink">{formatPrice(dish.price)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-line">
                    <Link href={`/products?sellerId=${fav.sellerId}`} className="block">
                      <Button className="w-full flame-btn py-2 text-xs font-bold uppercase tracking-wider rounded-xl">
                        {t('favViewMenu')}
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
