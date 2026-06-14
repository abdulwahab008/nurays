'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { favoriteService, FavoriteProduct } from '@/lib/services/favorite.service';
import { formatPrice } from '@/lib/utils';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { ProductImage } from '@/components/ui/ProductImage';
import { Heart, Star, BadgeCheck } from 'lucide-react';

const sidebarItems = [
  { name: 'Dashboard', href: '/dashboard', icon: '' },
  { name: 'Browse Products', href: '/products', icon: '' },
  { name: 'Favorites', href: '/favorites', icon: '' },
  { name: 'My Orders', href: '/orders', icon: '' },
  { name: 'My Cart', href: '/cart', icon: '' },
  { name: 'My Profile', href: '/profile', icon: '' },
  { name: 'Addresses', href: '/profile/addresses', icon: '' },
];

export default function FavoritesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
  const [items, setItems] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    favoriteService
      .list()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const remove = async (productId: string) => {
    setItems((prev) => prev.filter((p) => p.id !== productId));
    try {
      await favoriteService.remove(productId);
    } catch {
      showToast('Could not remove favourite', 'error');
    }
  };

  return (
    <DashboardLayout title="Favorites" subtitle="Plates you saved for later" sidebarItems={sidebarItems} userType="customer">
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card rounded-2xl border border-ink-100 overflow-hidden">
              <div className="aspect-square bg-cream-100 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-cream-100 rounded animate-pulse" />
                <div className="h-3 w-2/3 bg-cream-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card rounded-2xl border border-ink-100 shadow-sm py-16 px-6 text-center">
          <span className="w-14 h-14 rounded-full bg-anar-50 text-anar-500 flex items-center justify-center mx-auto mb-4">
            <Heart className="w-7 h-7" />
          </span>
          <h2 className="text-lg font-semibold text-ink-900">No favourites yet</h2>
          <p className="text-ink-500 mt-1 mb-5">Tap the heart on any plate to save it here.</p>
          <Link href="/products">
            <span className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-forest-500 text-cream-50 font-semibold hover:bg-forest-600 transition-colors">
              Browse plates
            </span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {items.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="bg-card rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-ink-100 hover:border-forest-200 group flex flex-col"
            >
              <div className="aspect-square relative">
                <ProductImage src={product.primaryImage} alt={product.name} className="w-full h-full" imgClassName="transition-transform duration-300 group-hover:scale-105" />
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(product.id); }}
                  aria-label="Remove from favourites"
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-card flex items-center justify-center shadow-sm hover:scale-110 active:scale-95 transition-transform"
                >
                  <Heart className="w-[18px] h-[18px] fill-anar-500 text-anar-500" />
                </button>
              </div>
              <div className="p-3 sm:p-4 flex flex-col flex-1">
                <h3 className="font-semibold text-ink-900 line-clamp-2 leading-snug">{product.name}</h3>
                <p className="text-sm text-ink-500 mt-1 mb-3 flex items-center gap-1 min-w-0">
                  <span className="truncate">{product.seller?.businessName ?? 'Seller'}</span>
                  {product.seller?.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-forest-500 shrink-0" aria-label="Verified seller" />}
                </p>
                <div className="mt-auto flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-ink-900 price">{formatPrice(product.price)}</p>
                    <p className="text-xs text-ink-400">per {product.unit}</p>
                  </div>
                  {product.totalReviews > 0 ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-ink-700 shrink-0">
                      <Star className="w-4 h-4 fill-gold-400 text-gold-400" />
                      {product.ratingAverage.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-forest-600 bg-forest-50 px-2 py-0.5 rounded-full shrink-0">New</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
