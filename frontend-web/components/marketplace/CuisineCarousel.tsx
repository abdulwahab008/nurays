'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Snowflake, Sparkles } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { homeMessages, type HomeKey } from '@/lib/i18n/messages/home';

export interface CuisineCategory {
  /** English label (other pages use it); the carousel shows the translated `cuisine.<query>` message. */
  label: string;
  query: string;
  image: string;
  badge?: string;
  isColdChain?: boolean;
}

// Browse shortcuts: each tile searches the catalog. The photos illustrate the dish type;
// they are not photos of any kitchen's food.
export const PLATFORM_CUISINES: CuisineCategory[] = [
  {
    label: 'Dum Biryani',
    query: 'biryani',
    image: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=300&q=80&auto=format&fit=crop',
  },
  {
    label: 'Shahi Nihari',
    query: 'nihari',
    image: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=300&q=80&auto=format&fit=crop',
  },
  {
    label: 'Desi Parathas',
    query: 'paratha',
    image: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=300&q=80&auto=format&fit=crop',
  },
  {
    label: 'Charcoal Kebabs',
    query: 'kebab',
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=300&q=80&auto=format&fit=crop',
  },
  {
    label: 'Halwa Puri',
    query: 'halwa',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=300&q=80&auto=format&fit=crop',
  },
  {
    label: 'Kunna & Karahi',
    query: 'karahi',
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=300&q=80&auto=format&fit=crop',
  },
  {
    label: 'Frozen',
    query: 'frozen',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300&q=80&auto=format&fit=crop',
    badge: 'Frozen',
    isColdChain: true,
  },
  {
    label: 'Matka Kheer',
    query: 'kheer',
    image: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=300&q=80&auto=format&fit=crop',
  },
  {
    label: 'Pulao & Yakhni',
    query: 'pulao',
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=300&q=80&auto=format&fit=crop',
  },
  {
    label: 'Cocktail Samosas',
    query: 'samosa',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=300&q=80&auto=format&fit=crop',
  },
];

interface CuisineCarouselProps {
  selectedCuisine?: string;
  onSelectCuisine?: (query: string) => void;
}

export function CuisineCarousel({ selectedCuisine, onSelectCuisine }: CuisineCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const t = useT(homeMessages);
  const cuisineLabel = (item: CuisineCategory) => {
    const key = `cuisine.${item.query}` as HomeKey;
    return key in homeMessages.en ? t(key) : item.label;
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative group">
      {/* Scroll Left Button */}
      <button
        onClick={() => scroll('left')}
        className="hidden md:flex absolute -start-3.5 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-slate-200 items-center justify-center text-slate-700 hover:bg-slate-50 transition-all opacity-0 group-hover:opacity-100"
        aria-label={t('scrollLeft')}
      >
        <ChevronLeft className="rtl:-scale-x-100 w-4 h-4" />
      </button>

      {/* Horizontal Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-none no-scrollbar py-1.5 px-0.5 scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {PLATFORM_CUISINES.map((item) => {
          const isSelected = selectedCuisine === item.query;
          return (
            <Link
              key={item.label}
              href={`/products?search=${item.query}`}
              onClick={(e) => {
                if (onSelectCuisine) {
                  e.preventDefault();
                  onSelectCuisine(item.query);
                }
              }}
              className={`flex-shrink-0 flex flex-col items-center gap-1.5 group/card px-2 py-1.5 rounded-xl transition-all ${
                isSelected
                  ? 'bg-orange-50/80 scale-102'
                  : 'hover:bg-slate-50'
              }`}
            >
              {/* Compact Circular Frame */}
              <div
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border transition-all shadow-2xs ${
                  isSelected
                    ? 'border-[#FF5500] ring-2 ring-orange-500/20 shadow-xs'
                    : 'border-slate-200 group-hover/card:border-slate-300'
                }`}
              >
                <img
                  src={item.image}
                  alt={cuisineLabel(item)}
                  className="w-full h-full object-cover group-hover/card:scale-108 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/5 group-hover/card:bg-transparent transition-colors" />

                {item.isColdChain && (
                  <span className="absolute bottom-0.5 end-0.5 w-4 h-4 rounded-full bg-cyan-600 text-white flex items-center justify-center shadow-xs">
                    <Snowflake className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>

              {/* Label */}
              <div className="text-center max-w-[84px]">
                <span className={`block text-xs font-semibold truncate transition-colors ${
                  isSelected ? 'text-[#FF5500]' : 'text-slate-700 group-hover/card:text-slate-950'
                }`}>
                  {cuisineLabel(item)}
                </span>
                {item.badge && (
                  <span className="inline-block text-[9px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                    {t('badgeFrozen')}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Scroll Right Button */}
      <button
        onClick={() => scroll('right')}
        className="hidden md:flex absolute -end-3.5 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-slate-200 items-center justify-center text-slate-700 hover:bg-slate-50 transition-all opacity-0 group-hover:opacity-100"
        aria-label={t('scrollRight')}
      >
        <ChevronRight className="rtl:-scale-x-100 w-4 h-4" />
      </button>
    </div>
  );
}
