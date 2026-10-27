'use client';

/** The platform's real numbers from GET /stats/public; nothing at all when they are not available. */
import { ChefHat, MapPin, UtensilsCrossed, Star, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { countLabel } from '@/lib/home-feed';
import { formatCount, type PublicStats } from '@/lib/home-filters';

export default function StatsBand({ stats }: { stats: PublicStats | null }) {
  const t = useT(homeMessages);
  const cards: Array<{ key: string; icon: LucideIcon; iconClass: string; valueClass: string; value: string; label: string }> =
    stats && stats.kitchens > 0
      ? [
          {
            key: 'kitchens',
            icon: ChefHat,
            iconClass: 'text-brand',
            valueClass: 'text-white',
            value: formatCount(stats.kitchens),
            label: stats.kitchens === 1 ? t('statKitchen') : t('statKitchens'),
          },
          {
            key: 'communities',
            icon: MapPin,
            iconClass: 'text-brand',
            valueClass: 'text-white',
            value: formatCount(stats.communities),
            label: stats.communities === 1 ? t('statCommunity') : t('statCommunities'),
          },
          {
            key: 'dishes',
            icon: UtensilsCrossed,
            iconClass: 'text-[#A9BCFF]',
            valueClass: 'text-white',
            value: formatCount(stats.dishes),
            label: stats.dishes === 1 ? t('statDish') : t('statDishes'),
          },
          ...(stats.averageRating != null
            ? [
                {
                  key: 'rating',
                  icon: Star,
                  iconClass: 'text-accent',
                  valueClass: 'text-white',
                  value: `${stats.averageRating.toFixed(1)} / 5`,
                  label: t('statAvg', { reviews: countLabel(t, stats.reviews, 'reviewsOne', 'reviewsMany') }),
                },
              ]
            : []),
        ]
      : [];
  if (cards.length === 0) return null;

  // A night-teal panel in both themes, like the "open a home kitchen" card: its own colours, not the page's.
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8">
      <div className="rounded-[24px] bg-[#0D2624] text-white px-5 py-10 sm:px-10 text-center">
        <h3 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight">{t('statsTitle')}</h3>
        <p className="text-[#A3BCB7] text-sm sm:text-base mt-2 max-w-xl mx-auto">{t('statsBody')}</p>

        <div
          className={`mt-8 grid gap-3 sm:gap-4 max-w-3xl mx-auto ${
            cards.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'
          }`}
        >
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="p-4 rounded-2xl bg-white/[0.06] border border-white/10">
                <Icon className={`w-5 h-5 mx-auto ${card.iconClass}`} aria-hidden />
                <div className={`text-2xl font-extrabold mt-2 ${card.valueClass}`}>{card.value}</div>
                <div className="text-xs font-semibold text-[#A3BCB7] mt-0.5">{card.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
