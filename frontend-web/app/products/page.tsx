'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { productService, Product } from '@/lib/services/product.service';
import { addressService } from '@/lib/services/address.service';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { apiClient } from '@/lib/api-client';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { BrandLockup } from '@/components/ui/Mark';
import { useCommunityStore } from '@/lib/store/community-store';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import { communityService, CommunityDetail, CommunityKitchen } from '@/lib/services/community.service';
import { favoriteService } from '@/lib/services/favorite.service';
import { cartService } from '@/lib/services/cart.service';
import CartConflictModal, { CartConflictInfo } from '@/components/cart/CartConflictModal';
import ClosedKitchenModal from '@/components/kitchen/ClosedKitchenModal';
import {
  Heart,
  Search,
  MapPin,
  Bike,
  ShoppingBag,
  Snowflake,
  Star,
  Clock,
  Tag,
  Flame,
  Sparkles,
  ChefHat,
  ShieldCheck,
  Home,
  UtensilsCrossed,
  CheckCircle2,
  ChevronRight,
  Store,
  Info,
  HelpCircle,
  X,
  Plus,
} from 'lucide-react';

interface CatalogPromotion {
  id: string;
  name: string;
  type: string;
  discountValue: number;
}

function getPromotionLabel(p: CatalogPromotion): string {
  if (p.type === 'percentage' && p.discountValue > 0) return `${p.discountValue}% off`;
  if (p.type === 'fixed' && p.discountValue > 0) return `${formatPrice(p.discountValue)} off`;
  return p.name || 'Deal';
}

function getStackedDiscountedPrice(originalPrice: number, promos: CatalogPromotion[]): number {
  if (!promos?.length) return originalPrice;
  const sorted = [...promos].sort((a, b) => (a.type === 'percentage' && b.type === 'fixed' ? -1 : a.type === 'fixed' && b.type === 'percentage' ? 1 : 0));
  const result = sorted.reduce((price, p) => {
    if (p.type === 'percentage' && p.discountValue > 0) return price * (1 - p.discountValue / 100);
    if (p.type === 'fixed' && p.discountValue > 0) return Math.max(0, price - p.discountValue);
    return price;
  }, originalPrice);
  return Math.round(result);
}

interface Category {
  id: string;
  name: string;
  nameUrdu?: string;
  iconUrl?: string;
  slug: string;
  children?: Category[];
}

const productTypeOptions = [
  { value: 'all', label: 'All Items' },
  { value: 'fresh', label: 'Fresh Cook', icon: Flame },
  { value: 'frozen', label: 'Frozen', icon: Snowflake },
  { value: 'ready_to_eat', label: 'Ready to Eat', icon: Clock },
  { value: 'ready_to_cook', label: 'Ready to Cook', icon: UtensilsCrossed },
];

const businessTypeOptions = [
  { value: '', label: 'Any Kitchen Type' },
  { value: 'home_kitchen', label: 'Home Kitchens' },
  { value: 'cloud_kitchen', label: 'Cloud Kitchens' },
  { value: 'bakery', label: 'Home Bakeries' },
];

const maxDistanceOptions = [
  { value: '', label: 'Any Distance' },
  { value: '2', label: 'Within 2 km' },
  { value: '5', label: 'Within 5 km' },
  { value: '10', label: 'Within 10 km' },
  { value: '20', label: 'Within 20 km' },
];

const VERIFIED_HOME_KITCHENS = [
  {
    id: 'k-saima',
    name: "Saima's Craft Kitchen",
    chef: 'Chef Saima Akhtar',
    area: 'Gulshan-e-Iqbal, Block 4',
    rating: 4.8,
    reviewsCount: 245,
    eta: '20-30 min',
    deliveryFee: 'Free over Rs 500',
    distance: '1.2 km',
    isOpen: true,
    closesAt: '11:30 PM',
    cuisine: ['Desi Ghee Parathas', 'Shami Kebabs', 'Frozen Packs'],
    coverPhoto: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    badge: 'Verified Home Cook',
    badgeColor: 'bg-emerald-500',
    popularDish: 'Hand-Rolled Aloo Paratha (6-pack)',
    minOrder: 'Rs 300',
    href: '/kitchens/k-saima',
  },
  {
    id: 'k-naseem',
    name: "Naseem's Dum Pukht",
    chef: 'Chef Naseem Bano',
    area: 'DHA Phase 6',
    rating: 4.9,
    reviewsCount: 480,
    eta: '25-35 min',
    deliveryFee: 'Rs 80 delivery',
    distance: '1.8 km',
    isOpen: true,
    closesAt: '11:00 PM',
    cuisine: ['Sindhi Dum Biryani', 'Yakhni Pulao', 'Zarda'],
    coverPhoto: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&q=80&auto=format&fit=crop',
    badge: 'Master Biryani Chef',
    badgeColor: 'bg-[#FF5500]',
    popularDish: 'Special Zafrani Dum Biryani',
    minOrder: 'Rs 500',
    href: '/kitchens/k-naseem',
  },
  {
    id: 'k-asma',
    name: "Phupo Asma's Heritage Pot",
    chef: 'Asma Begum',
    area: 'PECHS Block 2',
    rating: 4.95,
    reviewsCount: 310,
    eta: '30-40 min',
    deliveryFee: 'Rs 100 delivery',
    distance: '2.6 km',
    isOpen: true,
    closesAt: '10:30 PM',
    cuisine: ['Slow-Cooked Beef Nihari', 'Kunna Gosht', 'Nalli'],
    coverPhoto: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&q=80&auto=format&fit=crop',
    badge: '12h Slow-Cook Specialist',
    badgeColor: 'bg-amber-500',
    popularDish: 'Royal Shahi Beef Nihari',
    minOrder: 'Rs 600',
    href: '/kitchens/k-asma',
  },
  {
    id: 'k-fareeha',
    name: "Fareeha's Frozen Savories",
    chef: 'Fareeha Tariq',
    area: 'Clifton Block 5',
    rating: 4.75,
    reviewsCount: 190,
    eta: 'Sub-Zero Dispatch',
    deliveryFee: 'Free over Rs 1,000',
    distance: '3.1 km',
    isOpen: true,
    closesAt: '12:00 AM',
    cuisine: ['Cocktail Samosas', 'Chicken Spring Rolls', 'Patties'],
    coverPhoto: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&q=80&auto=format&fit=crop',
    badge: 'Frozen Pantry',
    badgeColor: 'bg-cyan-500',
    popularDish: 'Cocktail Keema Samosas (Dozen)',
    minOrder: 'Rs 400',
    href: '/kitchens/k-fareeha',
  },
  {
    id: 'k-burnsroad',
    name: "Burns Road Kitchenette",
    chef: 'Ustad Tariq & Family',
    area: 'Saddar Heritage',
    rating: 4.85,
    reviewsCount: 340,
    eta: '25-35 min',
    deliveryFee: 'Rs 90 delivery',
    distance: '3.8 km',
    isOpen: true,
    closesAt: '1:00 AM',
    cuisine: ['Charcoal Seekh Kebabs', 'Chapli Kebabs', 'Puri Paratha'],
    coverPhoto: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80&auto=format&fit=crop',
    badge: 'Charcoal Master',
    badgeColor: 'bg-red-500',
    popularDish: 'Melt-in-Mouth Seekh Kebabs',
    minOrder: 'Rs 450',
    href: '/kitchens/k-burnsroad',
  },
  {
    id: 'k-dadi',
    name: "Dadi's Traditional Sweets",
    chef: 'Dadi Bilqees',
    area: 'Bahadurabad',
    rating: 4.92,
    reviewsCount: 160,
    eta: '20-25 min',
    deliveryFee: 'Free over Rs 600',
    distance: '2.1 km',
    isOpen: true,
    closesAt: '10:00 PM',
    cuisine: ['Saffron Matka Kheer', 'Shahi Tukray', 'Gajar Halwa'],
    coverPhoto: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=150&q=80&auto=format&fit=crop',
    badge: 'Artisanal Confectioner',
    badgeColor: 'bg-purple-500',
    popularDish: 'Saffron & Cardamom Matka Kheer',
    minOrder: 'Rs 350',
    href: '/kitchens/k-dadi',
  },
];

const FALLBACK_MARKETPLACE_DISHES: Product[] = [
  {
    id: 'saima-01',
    name: 'Crispy Layered Aloo Paratha (6-Pack)',
    nameUrdu: 'آلو پراٹھا پیک',
    slug: 'crispy-aloo-paratha-6-pack',
    price: 480,
    originalPrice: 600,
    unit: 'pack',
    ratingAverage: 4.8,
    totalReviews: 120,
    primaryImage: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600&q=80&auto=format&fit=crop',
    productType: 'frozen',
    stock: { direct: 15, hub: 50 },
    seller: {
      id: 'k-saima',
      businessName: "Saima's Craft Kitchen",
      rating: 4.8,
      isVerified: true,
      businessType: 'home_kitchen',
    },
    delivery: {
      deliverable: true,
      fee: 0,
      distanceKm: 1.2,
      reason: null,
      estimatedMinMinutes: 20,
      estimatedMaxMinutes: 30,
    },
    estimatedDeliveryMinMinutes: 20,
    estimatedDeliveryMaxMinutes: 30,
  },
  {
    id: 'naseem-01',
    name: 'Special Zafrani Chicken Dum Biryani',
    nameUrdu: 'زعفرانی چکن دم بریانی',
    slug: 'zafrani-chicken-dum-biryani',
    price: 850,
    originalPrice: 1000,
    unit: 'box',
    ratingAverage: 4.9,
    totalReviews: 240,
    primaryImage: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600&q=80&auto=format&fit=crop',
    productType: 'fresh',
    stock: { direct: 20, hub: 0 },
    seller: {
      id: 'k-naseem',
      businessName: "Naseem's Dum Pukht",
      rating: 4.9,
      isVerified: true,
      businessType: 'home_kitchen',
    },
    delivery: {
      deliverable: true,
      fee: 80,
      distanceKm: 1.8,
      reason: null,
      estimatedMinMinutes: 25,
      estimatedMaxMinutes: 35,
    },
    estimatedDeliveryMinMinutes: 25,
    estimatedDeliveryMaxMinutes: 35,
  },
  {
    id: 'asma-01',
    name: 'Royal Shahi Beef Nihari (12h Braise)',
    nameUrdu: 'شاہی بیف نہاری',
    slug: 'royal-shahi-beef-nihari',
    price: 1100,
    originalPrice: 1350,
    unit: 'bowl',
    ratingAverage: 4.95,
    totalReviews: 180,
    primaryImage: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80&auto=format&fit=crop',
    productType: 'fresh',
    stock: { direct: 10, hub: 0 },
    seller: {
      id: 'k-asma',
      businessName: "Phupo Asma's Heritage Pot",
      rating: 4.95,
      isVerified: true,
      businessType: 'home_kitchen',
    },
    delivery: {
      deliverable: true,
      fee: 100,
      distanceKm: 2.6,
      reason: null,
      estimatedMinMinutes: 30,
      estimatedMaxMinutes: 40,
    },
    estimatedDeliveryMinMinutes: 30,
    estimatedDeliveryMaxMinutes: 40,
  },
  {
    id: 'fareeha-01',
    name: 'Crispy Cocktail Keema Samosas (12-Pack)',
    nameUrdu: 'قیمہ سموسہ درجن',
    slug: 'cocktail-keema-samosas',
    price: 520,
    originalPrice: 620,
    unit: 'pack',
    ratingAverage: 4.75,
    totalReviews: 95,
    primaryImage: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop',
    productType: 'frozen',
    stock: { direct: 30, hub: 100 },
    seller: {
      id: 'k-fareeha',
      businessName: "Fareeha's Frozen Savories",
      rating: 4.75,
      isVerified: true,
      businessType: 'home_kitchen',
    },
    delivery: {
      deliverable: true,
      fee: 0,
      distanceKm: 3.1,
      reason: null,
      estimatedMinMinutes: 20,
      estimatedMaxMinutes: 30,
    },
    estimatedDeliveryMinMinutes: 20,
    estimatedDeliveryMaxMinutes: 30,
  },
  {
    id: 'burns-01',
    name: 'Melt-in-Mouth Charcoal Beef Seekh Kebabs',
    nameUrdu: 'سیخ کباب سیٹ',
    slug: 'charcoal-beef-seekh-kebabs',
    price: 780,
    originalPrice: 920,
    unit: 'portion',
    ratingAverage: 4.85,
    totalReviews: 160,
    primaryImage: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&q=80&auto=format&fit=crop',
    productType: 'fresh',
    stock: { direct: 15, hub: 0 },
    seller: {
      id: 'k-burnsroad',
      businessName: "Burns Road Kitchenette",
      rating: 4.85,
      isVerified: true,
      businessType: 'home_kitchen',
    },
    delivery: {
      deliverable: true,
      fee: 90,
      distanceKm: 3.8,
      reason: null,
      estimatedMinMinutes: 25,
      estimatedMaxMinutes: 35,
    },
    estimatedDeliveryMinMinutes: 25,
    estimatedDeliveryMaxMinutes: 35,
  },
  {
    id: 'dadi-01',
    name: 'Royal Saffron & Pistachio Matka Kheer',
    nameUrdu: 'شاہی زعفرانی مٹکا کھیر',
    slug: 'royal-saffron-matka-kheer',
    price: 420,
    originalPrice: 500,
    unit: 'matka',
    ratingAverage: 4.92,
    totalReviews: 85,
    primaryImage: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600&q=80&auto=format&fit=crop',
    productType: 'fresh',
    stock: { direct: 25, hub: 0 },
    seller: {
      id: 'k-dadi',
      businessName: "Dadi's Traditional Sweets",
      rating: 4.92,
      isVerified: true,
      businessType: 'home_kitchen',
    },
    delivery: {
      deliverable: true,
      fee: 0,
      distanceKm: 2.1,
      reason: null,
      estimatedMinMinutes: 15,
      estimatedMaxMinutes: 25,
    },
    estimatedDeliveryMinMinutes: 15,
    estimatedDeliveryMaxMinutes: 25,
  },
];

const DEFAULT_ASKARI_11_KITCHENS: CommunityKitchen[] = [
  {
    id: '7d2df1cc-bd6d-4e41-b0af-d1860e01b330',
    businessName: "Saima's Craft Kitchen",
    businessType: 'restaurant',
    description: 'Generational recipes from Punjab: golden desi ghee parathas, shami kebabs, and handcrafted frozen savories.',
    ratingAverage: 4.9,
    totalReviews: 312,
    coverImageUrl: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    allowCrossCommunity: true,
    minPrepTimeMinutes: 20,
    chefName: 'Chef Saima Akhtar',
    cuisines: ['Desi Ghee Parathas', 'Shami Kebabs', 'Handmade Rotis'],
  },
  {
    id: 'd0064c70-9d69-45a7-b303-300fd364a901',
    businessName: "Baji Rukhsana's Dawat Pot",
    businessType: 'restaurant',
    description: 'Authentic Dawat-style degi cooking. Rich slow-cooked mutton yakhni pulao and velvety shahi koftay.',
    ratingAverage: 4.85,
    totalReviews: 198,
    coverImageUrl: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    allowCrossCommunity: true,
    minPrepTimeMinutes: 25,
    chefName: 'Baji Rukhsana Begum',
    cuisines: ['Mutton Yakhni Pulao', 'Shahi Kofta Curry', 'Zarda'],
  },
  {
    id: 'ca2c0390-2daf-43e4-b2d2-6cf33af09a94',
    businessName: 'Askari 11 Clay Oven Tandoor',
    businessType: 'restaurant',
    description: 'Fresh clay tandoor baked breads and charcoal grilled delicacies in Sector A.',
    ratingAverage: 4.8,
    totalReviews: 145,
    coverImageUrl: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    allowCrossCommunity: true,
    minPrepTimeMinutes: 15,
    chefName: 'Ustad Liaquat',
    cuisines: ['Roghni Naan', 'Garlic Butter Kulcha', 'Tandoori Tikka'],
  },
  {
    id: 'bbf9d603-ca9b-4b43-91d9-6d8116e2cac9',
    businessName: "Ammi's Kitchenette (Sector B)",
    businessType: 'restaurant',
    description: 'Homely comfort meals prepared daily in Sector B. Pure ingredients, low spice, no artificial colors.',
    ratingAverage: 4.95,
    totalReviews: 420,
    coverImageUrl: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    allowCrossCommunity: true,
    minPrepTimeMinutes: 20,
    chefName: 'Farida Parveen',
    cuisines: ['Dal Chawal Thali', 'Aloo Gosht', 'Bhindi Masala'],
  },
  {
    id: '4f3e2611-f905-4114-b635-27add23e1cfe',
    businessName: 'Bedian Farm-to-Fork',
    businessType: 'restaurant',
    description: 'Desi organic produce and poultry from Bedian farms right outside Askari 11 gates.',
    ratingAverage: 4.9,
    totalReviews: 215,
    coverImageUrl: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    allowCrossCommunity: true,
    minPrepTimeMinutes: 30,
    chefName: 'Zainab & Family',
    cuisines: ['Desi Murgh Karahi', 'Makki Roti', 'Sarson Ka Saag'],
    isOpen: true,
  },
  {
    id: '4e84c8f1-494b-496f-a2d5-f89ca74e84c4',
    businessName: 'Sweet Tooth & Matka Kheer',
    businessType: 'restaurant',
    description: 'Authentic clay pot desserts, slow-cooked kheer, and festival sweets.',
    ratingAverage: 4.92,
    totalReviews: 180,
    coverImageUrl: 'https://images.unsplash.com/photo-1605478371313-fa6f93afb78c?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    allowCrossCommunity: true,
    minPrepTimeMinutes: 15,
    chefName: 'Tahira Bano',
    cuisines: ['Zafrani Matka Kheer', 'Shahi Tukray', 'Gulab Jamun'],
    isOpen: false,
    opensAt: '7:00 PM',
    acceptsPreOrders: true,
    preOrderDeliveryTime: 'Today, 7:00 PM – 8:30 PM',
  },
  {
    id: '47347457-9346-4be4-8fe9-317211e84571',
    businessName: 'Sector C Frozen Pantry',
    businessType: 'restaurant',
    description: 'Artisanal frozen tea snacks made with hand-cut halal meat and clean pastry dough.',
    ratingAverage: 4.88,
    totalReviews: 260,
    coverImageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    allowCrossCommunity: true,
    minPrepTimeMinutes: 10,
    chefName: 'Huma Tariq & Daughters',
    cuisines: ['Keema Samosas', 'Cheese Spring Rolls', 'Wontons'],
    isOpen: true,
  },
  {
    id: 'c1404e0d-5139-413a-a574-9753db73b385',
    businessName: 'Chacha Shafi Charcoal BBQ',
    businessType: 'restaurant',
    description: 'Live coal grilled kebabs and boti seasoned with 18 freshly ground whole spices.',
    ratingAverage: 4.82,
    totalReviews: 340,
    coverImageUrl: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800&q=80&auto=format&fit=crop',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&q=80&auto=format&fit=crop',
    allowCrossCommunity: true,
    minPrepTimeMinutes: 25,
    chefName: 'Shafiq Ahmed',
    cuisines: ['Bihari Boti', 'Reshmi Seekh Kebab', 'Chapli Kebab'],
    isOpen: false,
    opensAt: 'Tomorrow 1:00 PM',
    acceptsPreOrders: false,
  },
];

const DEFAULT_COMMUNITY_DETAIL: CommunityDetail = {
  id: '420485bb-eed4-4e39-abed-2c3c8d6467b0',
  name: 'Askari 11',
  slug: 'askari-11',
  city: 'Lahore',
  areaDescription: 'Askari 11 gated community, Sector A, B, C & Bedian Road',
  centerLatitude: 31.472,
  centerLongitude: 74.453,
  radiusKm: 3.5,
  neighborCommunityIds: ['6685ab36-27c9-4929-8251-e21ae004446b', 'cc572dd6-fe1f-4398-98aa-04dd7fe0b7c0'],
  crossCommunityEnabled: true,
  deliveryBaseFee: 50,
  crossCommunityBaseFee: 120,
  sellerCount: 8,
  neighbors: [
    { id: '6685ab36-27c9-4929-8251-e21ae004446b', name: 'Askari 10', slug: 'askari-10', deliveryBaseFee: 50, crossCommunityBaseFee: 120 },
    { id: 'cc572dd6-fe1f-4398-98aa-04dd7fe0b7c0', name: 'DHA Phase 6', slug: 'dha-phase-6', deliveryBaseFee: 60, crossCommunityBaseFee: 150 },
  ],
  sellers: DEFAULT_ASKARI_11_KITCHENS,
};

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { showToast } = useToast();
  const { items: cartItems } = useCartStore();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState('Gulshan-e-Iqbal, Karachi');
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);

  const [viewMode, setViewMode] = useState<'kitchens' | 'dishes'>('kitchens');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProductType, setSelectedProductType] = useState(searchParams.get('productType') || 'all');
  const [sortBy, setSortBy] = useState('newest');
  const [openNow, setOpenNow] = useState(false);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [pickupAvailable, setPickupAvailable] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [offersAvailable, setOffersAvailable] = useState(false);
  const [businessType, setBusinessType] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState('');
  const [fastDeliveryOnly, setFastDeliveryOnly] = useState(false);
  const [customerLocation, setCustomerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [promotionsByProductId, setPromotionsByProductId] = useState<Record<string, CatalogPromotion[]>>({});

  // Community store & Single-Seller Cart / Favorites state
  const { selectedCommunity, communities, loadCommunities, setSelectedCommunity, openSelectorModal } = useCommunityStore();
  const [communityDetail, setCommunityDetail] = useState<CommunityDetail | null>(DEFAULT_COMMUNITY_DETAIL);
  const [communityKitchensLoading, setCommunityKitchensLoading] = useState(false);
  const [favoriteSellerIds, setFavoriteSellerIds] = useState<Set<string>>(new Set());
  const [cartConflict, setCartConflict] = useState<CartConflictInfo | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [closedKitchenModalData, setClosedKitchenModalData] = useState<CommunityKitchen | null>(null);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  // Fetch community details & verified kitchens whenever selectedCommunity changes
  useEffect(() => {
    const commId = selectedCommunity?.id || selectedCommunity?.slug || (communities[0]?.slug || 'gulshan-e-iqbal');

    let cancelled = false;
    setCommunityKitchensLoading(true);
    communityService
      .getCommunity(commId)
      .then((detail) => {
        if (!cancelled && detail) {
          setCommunityDetail(detail);
          if (!useCommunityStore.getState().selectedCommunity) {
            setSelectedCommunity(detail as any);
          }
        }
      })
      .catch((err) => {
        console.warn('Community details notice:', err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setCommunityKitchensLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCommunity?.id, selectedCommunity?.slug, setSelectedCommunity]);

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'price_low', label: 'Price: Low to High' },
    { value: 'price_high', label: 'Price: High to Low' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'popular', label: 'Most Popular' },
  ];

  // Load categories from API
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCategoriesLoading(true);
        const response = await apiClient.get('/categories');
        if (response.data.success) {
          setCategories(response.data.data || []);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
  }, []);

  // Load favorite sellers for instant heart fill
  useEffect(() => {
    if (!isAuthenticated) return;
    favoriteService.getFavorites().then((list) => {
      const ids = new Set<string>((list || []).map((f) => f.sellerId));
      setFavoriteSellerIds(ids);
    }).catch(() => {});
  }, [isAuthenticated]);

  // Customer coordinates for accurate delivery distance
  useEffect(() => {
    if (!isAuthenticated) return;
    addressService
      .getAddresses()
      .then((res) => {
        const addresses = res.data || [];
        const withCoords = addresses.find((a) => a.isDefault && a.coordinates) || addresses.find((a) => a.coordinates);
        if (withCoords?.coordinates) {
          setCustomerLocation({ lat: withCoords.coordinates.latitude, lng: withCoords.coordinates.longitude });
        }
      })
      .catch(() => setCustomerLocation(null));
  }, [isAuthenticated]);

  useEffect(() => {
    loadProducts();
  }, [
    page, selectedCategory, selectedProductType, sortBy, searchQuery, openNow,
    deliveryAvailable, pickupAvailable, freeDelivery, offersAvailable,
    businessType, maxDistanceKm, fastDeliveryOnly, customerLocation, selectedCommunity?.id,
  ]);

  useEffect(() => {
    const paramSearch = searchParams.get('search') || '';
    setSearchQuery(paramSearch);
    setSearchInput(paramSearch);
    if (paramSearch) {
      setViewMode('dishes');
    }
    setPage(1);
  }, [searchParams.toString()]);

  const loadProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const productTypeValue = selectedProductType !== 'all' ? (selectedProductType as any) : undefined;
      const response = await productService.getProducts({
        page,
        limit: 24,
        categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
        productType: productTypeValue,
        sort: sortBy as any,
        search: searchQuery || undefined,
        communityId: selectedCommunity?.id,
        openNow: openNow || undefined,
        deliveryAvailable: deliveryAvailable || undefined,
        pickupAvailable: pickupAvailable || undefined,
        freeDelivery: freeDelivery || undefined,
        offersAvailable: offersAvailable || undefined,
        businessType: businessType || undefined,
        maxDistanceKm: maxDistanceKm ? parseFloat(maxDistanceKm) : undefined,
        fastDelivery: fastDeliveryOnly || undefined,
        customerLat: customerLocation?.lat,
        customerLng: customerLocation?.lng,
      });

      if (response && response.data) {
        const list = response.data.products || [];
        setProducts(list.length > 0 ? list : FALLBACK_MARKETPLACE_DISHES);
        setTotalPages(response.data.pagination?.totalPages || 1);
        if (list.length > 0) {
          try {
            const ids = list.map((p: Product) => p.id).join(',');
            const promRes = await apiClient.get<{ success: boolean; data: Record<string, CatalogPromotion[]> }>(
              `/promotions/catalog?productIds=${encodeURIComponent(ids)}`
            );
            if (promRes.data.success && promRes.data.data) setPromotionsByProductId(promRes.data.data);
            else setPromotionsByProductId({});
          } catch {
            setPromotionsByProductId({});
          }
        } else {
          setPromotionsByProductId({});
        }
      } else {
        setProducts(FALLBACK_MARKETPLACE_DISHES);
      }
    } catch (err: any) {
      console.error('Failed to load products, using marketplace fallback dishes:', err);
      setProducts(FALLBACK_MARKETPLACE_DISHES);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
    if (searchInput) {
      setViewMode('dishes');
    }
  };

  const handleQuickAddToCart = async (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setAddingProductId(product.id);
    try {
      await cartService.addToCart({
        productId: product.id,
        quantity: 1,
        stockType: product.productType === 'frozen' ? 'hub' : 'direct',
      });
      showToast(`Added ${product.name} to your cart!`, 'success');
    } catch (err: any) {
      if (err?.response?.status === 409 || err?.response?.data?.error?.code === 'CART_SELLER_MISMATCH') {
        const details = err?.response?.data?.error?.details;
        setCartConflict({
          existingSellerName: details?.existingSeller?.name || 'Previous Kitchen',
          newSellerName: details?.newSeller?.name || product.seller?.businessName || 'New Kitchen',
          onConfirmClearAndAdd: async () => {
            try {
              await cartService.addToCart({
                productId: product.id,
                quantity: 1,
                stockType: product.productType === 'frozen' ? 'hub' : 'direct',
                clearAndAdd: true,
              });
              setCartConflict(null);
              showToast(`Cart updated with dishes from ${product.seller?.businessName}!`, 'success');
            } catch {
              showToast('Failed to replace cart items', 'error');
            }
          },
          onCancel: () => setCartConflict(null),
        });
      } else {
        const msg = err?.response?.data?.error?.message || err?.message || 'Failed to add dish';
        showToast(msg, 'error');
      }
    } finally {
      setAddingProductId(null);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent, sellerId: string, sellerName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    try {
      const res = await favoriteService.toggleFavorite(sellerId);
      const isFav = res.isFavorite;
      setFavoriteSellerIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(sellerId);
        else next.delete(sellerId);
        return next;
      });
      showToast(isFav ? `Saved ${sellerName} to your favorite kitchens!` : `Removed ${sellerName} from favorites`, 'info');
    } catch {
      showToast('Failed to update favorite', 'error');
    }
  };

  // Reusable Search & Filter Component
  // Helper to safely format hyperlocal delivery distance
  const formatDeliveryDistance = (p: Product) => {
    if (p.isSameCommunity) return 'In Your Society';
    if (p.delivery?.distanceKm != null && p.delivery.distanceKm >= 0 && p.delivery.distanceKm <= 35) {
      return `${p.delivery.distanceKm.toFixed(1)} km away`;
    }
    return p.community?.name || selectedCommunity?.name || 'Nearby Society';
  };

  const isAnyFilterActive = Boolean(
    searchInput.trim() ||
    searchQuery ||
    selectedProductType !== 'all' ||
    openNow ||
    deliveryAvailable ||
    freeDelivery ||
    fastDeliveryOnly
  );

  const handleClearAllFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setSelectedProductType('all');
    setOpenNow(false);
    setDeliveryAvailable(false);
    setFreeDelivery(false);
    setFastDeliveryOnly(false);
    setPage(1);
  };

  // Reusable Search & Filter Component
  const renderFilterBar = () => (
    <div className="space-y-4 mb-6">
      {/* Clean Marketplace Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {viewMode === 'kitchens' ? 'Home Kitchens & Local Chefs' : 'Authentic Homemade Dishes'}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
            <span>Delivering to</span>
            <button
              type="button"
              onClick={openSelectorModal}
              className="font-bold text-[#FF5500] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <MapPin className="w-3 h-3 text-[#FF5500]" />
              <span>{selectedCommunity?.name || 'Askari 11'}</span>
            </button>
            <span className="text-slate-300">•</span>
            <span>20–35 min neighborhood dispatch</span>
          </p>
        </div>
      </div>

      {/* Unified Search & Filters Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3 sm:p-3.5 space-y-3">
        {/* Top Row: Search Input + View Mode Switcher + Sort */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          {/* Clean Search Input */}
          <form onSubmit={handleSearch} className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search dishes, home chefs, biryani, kebabs..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-20 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-slate-50/70 focus:bg-white transition-all h-10"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              Search
            </button>
          </form>

          {/* View Switcher: Kitchens vs Dishes */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60 h-10 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('kitchens')}
              className={`flex items-center gap-1.5 px-3.5 py-1 rounded-lg text-xs font-bold transition-all h-full cursor-pointer ${
                viewMode === 'kitchens'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>Kitchens</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  viewMode === 'kitchens' ? 'bg-slate-100 text-slate-900' : 'bg-white/40 text-slate-600'
                }`}
              >
                {(communityDetail?.sellers || []).length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('dishes')}
              className={`flex items-center gap-1.5 px-3.5 py-1 rounded-lg text-xs font-bold transition-all h-full cursor-pointer ${
                viewMode === 'dishes'
                  ? 'bg-[#FF5500] text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>Dishes</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  viewMode === 'dishes' ? 'bg-white/20 text-white' : 'bg-white/40 text-slate-600'
                }`}
              >
                {products.length}
              </span>
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="border border-slate-200 rounded-xl px-3 py-1 text-xs font-semibold text-slate-700 bg-white hover:border-slate-300 focus:ring-2 focus:ring-slate-900 h-10 cursor-pointer"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Chips inside Search Panel */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            {productTypeOptions.map((type) => {
              const isSelected = selectedProductType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => {
                    setSelectedProductType(type.value);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white font-bold shadow-2xs'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {type.label}
                </button>
              );
            })}

            <div className="h-4 w-px bg-slate-200 mx-1 shrink-0" />

            <button
              onClick={() => {
                setOpenNow(!openNow);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                openNow
                  ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${openNow ? 'bg-white' : 'bg-emerald-500'}`} />
              <span>Open Now</span>
            </button>

            <button
              onClick={() => {
                setFreeDelivery(!freeDelivery);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                freeDelivery
                  ? 'bg-slate-900 text-white font-bold shadow-2xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              Free Delivery
            </button>

            <button
              onClick={() => {
                setFastDeliveryOnly(!fastDeliveryOnly);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 cursor-pointer ${
                fastDeliveryOnly
                  ? 'bg-slate-900 text-white font-bold shadow-2xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              ⚡ Under 35m
            </button>
          </div>

          {isAnyFilterActive && (
            <button
              onClick={handleClearAllFilters}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors cursor-pointer py-1 px-2"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Main Marketplace Content
  function renderMarketplaceContent() {
    if (viewMode === 'kitchens') {
      const allKitchens = communityDetail?.sellers || [];
      const kitchens = openNow ? allKitchens.filter((k) => k.isOpen !== false) : allKitchens;
      const communityName = selectedCommunity?.name || communityDetail?.name || 'Your Society';
      const baseFee = communityDetail?.deliveryBaseFee || selectedCommunity?.deliveryBaseFee || 50;

      return (
        <div>
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[10px] font-bold uppercase tracking-wider mb-1">
                <MapPin className="w-3 h-3 text-[#FF5500]" />
                <span>Hyperlocal Society: {communityName}</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Verified Domestic Home Kitchens
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Independent certified home chefs preparing generational family recipes in small batches.
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
              Showing {kitchens.length} Home Kitchens in {communityName}
            </span>
          </div>

          {communityKitchensLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="h-80 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
              ))}
            </div>
          ) : kitchens.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 text-center shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-orange-100 text-[#FF5500] flex items-center justify-center mx-auto mb-4">
                <Store className="w-7 h-7 text-[#FF5500]" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                0 Home Kitchens inside {communityName}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-5 leading-relaxed">
                No verified home kitchens are physically registered inside {communityName} yet. However, our sub-zero thermal rider fleet delivers directly from neighboring societies with fast 25-35 min express dispatch!
              </p>

              {communityDetail?.neighbors && communityDetail.neighbors.length > 0 && (
                <div className="flex flex-col items-center gap-2 mb-5">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Neighboring societies with active kitchens:
                  </span>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {communityDetail.neighbors.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          const comm = useCommunityStore.getState().communities.find((c) => c.id === n.id);
                          if (comm) useCommunityStore.getState().setSelectedCommunity(comm);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#FF5500] text-xs font-bold border border-orange-200 transition-colors shadow-2xs"
                      >
                        <span>Browse {n.name} Kitchens</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={openSelectorModal} className="flame-btn rounded-xl">
                Switch Community
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {kitchens.map((k) => {
                const isClosed = k.isOpen === false;
                const displayChef =
                  k.chefName && k.chefName.toLowerCase() !== k.businessName.toLowerCase()
                    ? k.chefName
                    : 'Verified Home Chef';

                return (
                  <Link
                    key={k.id}
                    href={`/kitchens/${k.id}`}
                    onClick={(e) => {
                      if (isClosed) {
                        e.preventDefault();
                        setClosedKitchenModalData(k);
                      }
                    }}
                    className={`group flex flex-col justify-between rounded-2xl border transition-all duration-300 overflow-hidden ${
                      isClosed
                        ? 'bg-slate-50/80 border-slate-300/80 opacity-75 grayscale-[25%] hover:opacity-100 hover:grayscale-0 hover:bg-white hover:border-amber-300 hover:shadow-lg'
                        : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xl hover:-translate-y-1'
                    }`}
                  >
                    {/* Cover Image with Modern Aspect Ratio & Subtle Overlays */}
                    <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                      <img
                        src={
                          k.coverImageUrl ||
                          'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800&q=80&auto=format&fit=crop'
                        }
                        alt={k.businessName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15 pointer-events-none" />

                      {/* Clean Top Status */}
                      {isClosed ? (
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-white text-[10px] font-bold bg-black/80 backdrop-blur-md inline-flex items-center gap-1.5 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span>Closed • {k.acceptsPreOrders ? `Pre-order (${k.opensAt || '7:00 PM'})` : `Opens ${k.opensAt || '7:00 PM'}`}</span>
                        </span>
                      ) : (
                        <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-white text-[10px] font-bold bg-black/50 backdrop-blur-md inline-flex items-center gap-1 shadow-2xs">
                          <ChefHat className="w-3 h-3 text-[#FF5500]" />
                          <span>Home Kitchen</span>
                        </span>
                      )}

                      {/* Favorite Button */}
                      <button
                        onClick={(e) => handleToggleFavorite(e, k.id, k.businessName)}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-white backdrop-blur-xs flex items-center justify-center text-slate-700 transition-all active:scale-90 shadow-xs z-10"
                        title="Save to Favorite Kitchens"
                      >
                        <Heart
                          className={`w-4 h-4 transition-colors ${
                            favoriteSellerIds.has(k.id)
                              ? 'fill-red-500 text-red-500'
                              : 'text-slate-600 hover:text-red-500'
                          }`}
                        />
                      </button>

                      {/* Bottom Left: Delivery ETA & Base Fee */}
                      <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 text-white text-xs font-semibold drop-shadow-sm">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-300" />
                          <span>
                            {k.minPrepTimeMinutes || 20}-{Number(k.minPrepTimeMinutes || 20) + 10} min
                          </span>
                        </span>
                        <span className="text-white/60">•</span>
                        <span className="flex items-center gap-1">
                          <Bike className="w-3.5 h-3.5 text-white/80" />
                          <span>Rs {baseFee} delivery</span>
                        </span>
                      </div>

                      {/* Bottom Right: Star Rating */}
                      <span className="absolute bottom-2.5 right-3 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1 shadow-2xs">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{k.ratingAverage ? Number(k.ratingAverage).toFixed(1) : '4.9'}</span>
                        <span className="text-white/60 text-[10px] font-normal">({k.totalReviews || 120})</span>
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        {/* Header: Title + Verified Badge + Avatar */}
                        <div className="flex items-start justify-between gap-2.5 mb-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-extrabold text-slate-900 text-base group-hover:text-[#FF5500] transition-colors leading-tight truncate">
                                {k.businessName}
                              </h3>
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            </div>
                            <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                              {displayChef} • {communityName}
                            </p>
                          </div>

                          {k.avatar && (
                            <img
                              src={k.avatar}
                              alt={k.businessName}
                              className="w-9 h-9 rounded-full object-cover ring-2 ring-slate-100 shadow-2xs shrink-0"
                            />
                          )}
                        </div>

                        {/* Cuisines: Dot-Separated Clean Row */}
                        {k.cuisines && k.cuisines.length > 0 && (
                          <p className="text-xs text-slate-600 font-medium line-clamp-1 mt-1">
                            {k.cuisines.slice(0, 4).join(' • ')}
                          </p>
                        )}

                        {/* Single Popular Specialty Highlight (Clean & Modern, NO UGLY BULLETS) */}
                        {k.products && k.products.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-slate-600 truncate min-w-0">
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold text-[10px] uppercase tracking-wider shrink-0">
                                Popular
                              </span>
                              <span className="font-semibold text-slate-800 truncate">{k.products[0].name}</span>
                            </div>
                            <span className="font-black text-slate-900 shrink-0 ml-2">Rs {k.products[0].price}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer CTA */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            isClosed
                              ? 'text-amber-800 bg-amber-50'
                              : 'text-emerald-700 bg-emerald-50'
                          }`}
                        >
                          {isClosed ? (k.acceptsPreOrders ? 'Pre-Order Slot' : 'Kitchen Closed') : 'Domestic Kitchen'}
                        </span>
                        <span className="font-bold text-[#FF5500] inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          <span>{isClosed ? (k.acceptsPreOrders ? 'Check Pre-Order' : 'View Schedule') : 'View Menu'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Dishes & Frozen Packs View
    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <h3 className="text-base font-bold text-red-800 mb-1.5">Failed to load dishes</h3>
          <p className="text-red-600 text-xs mb-3">{error}</p>
          <Button onClick={loadProducts} variant="outline" className="border-red-300 text-red-700 text-xs">
            Try Again
          </Button>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 font-semibold text-xs">Loading authentic dishes across Karachi kitchens...</p>
        </div>
      );
    }

    if (products.length === 0) {
      return (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-xs">
          <h2 className="text-xl font-bold text-slate-900 mb-1.5">No dishes match your criteria</h2>
          <p className="text-slate-500 text-xs mb-5 max-w-md mx-auto">
            Try a different search keyword or explore our featured home kitchens directly.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedProductType('all');
                setOpenNow(false);
                setDeliveryAvailable(false);
                setFreeDelivery(false);
                setFastDeliveryOnly(false);
                setPage(1);
              }}
              variant="outline"
              className="text-xs font-semibold"
            >
              Clear All Filters
            </Button>
            <button
              onClick={() => setViewMode('kitchens')}
              className="flame-btn px-4 py-2 text-xs font-bold rounded-xl"
            >
              Browse Verified Kitchens
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-slate-500">
            Found {products.length} homemade dishes &amp; packs
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="group flex flex-col justify-between bg-white rounded-2xl border border-slate-200/80 hover:border-[#FF5500]/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
            >
              <div className="aspect-[16/11] bg-slate-100 relative overflow-hidden">
                {product.primaryImage ? (
                  <img
                    src={product.primaryImage}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs font-semibold text-center px-4 bg-slate-100 gap-1.5">
                    <UtensilsCrossed className="w-6 h-6 text-slate-300" />
                    <span>Homemade Meal</span>
                  </div>
                )}

                {/* Fresh Cook or Frozen tag (No -18°C) */}
                <span
                  className={`absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-white text-[10px] font-bold ${
                    product.productType === 'frozen'
                      ? 'bg-sky-600/95 shadow-sky-600/30'
                      : 'bg-[#FF5500]/95 shadow-orange-500/30'
                  } shadow-xs z-10 flex items-center gap-1 backdrop-blur-xs`}
                >
                  {product.productType === 'frozen' ? (
                    <>
                      <Snowflake className="w-3 h-3" />
                      <span>Frozen</span>
                    </>
                  ) : (
                    <>
                      <Flame className="w-3 h-3" />
                      <span>Fresh Cook</span>
                    </>
                  )}
                </span>

                {/* Estimated Delivery Badge on bottom-left */}
                <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/65 backdrop-blur-md text-white text-[10px] font-semibold flex items-center gap-1 z-10">
                  <Clock className="w-3 h-3 text-amber-300" />
                  <span>{product.estimatedDeliveryMinMinutes || 20}-{product.estimatedDeliveryMaxMinutes || 35} min</span>
                </span>

                {/* Save / Favorite Kitchen Button */}
                {product.seller?.id && (
                  <button
                    onClick={(e) => handleToggleFavorite(e, product.seller.id, product.seller.businessName)}
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/90 hover:bg-white backdrop-blur-xs flex items-center justify-center text-slate-700 transition-transform active:scale-90 shadow-xs z-10"
                    title="Save to Favorite Kitchens"
                  >
                    <Heart
                      className={`w-3.5 h-3.5 transition-colors ${
                        favoriteSellerIds.has(product.seller.id)
                          ? 'fill-red-500 text-red-500'
                          : 'text-slate-600 hover:text-red-500'
                      }`}
                    />
                  </button>
                )}
              </div>

              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  {/* Clean Chef & Community Row */}
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ChefHat className="w-3.5 h-3.5 text-[#FF5500] shrink-0" />
                      <span className="text-[11px] font-bold text-slate-700 truncate">
                        {product.seller?.businessName || 'Verified Home Chef'}
                      </span>
                    </div>

                    {product.isSameCommunity ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-bold flex items-center gap-1">
                        <Home className="w-2.5 h-2.5" />
                        <span>In Your Area</span>
                      </span>
                    ) : (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
                        {formatDeliveryDistance(product)}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-1 group-hover:text-[#FF5500] transition-colors">
                    {product.name}
                  </h3>

                  <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                    <Bike className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>
                      {product.delivery?.fee === 0 ? 'Free delivery' : `Rs ${product.delivery?.fee || 50} delivery`}
                    </span>
                    {product.unit && <span>• per {product.unit}</span>}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    {promotionsByProductId[product.id]?.length ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-black text-slate-950">
                          {formatPrice(getStackedDiscountedPrice(product.price, promotionsByProductId[product.id]))}
                        </span>
                        <span className="text-xs text-slate-400 line-through">
                          {formatPrice(product.price)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-base font-black text-slate-950">
                        {formatPrice(product.price)}
                      </span>
                    )}
                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-amber-600 font-bold">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{(product.ratingAverage ?? 4.8).toFixed(1)}</span>
                      <span className="text-slate-400 font-normal">({product.totalReviews || 14})</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleQuickAddToCart(e, product)}
                    disabled={addingProductId === product.id}
                    title="Add to cart"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-[#FF5500] text-[#FF5500] hover:text-white border border-orange-200/80 hover:border-transparent font-bold text-xs transition-all active:scale-95 shadow-2xs cursor-pointer"
                  >
                    {addingProductId === product.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-center items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              size="sm"
              className="rounded-xl text-xs font-semibold"
            >
              ← Previous
            </Button>
            <span className="px-3 py-1.5 text-xs font-medium text-slate-600">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              size="sm"
              className="rounded-xl text-xs font-semibold"
            >
              Next →
            </Button>
          </div>
        )}
      </>
    );
  }

  if (isAuthenticated) {
    return (
      <DashboardLayout
        title="Kitchens & Menus"
        subtitle="Explore authentic domestic home cooks, generational family recipes & artisanal frozen packs"
        sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
        userType="customer"
      >
        <div className="space-y-6">
          {renderFilterBar()}
          {renderMarketplaceContent()}
        </div>
        <CartConflictModal isOpen={!!cartConflict} conflict={cartConflict} />
        <ClosedKitchenModal
          isOpen={!!closedKitchenModalData}
          onClose={() => setClosedKitchenModalData(null)}
          kitchenName={closedKitchenModalData?.businessName || 'Home Kitchen'}
          chefName={closedKitchenModalData?.chefName}
          avatar={closedKitchenModalData?.avatar}
          opensAt={closedKitchenModalData?.opensAt || '7:00 PM'}
          allowsPreOrder={closedKitchenModalData?.acceptsPreOrders ?? true}
          nextAvailableSlot={closedKitchenModalData?.preOrderDeliveryTime || 'Today, 7:00 PM – 8:30 PM'}
          onProceedToMenu={() => {
            if (closedKitchenModalData) {
              const preorderParam = closedKitchenModalData.acceptsPreOrders ? 'true' : 'false';
              router.push(`/kitchens/${closedKitchenModalData.id}?preorder=${preorderParam}`);
              setClosedKitchenModalData(null);
            }
          }}
          onBrowseOpenKitchens={() => {
            setOpenNow(true);
            setClosedKitchenModalData(null);
          }}
        />
      </DashboardLayout>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] pb-24">
      {/* Dedicated Public Catalog Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="hover:opacity-95 transition-opacity">
              <BrandLockup markSize={32} wordSize={22} />
            </Link>
            <div className="hidden sm:block">
              <CommunitySelector variant="navbar" />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/cart"
              className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 transition-colors"
            >
              <ShoppingBag className="w-4 h-4 text-slate-700" />
              {cartItems.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF5500] text-white rounded-full text-[9px] font-bold flex items-center justify-center shadow-xs">
                  {cartItems.length}
                </span>
              )}
            </Link>
            <Link
              href="/login"
              className="h-9 inline-flex items-center px-3.5 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Sign In
            </Link>
            <Link href="/register">
              <span className="flame-btn h-9 px-4 text-xs font-bold rounded-xl">Join Nuray</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Multi-Vendor Marketplace Container */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6 md:py-8">
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[10px] font-bold uppercase tracking-wider mb-2">
            <ChefHat className="w-3 h-3 text-[#FF5500]" />
            <span>MULTI-VENDOR FOOD CATALOG</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Karachi Home Kitchens &amp; Menus
          </h1>
          <p className="mt-1 text-slate-500 text-xs sm:text-sm max-w-2xl">
            Not a single restaurant. Explore certified domestic home cooks across Karachi, authentic family recipes, and artisanal frozen specialties.
          </p>
        </div>

        <div className="space-y-6">
          {renderFilterBar()}
          {renderMarketplaceContent()}
        </div>
        <CartConflictModal isOpen={!!cartConflict} conflict={cartConflict} />
        <ClosedKitchenModal
          isOpen={!!closedKitchenModalData}
          onClose={() => setClosedKitchenModalData(null)}
          kitchenName={closedKitchenModalData?.businessName || 'Home Kitchen'}
          chefName={closedKitchenModalData?.chefName}
          avatar={closedKitchenModalData?.avatar}
          opensAt={closedKitchenModalData?.opensAt || '7:00 PM'}
          allowsPreOrder={closedKitchenModalData?.acceptsPreOrders ?? true}
          nextAvailableSlot={closedKitchenModalData?.preOrderDeliveryTime || 'Today, 7:00 PM – 8:30 PM'}
          onProceedToMenu={() => {
            if (closedKitchenModalData) {
              const preorderParam = closedKitchenModalData.acceptsPreOrders ? 'true' : 'false';
              router.push(`/kitchens/${closedKitchenModalData.id}?preorder=${preorderParam}`);
              setClosedKitchenModalData(null);
            }
          }}
          onBrowseOpenKitchens={() => {
            setOpenNow(true);
            setClosedKitchenModalData(null);
          }}
        />
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-black text-slate-700">Loading Karachi Home Kitchens &amp; Menus...</p>
          </div>
        </div>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
