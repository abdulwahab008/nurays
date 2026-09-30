export interface TrendingDishItem {
  id: string;
  name: string;
  nameUrdu?: string;
  kitchenName: string;
  chefName: string;
  sellerId: string;
  kitchenSlug: string;
  price: number;
  originalPrice?: number;
  photo: string;
  category: string;
  cuisine: string;
  isFrozen: boolean;
  rating: number;
  orderCount24h: number;
  repeatOrderPercent: number;
  prepTimeMinutes: number;
  batchStatus?: string;
  trendingScore: number;
  trendingBadge: string;
}

/**
 * Calculates a dynamic trending score for dishes based on real-time factors:
 * - Velocity: Recent orders count in last 24h
 * - Retention: Repeat customer percentage
 * - Quality: Rating average
 * - Context: Current hour suitability (Breakfast, Lunch, Evening Snack, Dinner)
 * - Freshness: Live pot vs batch preparation
 */
export function calculateTrendingScore(dish: {
  rating: number;
  orderCount24h: number;
  repeatOrderPercent: number;
  category: string;
  isFrozen: boolean;
}): { score: number; badge: string } {
  const currentHour = new Date().getHours();

  // 1. Base score from orders and ratings
  const ratingWeight = dish.rating * 12; // ~60 pts
  const velocityWeight = Math.min(dish.orderCount24h * 1.5, 45); // up to 45 pts
  const loyaltyWeight = (dish.repeatOrderPercent / 100) * 20; // up to 20 pts

  // 2. Time-of-day contextual relevance bonus
  let timeBonus = 0;
  const cat = dish.category.toLowerCase();

  if (currentHour >= 6 && currentHour < 12) {
    // Breakfast / Morning
    if (cat.includes('paratha') || cat.includes('breakfast') || cat.includes('puri') || cat.includes('nihari')) {
      timeBonus = 25;
    }
  } else if ((currentHour >= 12 && currentHour < 16) || (currentHour >= 19 && currentHour < 23)) {
    // Lunch / Dinner peak
    if (cat.includes('biryani') || cat.includes('karahi') || cat.includes('pulao') || cat.includes('curry') || cat.includes('nihari')) {
      timeBonus = 25;
    }
  } else {
    // Evening snack / late night
    if (cat.includes('snack') || cat.includes('kebab') || cat.includes('roll') || cat.includes('samosa') || dish.isFrozen) {
      timeBonus = 20;
    }
  }

  // 3. Batch readiness bonus
  const freshnessBonus = dish.isFrozen ? 10 : 15;

  const totalScore = Math.round(ratingWeight + velocityWeight + loyaltyWeight + timeBonus + freshnessBonus);

  // Determine smart trending badge
  let badge = '🔥 Trending Now';
  if (dish.orderCount24h >= 40) {
    badge = '🔥 #1 Most Ordered';
  } else if (dish.repeatOrderPercent >= 90) {
    badge = '⭐ 96% Reorder Rate';
  } else if (timeBonus > 0) {
    badge = '⚡ Craving Right Now';
  } else if (!dish.isFrozen) {
    badge = '👨‍🍳 Simmering Fresh Pot';
  }

  return { score: totalScore, badge };
}

/**
 * Authentic seeded catalog of dishes for Askari 11 & Lahore communities
 * evaluated by the smart trending algorithm
 */
export const TRENDING_DISH_CATALOG: Omit<TrendingDishItem, 'trendingScore' | 'trendingBadge'>[] = [
  {
    id: 'tr-01',
    name: 'Special Zafrani Sindhi Dum Biryani',
    nameUrdu: 'زعفرانی دم بریانی',
    kitchenName: "Naseem's Dum Pukht",
    chefName: 'Chef Naseem Bano',
    sellerId: 'k-naseem',
    kitchenSlug: 'k-naseem',
    price: 680,
    originalPrice: 850,
    photo: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600&q=80&auto=format&fit=crop',
    category: 'biryani',
    cuisine: 'Dum Pukht',
    isFrozen: false,
    rating: 4.95,
    orderCount24h: 58,
    repeatOrderPercent: 94,
    prepTimeMinutes: 25,
    batchStatus: 'Fresh Deg Batch - Hot',
  },
  {
    id: 'tr-02',
    name: 'Crispy Hand-Rolled Aloo Paratha (6-Pack)',
    nameUrdu: 'آلو پراٹھا پیک',
    kitchenName: "Saima's Craft Kitchen",
    chefName: 'Chef Saima Akhtar',
    sellerId: 'k-saima',
    kitchenSlug: 'k-saima',
    price: 480,
    originalPrice: 600,
    photo: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80&auto=format&fit=crop',
    category: 'paratha',
    cuisine: 'Desi Ghee Breakfast',
    isFrozen: true,
    rating: 4.9,
    orderCount24h: 46,
    repeatOrderPercent: 96,
    prepTimeMinutes: 15,
    batchStatus: 'Sub-Zero Flash Frozen (-18°C)',
  },
  {
    id: 'tr-03',
    name: 'Royal Shahi Beef Nihari with Nalli',
    nameUrdu: 'شاہی بیف نہاری',
    kitchenName: "Phupo Asma's Heritage Pot",
    chefName: 'Asma Begum',
    sellerId: 'k-asma',
    kitchenSlug: 'k-asma',
    price: 890,
    originalPrice: 1050,
    photo: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80&auto=format&fit=crop',
    category: 'curry',
    cuisine: '12h Slow Cook',
    isFrozen: false,
    rating: 4.98,
    orderCount24h: 42,
    repeatOrderPercent: 92,
    prepTimeMinutes: 30,
    batchStatus: 'Simmering Slow Pot',
  },
  {
    id: 'tr-04',
    name: 'Royal Beef Shami Kebabs (Dozen)',
    nameUrdu: 'شاہی شامی کباب',
    kitchenName: "Saima's Craft Kitchen",
    chefName: 'Chef Saima Akhtar',
    sellerId: 'k-saima',
    kitchenSlug: 'k-saima',
    price: 720,
    originalPrice: 850,
    photo: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80&auto=format&fit=crop',
    category: 'kebab',
    cuisine: 'Traditional Savories',
    isFrozen: true,
    rating: 4.88,
    orderCount24h: 38,
    repeatOrderPercent: 91,
    prepTimeMinutes: 20,
    batchStatus: 'Sub-Zero Flash Frozen (-18°C)',
  },
  {
    id: 'tr-05',
    name: 'Chicken & Mozzarella Spring Rolls (12-Pack)',
    nameUrdu: 'چکن سپرنگ رول',
    kitchenName: "Fareeha's Frozen Savories",
    chefName: 'Fareeha Tariq',
    sellerId: 'k-fareeha',
    kitchenSlug: 'k-fareeha',
    price: 590,
    originalPrice: 720,
    photo: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop',
    category: 'snack',
    cuisine: 'Frozen Pantry',
    isFrozen: true,
    rating: 4.85,
    orderCount24h: 34,
    repeatOrderPercent: 88,
    prepTimeMinutes: 15,
    batchStatus: 'Sub-Zero Flash Frozen (-18°C)',
  },
  {
    id: 'tr-06',
    name: 'Smoked Melt-in-Mouth Bihari Boti',
    nameUrdu: 'بہاری بوٹی کباب',
    kitchenName: 'Burns Road Heritage Kitchen',
    chefName: 'Chef Usman Qureshi',
    sellerId: 'k-burns',
    kitchenSlug: 'k-burns',
    price: 780,
    originalPrice: 920,
    photo: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80&auto=format&fit=crop',
    category: 'kebab',
    cuisine: 'Live Charcoal BBQ',
    isFrozen: false,
    rating: 4.92,
    orderCount24h: 39,
    repeatOrderPercent: 93,
    prepTimeMinutes: 25,
    batchStatus: 'Fresh Off Grill',
  },
  {
    id: 'tr-07',
    name: 'Desi Murgh Karahi in Pure Butter',
    nameUrdu: 'دیسی مرغ کڑاہی مکھن والی',
    kitchenName: 'Bahria Spice Artisans',
    chefName: 'Chef Tariq Jameel',
    sellerId: 'k-bahria',
    kitchenSlug: 'k-bahria',
    price: 950,
    originalPrice: 1100,
    photo: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80&auto=format&fit=crop',
    category: 'karahi',
    cuisine: 'Lahori Shinwari & Karahi',
    isFrozen: false,
    rating: 4.96,
    orderCount24h: 44,
    repeatOrderPercent: 95,
    prepTimeMinutes: 25,
    batchStatus: 'Fresh Wok Cook',
  },
  {
    id: 'tr-08',
    name: 'Desi Ghee Suji Halwa with Crispy Poori Thali',
    nameUrdu: 'دیسی گھی سوجی حلوہ پوری',
    kitchenName: "Rabia's Morning Tiffin & Parathas",
    chefName: 'Rabia Tariq',
    sellerId: 'k-rabia',
    kitchenSlug: 'k-rabia',
    price: 420,
    originalPrice: 500,
    photo: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&q=80&auto=format&fit=crop',
    category: 'halwa',
    cuisine: 'Traditional Nashta',
    isFrozen: false,
    rating: 4.91,
    orderCount24h: 51,
    repeatOrderPercent: 97,
    prepTimeMinutes: 15,
    batchStatus: 'Fresh Morning Batch',
  },
  {
    id: 'tr-09',
    name: 'Chilled Saffron & Cardamom Matka Kheer',
    nameUrdu: 'مٹکہ زعفرانی کھیر',
    kitchenName: "Tahira's Clay Pot Meetha",
    chefName: 'Tahira Bibi',
    sellerId: 'k-tahira',
    kitchenSlug: 'k-tahira',
    price: 380,
    originalPrice: 450,
    photo: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=600&q=80&auto=format&fit=crop',
    category: 'kheer',
    cuisine: 'Desi Clay Pot Sweets',
    isFrozen: false,
    rating: 4.97,
    orderCount24h: 48,
    repeatOrderPercent: 96,
    prepTimeMinutes: 10,
    batchStatus: 'Slow Clay Pot Simmered',
  },
  {
    id: 'tr-10',
    name: 'Mutton Degi Yakhni Pulao with Shami',
    nameUrdu: 'مٹن دیگی یخنی پلاؤ',
    kitchenName: "Naseem's Dum Pukht",
    chefName: 'Chef Naseem Bano',
    sellerId: 'k-naseem',
    kitchenSlug: 'k-naseem',
    price: 840,
    originalPrice: 980,
    photo: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80&auto=format&fit=crop',
    category: 'pulao',
    cuisine: 'Dum Pukht',
    isFrozen: false,
    rating: 4.94,
    orderCount24h: 41,
    repeatOrderPercent: 93,
    prepTimeMinutes: 25,
    batchStatus: 'Hot Deg Batch',
  },
  {
    id: 'tr-11',
    name: 'Cocktail Beef Keema Samosas (12 Pack)',
    nameUrdu: 'قیمہ سموسہ پیک',
    kitchenName: "Fareeha's Frozen Savories",
    chefName: 'Fareeha Tariq',
    sellerId: 'k-fareeha',
    kitchenSlug: 'k-fareeha',
    price: 520,
    originalPrice: 650,
    photo: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop',
    category: 'samosa',
    cuisine: 'Frozen Savories',
    isFrozen: true,
    rating: 4.89,
    orderCount24h: 47,
    repeatOrderPercent: 94,
    prepTimeMinutes: 15,
    batchStatus: 'Sub-Zero Flash Frozen (-18°C)',
  },
];

/**
 * Returns dishes sorted dynamically by the smart trending algorithm
 */
export function getSmartTrendingDishes(): TrendingDishItem[] {
  return TRENDING_DISH_CATALOG.map((item) => {
    const { score, badge } = calculateTrendingScore({
      rating: item.rating,
      orderCount24h: item.orderCount24h,
      repeatOrderPercent: item.repeatOrderPercent,
      category: item.category,
      isFrozen: item.isFrozen,
    });
    return {
      ...item,
      trendingScore: score,
      trendingBadge: badge,
    };
  }).sort((a, b) => b.trendingScore - a.trendingScore);
}
