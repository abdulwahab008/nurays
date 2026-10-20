'use client';

/** Dish cards and the three dish sections: order again and recommended (signed in), and popular dishes. */
import Link from 'next/link';
import { Snowflake, Flame, Plus, ChefHat, Star, UtensilsCrossed, ChevronRight } from 'lucide-react';
import { CoverImage } from '@/components/ui/CoverImage';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import type { HomeT } from '@/lib/home-feed';
import type { HomeDish, LoadState } from '@/lib/home-filters';
import { DishCardSkeleton, RetryButton, SectionNotice } from './HomeStates';

type AddDish = (dish: HomeDish, e: React.MouseEvent) => void;

/** Why a dish is recommended, as the small line above its name. */
const reasonNote = (t: HomeT, reason?: string) =>
  reason === 'similar_customers'
    ? t('reasonSimilar')
    : reason === 'kitchen_you_like'
      ? t('reasonKitchen')
      : reason === 'category_you_like'
        ? t('reasonCategory')
        : t('reasonTrending');

/** One dish card (popular, order again, recommended). `note` is a small line above the name. */
export function DishCard({ dish, onAdd, note }: { dish: HomeDish; onAdd: AddDish; note?: string }) {
  const t = useT(homeMessages);
  return (
    <div
      key={dish.id}
      className="group bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden"
    >
      {/* Dish Photo */}
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        <CoverImage
          src={dish.photo}
          alt={dish.name}
          label={dish.name}
          size="md"
          className="w-full h-full group-hover:scale-105 transition-transform duration-300"
        />

        {/* Product Type Tag (as set by the kitchen) */}
        {dish.typeLabel && (
          <span
            className={`absolute top-2 start-2 px-1.5 py-0.5 rounded-md text-white text-[11px] font-bold flex items-center gap-0.5 ${
              dish.isFrozen ? 'bg-cyan-600' : 'bg-[#FF5500]'
            }`}
          >
            {dish.isFrozen ? <Snowflake className="w-2.5 h-2.5" /> : <Flame className="w-2.5 h-2.5" />}
            <span>{dish.typeLabel}</span>
          </span>
        )}

        {/* Direct Add to Cart Button */}
        <button
          onClick={(e) => onAdd(dish, e)}
          className="absolute bottom-2 end-2 w-8 h-8 rounded-full bg-[#FF5500] hover:bg-[#e04400] text-white shadow-md flex items-center justify-center font-bold text-sm transition-transform active:scale-95"
          title={t('addToTray')}
          aria-label={t('addNameToTray', { name: dish.name })}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Dish Info */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          {note && <p className="text-[11px] font-bold text-[#FF5500] truncate mb-0.5">{note}</p>}
          <p className="text-[11px] font-semibold text-slate-500 truncate flex items-center gap-1">
            <ChefHat className="w-3 h-3 text-slate-400" />
            <span>{dish.kitchenName}</span>
          </p>
          <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2 mt-0.5 group-hover:text-[#FF5500] transition-colors">
            {dish.name}
          </h4>
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-950 block">{formatPrice(dish.price)}</span>
            {dish.originalPrice != null && (
              <span className="text-[11px] text-slate-500 line-through">{formatPrice(dish.originalPrice)}</span>
            )}
          </div>
          {dish.rating && (
            <span className="text-[11px] font-bold bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded flex items-center gap-0.5 border border-amber-200/60">
              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
              <span>{dish.rating}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Order again" and "Recommended for you"; each hides when it has nothing. */
export function PersonalDishes({
  orderAgainDishes,
  recommendedDishes,
  onAdd,
}: {
  orderAgainDishes: HomeDish[];
  recommendedDishes: Array<{ dish: HomeDish; reason?: string }>;
  onAdd: AddDish;
}) {
  const t = useT(homeMessages);
  return (
    <>
      {orderAgainDishes.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-8" data-testid="order-again">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-4">{t('orderAgain')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {orderAgainDishes.map((dish) => (
              <DishCard key={dish.id} dish={dish} onAdd={onAdd} />
            ))}
          </div>
        </section>
      )}
      {recommendedDishes.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-8" data-testid="recommended">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{t('recommendedForYou')}</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5 mb-4">{t('recommendedForYouSub')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {recommendedDishes.map(({ dish, reason }) => (
              <DishCard key={dish.id} dish={dish} onAdd={onAdd} note={reasonNote(t, reason)} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** What people are ordering now (trend score), with its loading, failed and empty states. */
export function PopularDishes({
  dishes,
  state,
  onRetry,
  onAdd,
}: {
  dishes: HomeDish[];
  state: LoadState;
  onRetry: () => void;
  onAdd: AddDish;
}) {
  const t = useT(homeMessages);
  return (
    <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FF5500] mb-0.5">
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>{t('fromHomeKitchens')}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{t('popularDishes')}</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">{t('popularDishesSub')}</p>
        </div>
        <Link href="/products" className="text-xs font-bold text-[#FF5500] hover:underline flex items-center gap-1">
          <span>{t('exploreAllDishes')}</span>
          <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
        </Link>
      </div>

      {state === 'loading' ? (
        <div role="status" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
          <span className="sr-only">{t('loadingDishes')}</span>
          {Array.from({ length: 6 }, (_, i) => (
            <DishCardSkeleton key={i} />
          ))}
        </div>
      ) : state === 'error' ? (
        <SectionNotice role="alert" title={t('dishesError')} message={t('checkConnection')} action={<RetryButton onClick={onRetry} />} />
      ) : dishes.length === 0 ? (
        <SectionNotice title={t('noDishes')} message={t('noDishesBody')} />
      ) : (
        /* Dishes Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 sm:gap-4">
          {dishes.map((dish) => (
            <DishCard key={dish.id} dish={dish} onAdd={onAdd} />
          ))}
        </div>
      )}
    </section>
  );
}
