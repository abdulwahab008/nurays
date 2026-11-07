'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { favoriteService, FavoriteSellerItem } from '@/lib/services/favorite.service';
import { useCommunityStore } from '@/lib/store/community-store';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { displayRating, formatPrice } from '@/lib/utils';
import { CoverImage } from '@/components/ui/CoverImage';
import { Bike, Heart, MapPin, Star } from 'lucide-react';
import { quoteOf, quoteParams, type DeliveryQuote, type QuotedSeller } from '@/components/marketplace/delivery-quote';
import type { ApiResponse } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { useAuthStore, hasSession } from '@/lib/store/auth-store';
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
  // Each saved kitchen's delivery fee and time to the chosen area, as on the kitchens page.
  const [quotes, setQuotes] = useState<Record<string, DeliveryQuote | null | undefined>>({});
  const areaId = selectedCommunity?.id ?? null;
  useEffect(() => {
    if (!areaId) return;
    let cancelled = false;
    apiClient
      .get<ApiResponse<QuotedSeller[]>>('/sellers', { params: { limit: 50, ...quoteParams(areaId) } })
      .then((res) => {
        if (!cancelled) setQuotes(Object.fromEntries((res.data?.data ?? []).map((k) => [k.id, k.delivery])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [areaId]);

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
    if (!hasSession()) {
      router.replace(loginUrlHere());
      return;
    }
    fetchFavorites();
  }, [selectedCommunity, isAuthenticated]);

  const handleRemove = async (sellerId: string, name: string) => {
    try {
      await favoriteService.removeFavorite(sellerId);
      setFavorites((prev) => prev.filter((f) => f.sellerId !== sellerId));
      showToast(t('favRemovedQuoted', { name }), 'info');
    } catch {
      showToast(t('favRemoveFailed'), 'error');
    }
  };

  return (
    <DashboardLayout title={t('favTitle')} subtitle={t('favSubtitle')} sidebarItems={CUSTOMER_SIDEBAR_ITEMS} userType="customer">
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <span className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" aria-hidden />
            {t('favLoading')}
          </div>
        ) : loadError ? (
          <LoadError error={loadError} onRetry={fetchFavorites} title={t('favLoadFailed')} />
        ) : favorites.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted">{t('favNone')}</p>
            <Link
              href="/kitchens"
              className="mt-4 inline-flex items-center h-11 px-5 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-raised"
            >
              {t('favBrowse')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {favorites.map((fav) => {
              const rating = displayRating(fav.ratingAverage, fav.totalReviews);
              const quote = quoteOf(quotes[fav.sellerId]);
              const businessKey = businessTypeKey(fav.businessType);
              return (
                <Link
                  key={fav.id}
                  href={`/kitchens/${fav.sellerId}`}
                  className="group rounded-[20px] border border-line bg-surface overflow-hidden hover:border-line-strong transition-colors flex flex-col"
                >
                  <div className="relative aspect-[16/10] bg-raised overflow-hidden">
                    <CoverImage src={fav.coverImageUrl} alt={fav.businessName} label={fav.businessName} size="md" className="w-full h-full" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleRemove(fav.sellerId, fav.businessName);
                      }}
                      className="absolute top-1 end-1 w-11 h-11 flex items-center justify-center"
                      aria-label={t('favRemoveTitle')}
                    >
                      <span className="w-9 h-9 rounded-full bg-surface/95 flex items-center justify-center shadow-xs">
                        <Heart className="w-4 h-4 fill-red-500 text-red-500" aria-hidden />
                      </span>
                    </button>
                  </div>

                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-bold text-ink text-base leading-snug">{fav.businessName}</h2>
                      {rating ? (
                        <span className="flex items-center gap-1 shrink-0 text-sm font-bold text-ink">
                          <Star className="w-4 h-4 fill-accent text-accent" aria-hidden />
                          {rating}
                        </span>
                      ) : (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent-soft text-accent-soft-ink text-xs font-medium">{t('new')}</span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted flex flex-wrap items-center gap-x-1.5">
                      {fav.community && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" aria-hidden />
                          {fav.community.name}
                        </span>
                      )}
                      {businessKey && <span>· {t(businessKey)}</span>}
                    </p>
                    <p className="mt-auto pt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <Bike className="w-4 h-4 text-muted shrink-0" aria-hidden />
                      {quote
                        ? quote.min != null && quote.max != null
                          ? quote.fee === 0
                            ? t('favFreeQuote', { min: quote.min, max: quote.max })
                            : t('favQuote', { fee: formatPrice(quote.fee), min: quote.min, max: quote.max })
                          : quote.fee === 0
                            ? t('freeDelivery')
                            : formatPrice(quote.fee)
                        : fav.availability.isOpen
                          ? t('favOpen')
                          : t('closed')}
                    </p>
                    {quote && (
                      <span className={`self-start px-2 py-0.5 rounded-full text-xs font-medium ${fav.availability.isOpen ? 'bg-brand-soft text-brand-soft-ink' : 'bg-raised text-muted'}`}>
                        {fav.availability.isOpen ? t('favOpen') : t('closed')}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
