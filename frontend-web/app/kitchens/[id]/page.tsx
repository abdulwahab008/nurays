'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrandLockup } from '@/components/ui/Mark';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { formatPrice, imageVariant } from '@/lib/utils';
import { sellerService } from '@/lib/services/seller.service';
import { cartService } from '@/lib/services/cart.service';
import { useCartStore } from '@/lib/store/cart-store';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import {
  Star,
  Clock,
  Bike,
  ShieldCheck,
  ChefHat,
  MapPin,
  UtensilsCrossed,
  Flame,
  Snowflake,
  ShoppingBag,
  ChevronRight,
  ArrowLeft,
  Check,
  Bell,
  MessageSquare,
} from 'lucide-react';

interface KitchenDish {
  id: string;
  name: string;
  nameUrdu?: string;
  description: string;
  price: number;
  originalPrice?: number;
  category: string;
  isFrozen: boolean;
  photo: string;
  badge?: string;
  prepTime: string;
  portion: string;
}

export interface KitchenReview {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  author: string;
  avatar?: string | null;
}

export interface KitchenProfile {
  id: string;
  name: string;
  chefName: string;
  chefBio: string;
  area: string;
  rating: number;
  reviewCount: number;
  eta: string;
  deliveryFee: string;
  minOrder: string;
  isOpen: boolean;
  openStatusText?: string;
  opensAt?: string;
  acceptsPreOrders?: boolean;
  preOrderDeliveryTime?: string;
  closesAt: string;
  coverPhoto: string;
  chefAvatar: string;
  cuisines: string[];
  badges: string[];
  storeNotice?: string | null;
  reviews?: KitchenReview[];
  dishes: KitchenDish[];
}

const KITCHEN_DIRECTORY: Record<string, KitchenProfile> = {
  'k-saima': {
    id: 'k-saima',
    name: "Saima's Craft Kitchen",
    chefName: 'Chef Saima Akhtar',
    chefBio: 'Home-taught generational recipes passed down from grandmother. Renowned in Gulshan for hand-rolled lachha parathas, shami kebabs, and sub-zero frozen snack packs.',
    area: 'Gulshan-e-Iqbal, Block 4, Karachi',
    rating: 4.8,
    reviewCount: 245,
    eta: '20-30 min',
    deliveryFee: 'Free over Rs 500',
    minOrder: 'Rs 300',
    isOpen: true,
    closesAt: '11:30 PM',
    coverPhoto: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1200&q=80&auto=format&fit=crop',
    chefAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&q=80&auto=format&fit=crop',
    cuisines: ['Hand-Rolled Parathas', 'Shami Kebabs', 'Frozen Packs', 'Desi Breakfast'],
    badges: ['Verified Home Chef', '100% Desi Ghee', 'Halal Certified', 'Sindh Food Standard'],
    dishes: [
      {
        id: 'saima-01',
        name: 'Crispy Hand-Rolled Aloo Paratha (6-Pack)',
        nameUrdu: 'آلو پراٹھا پیک',
        description: 'Crispy layered parathas packed with spiced potato mash, green chilies, and fresh coriander. Flash-frozen to preserve moisture.',
        price: 480,
        originalPrice: 600,
        category: 'frozen',
        isFrozen: true,
        photo: 'https://images.unsplash.com/photo-1626074353765-517a681e40be?w=600&q=80&auto=format&fit=crop',
        badge: 'Bestseller',
        prepTime: 'Frozen',
        portion: 'Pack of 6',
      },
      {
        id: 'saima-02',
        name: 'Royal Beef Shami Kebabs (Dozen)',
        nameUrdu: 'شاہی بیف شامی کباب',
        description: 'Prime ground beef slow-cooked with chana dal, whole garam masala, ginger, and garlic. Melts immediately when pan-fried.',
        price: 720,
        originalPrice: 850,
        category: 'frozen',
        isFrozen: true,
        photo: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80&auto=format&fit=crop',
        badge: 'Sub-Zero Classic',
        prepTime: 'Frozen',
        portion: '12 pcs',
      },
      {
        id: 'saima-03',
        name: 'Freshly Fried Halwa Puri Thali',
        nameUrdu: 'حلوہ پوری ناشتہ تھالی',
        description: 'Hot puffed puris served with aromatic suji halwa, sour chana tarkari, and fresh pickled onion salad.',
        price: 350,
        originalPrice: 420,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop',
        badge: 'Morning Express',
        prepTime: '20 min',
        portion: '3 puris + sides',
      },
      {
        id: 'saima-04',
        name: 'Homestyle Chicken Karahi (Fresh)',
        nameUrdu: 'گھریلو چکن کڑاہی',
        description: 'Cooked fresh on high flame with farm chicken, ripe tomatoes, ginger juliennes, and freshly crushed black pepper. No packaged spices.',
        price: 950,
        originalPrice: 1100,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&q=80&auto=format&fit=crop',
        badge: 'Chef Special',
        prepTime: '30 min',
        portion: 'Serves 2-3',
      },
    ],
  },
  'k-naseem': {
    id: 'k-naseem',
    name: "Naseem's Dum Pukht",
    chefName: 'Chef Naseem Bano',
    chefBio: 'Mastering the art of Dum cooking in DHA for over 15 years. Every degh is sealed with whole wheat dough and slow-steamed over coals.',
    area: 'DHA Phase 6, Karachi',
    rating: 4.9,
    reviewCount: 480,
    eta: '25-35 min',
    deliveryFee: 'Rs 80 delivery',
    minOrder: 'Rs 500',
    isOpen: true,
    closesAt: '11:00 PM',
    coverPhoto: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=1200&q=80&auto=format&fit=crop',
    chefAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&q=80&auto=format&fit=crop',
    cuisines: ['Sindhi Dum Biryani', 'Mutton Yakhni Pulao', 'Zarda', 'Kachumber'],
    badges: ['Master Biryani Chef', 'Aged Basmati Only', 'DHA Favorite'],
    dishes: [
      {
        id: 'naseem-01',
        name: 'Special Zafrani Chicken Dum Biryani',
        nameUrdu: 'زعفرانی چکن دم بریانی',
        description: 'Extra-long grain aged basmati layered with tender saffron chicken, sour plums, golden baby potatoes, and kewra water.',
        price: 850,
        originalPrice: 1000,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600&q=80&auto=format&fit=crop',
        badge: '#1 in Karachi',
        prepTime: '25 min',
        portion: 'Single large box (750g)',
      },
      {
        id: 'naseem-02',
        name: 'Mutton Degi Yakhni Pulao',
        nameUrdu: 'مٹن دیگی یخنی پلاؤ',
        description: 'Tender baby goat meat steeped in bone broth yakhni, infused with fennel, coriander seeds, and whole caramelized garlic.',
        price: 1250,
        originalPrice: 1450,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&q=80&auto=format&fit=crop',
        badge: 'Pure Yakhni',
        prepTime: '30 min',
        portion: 'Serves 1-2',
      },
      {
        id: 'naseem-03',
        name: 'Sub-Zero Marinated Biryani Chicken (Pre-Mix)',
        nameUrdu: 'منجمد بریانی چکن مکس',
        description: 'Yogurt, saffron, fried onions and whole masala marinated chicken flash-frozen to lock in freshness. Add straight to your rice pot in 10 mins.',
        price: 690,
        originalPrice: 800,
        category: 'frozen',
        isFrozen: true,
        photo: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80&auto=format&fit=crop',
        badge: 'Cook-at-Home',
        prepTime: 'Frozen',
        portion: '500g pouch',
      },
    ],
  },
  'k-asma': {
    id: 'k-asma',
    name: "Phupo Asma's Heritage Pot",
    chefName: 'Asma Begum',
    chefBio: 'Famous for the traditional 12-hour braised beef shank nihari and kunna gosht, slow-cooked in thick clay pots in PECHS.',
    area: 'PECHS Block 2, Karachi',
    rating: 4.95,
    reviewCount: 310,
    eta: '30-40 min',
    deliveryFee: 'Rs 100 delivery',
    minOrder: 'Rs 600',
    isOpen: true,
    closesAt: '10:30 PM',
    coverPhoto: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=1200&q=80&auto=format&fit=crop',
    chefAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&q=80&auto=format&fit=crop',
    cuisines: ['12h Slow-Cooked Nihari', 'Kunna Gosht', 'Maghaz', 'Nalli'],
    badges: ['Heritage Slow Cooker', 'Clay Pot Authenticated', 'PECHS Legend'],
    dishes: [
      {
        id: 'asma-01',
        name: 'Royal Shahi Beef Nihari (12h Braise)',
        nameUrdu: 'شاہی بیف نہاری',
        description: 'Bong shank cuts slow-braised overnight in rich aromatic flour-thickened gravy. Served with fried ginger, green chillies, and fresh lemon.',
        price: 1100,
        originalPrice: 1350,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&q=80&auto=format&fit=crop',
        badge: '12h Slow Braise',
        prepTime: '30 min',
        portion: 'Serves 2',
      },
      {
        id: 'asma-02',
        name: 'Chinioti Kunna Gosht (Clay Pot)',
        nameUrdu: 'چنیوٹی کُنہ گوشت',
        description: 'Tender mutton cooked in an unglazed clay handi with pure desi ghee and roasted cumin. Melts at first touch.',
        price: 1400,
        originalPrice: 1650,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&q=80&auto=format&fit=crop',
        badge: 'Desi Clay Pot',
        prepTime: '35 min',
        portion: 'Serves 2-3',
      },
    ],
  },
  'k-fareeha': {
    id: 'k-fareeha',
    name: "Fareeha's Frozen Savories",
    chefName: 'Fareeha Tariq',
    chefBio: 'Specializing in precision sub-zero frozen party snacks, samosas, and Chinese spring rolls, prepared under hospital-grade clean room standards.',
    area: 'Clifton Block 5, Karachi',
    rating: 4.75,
    reviewCount: 190,
    eta: 'Sub-Zero Dispatch',
    deliveryFee: 'Free over Rs 1,000',
    minOrder: 'Rs 400',
    isOpen: true,
    closesAt: '12:00 AM',
    coverPhoto: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=1200&q=80&auto=format&fit=crop',
    chefAvatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=300&q=80&auto=format&fit=crop',
    cuisines: ['Cocktail Samosas', 'Spring Rolls', 'Chicken Patties', 'Frozen'],
    badges: ['Frozen Cold Chain', 'Hygienic Clean Room', 'Clifton Favorite'],
    dishes: [
      {
        id: 'fareeha-01',
        name: 'Crispy Cocktail Keema Samosas (12-Pack)',
        nameUrdu: 'قیمہ سموسہ درجن',
        description: 'Ultra-thin homemade crust loaded with spiced minced beef, spring onions, and roasted coriander. Fry frozen in 4 minutes.',
        price: 520,
        originalPrice: 620,
        category: 'frozen',
        isFrozen: true,
        photo: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop',
        badge: 'Freeze-Sealed',
        prepTime: 'Frozen',
        portion: '12 pcs',
      },
      {
        id: 'fareeha-02',
        name: 'Golden Chicken & Veggie Spring Rolls (10-Pack)',
        nameUrdu: 'چکن اسپرنگ رولز',
        description: 'Shredded chicken with crunchy cabbage, carrots, bell peppers, and white pepper rolled in delicate pastry sheet.',
        price: 580,
        originalPrice: 700,
        category: 'frozen',
        isFrozen: true,
        photo: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80&auto=format&fit=crop',
        badge: 'Party Favorite',
        prepTime: 'Frozen',
        portion: '10 pcs',
      },
    ],
  },
  'k-burnsroad': {
    id: 'k-burnsroad',
    name: "Burns Road Kitchenette",
    chefName: 'Ustad Tariq & Family',
    chefBio: 'Bringing the iconic 70-year Burns Road food legacy right into your home. Authentic seekh kebabs and charcoal tikka smoked with babool wood.',
    area: 'Saddar Heritage, Karachi',
    rating: 4.85,
    reviewCount: 340,
    eta: '25-35 min',
    deliveryFee: 'Rs 90 delivery',
    minOrder: 'Rs 450',
    isOpen: true,
    closesAt: '1:00 AM',
    coverPhoto: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=1200&q=80&auto=format&fit=crop',
    chefAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80&auto=format&fit=crop',
    cuisines: ['Seekh Kebabs', 'Peshawari Chapli', 'Puri Paratha', 'Green Chutney'],
    badges: ['Charcoal Smoked', 'Burns Road Legacy', 'Late Night Express'],
    dishes: [
      {
        id: 'burns-01',
        name: 'Melt-in-Mouth Charcoal Beef Seekh Kebabs (4 Skewers)',
        nameUrdu: 'سیخ کباب سیٹ',
        description: 'Finely ground prime beef marinated in raw papaya, caramelized onions, and whole secret garam masala smoked over hot embers.',
        price: 780,
        originalPrice: 920,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&q=80&auto=format&fit=crop',
        badge: 'Smoky Fire',
        prepTime: '25 min',
        portion: '4 long skewers',
      },
    ],
  },
  'k-dadi': {
    id: 'k-dadi',
    name: "Dadi's Traditional Sweets",
    chefName: 'Dadi Bilqees',
    chefBio: 'Slow cooking heritage subcontinental desserts in pure milk and saffron since 1982. No artificial thickeners or food coloring.',
    area: 'Bahadurabad, Karachi',
    rating: 4.92,
    reviewCount: 160,
    eta: '20-25 min',
    deliveryFee: 'Free over Rs 600',
    minOrder: 'Rs 350',
    isOpen: true,
    closesAt: '10:00 PM',
    coverPhoto: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=1200&q=80&auto=format&fit=crop',
    chefAvatar: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=300&q=80&auto=format&fit=crop',
    cuisines: ['Matka Kheer', 'Shahi Tukray', 'Gajar Ka Halwa', 'Desi Meetha'],
    badges: ['Pure Buffalo Milk', 'No Preservatives', 'Grandmother Recipe'],
    dishes: [
      {
        id: 'dadi-01',
        name: 'Royal Saffron & Pistachio Matka Kheer',
        nameUrdu: 'شاہی زعفرانی مٹکا کھیر',
        description: 'Slow-simmered buffalo milk reduced for 4 hours with fragrant basmati rice, Iranian saffron, crushed green cardamom, and slivered pistachios in an earthen pot.',
        price: 420,
        originalPrice: 500,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600&q=80&auto=format&fit=crop',
        badge: 'Pure Earthen Pot',
        prepTime: '15 min',
        portion: 'Earthen Matka (300g)',
      },
    ],
  },
  '4e84c8f1-494b-496f-a2d5-f89ca74e84c4': {
    id: '4e84c8f1-494b-496f-a2d5-f89ca74e84c4',
    name: 'Sweet Tooth & Matka Kheer',
    chefName: 'Tahira Bano',
    chefBio: 'Authentic clay pot desserts, slow-cooked kheer, and traditional sweets made in small batches in Askari 11.',
    area: 'Askari 11, Sector B, Lahore',
    rating: 4.92,
    reviewCount: 180,
    eta: 'Pre-order for 7:00 PM',
    deliveryFee: 'Rs 50 delivery',
    minOrder: 'Rs 250',
    isOpen: false,
    openStatusText: 'Closed • Pre-Order Only',
    opensAt: '7:00 PM',
    closesAt: '11:00 PM',
    acceptsPreOrders: true,
    preOrderDeliveryTime: 'Today, 7:00 PM – 8:30 PM',
    coverPhoto: 'https://images.unsplash.com/photo-1605478371313-fa6f93afb78c?w=1200&q=80&auto=format&fit=crop',
    chefAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&q=80&auto=format&fit=crop',
    cuisines: ['Zafrani Matka Kheer', 'Shahi Tukray', 'Gulab Jamun', 'Clay Pot Desserts'],
    badges: ['Verified Home Chef', '100% Desi Ghee', 'Punjab Food Authority Standard'],
    dishes: [
      {
        id: 'kheer-01',
        name: 'Zafrani Clay-Pot Matka Kheer (500g)',
        nameUrdu: 'مٹکا کھیر',
        description: 'Slow-cooked milk pudding infused with Persian saffron, green cardamom, and garnished with roasted pistachios & almonds in an unglazed clay bowl.',
        price: 450,
        originalPrice: 550,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1605478371313-fa6f93afb78c?w=600&q=80&auto=format&fit=crop',
        badge: 'Chef Signature',
        prepTime: 'Cooked fresh',
        portion: '500g clay matka (serves 2-3)',
      },
      {
        id: 'kheer-02',
        name: 'Royal Shahi Tukray with Rabri (4 Pcs)',
        nameUrdu: 'شاہی ٹکڑے',
        description: 'Golden fried brioche crisps soaked in saffron-rose syrup and smothered in thick slow-reduced whole buffalo milk rabri.',
        price: 520,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=600&q=80&auto=format&fit=crop',
        prepTime: 'Cooked fresh',
        portion: '4 Large Pieces',
      },
    ],
  },
  'c1404e0d-5139-413a-a574-9753db73b385': {
    id: 'c1404e0d-5139-413a-a574-9753db73b385',
    name: 'Chacha Shafi Charcoal BBQ',
    chefName: 'Shafiq Ahmed',
    chefBio: 'Live coal grilled kebabs and boti seasoned with 18 freshly ground whole spices.',
    area: 'Askari 11, Sector C, Lahore',
    rating: 4.82,
    reviewCount: 340,
    eta: 'Opens Tomorrow 1:00 PM',
    deliveryFee: 'Rs 50 delivery',
    minOrder: 'Rs 400',
    isOpen: false,
    openStatusText: 'Closed',
    opensAt: 'Tomorrow 1:00 PM',
    closesAt: '12:00 AM',
    acceptsPreOrders: false,
    coverPhoto: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=1200&q=80&auto=format&fit=crop',
    chefAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&q=80&auto=format&fit=crop',
    cuisines: ['Bihari Boti', 'Reshmi Seekh Kebab', 'Chapli Kebab'],
    badges: ['Verified Home Chef', 'Halal Certified', 'Punjab Food Authority Standard'],
    dishes: [
      {
        id: 'bbq-01',
        name: 'Melt-in-Mouth Beef Bihari Boti (Plate)',
        nameUrdu: 'بہاری بوٹی',
        description: 'Thin beef fillets marinated in raw papaya, mustard oil, and roasted whole spices, chargrilled over babool coals.',
        price: 780,
        category: 'fresh',
        isFrozen: false,
        photo: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600&q=80&auto=format&fit=crop',
        prepTime: '25 min',
        portion: 'Full Plate with Raita',
      },
    ],
  },
};

export default function KitchenStorefrontPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { isAuthenticated, user } = useAuthStore();
  const [kitchen, setKitchen] = useState<KitchenProfile | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [addedItems, setAddedItems] = useState<Record<string, number>>({});
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    existingKitchenName: string;
    dish: KitchenDish | null;
  }>({
    isOpen: false,
    existingKitchenName: '',
    dish: null,
  });
  const [switchingKitchen, setSwitchingKitchen] = useState(false);

  const kitchenId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string) || 'k-saima';

  useEffect(() => {
    let cancelled = false;

    sellerService
      .getPublicSeller(kitchenId)
      .then((sellerData) => {
        if (cancelled) return;
        if (sellerData) {
          // Format location cleanly with no trailing comma
          const locParts = [sellerData.chef.area, sellerData.chef.city || sellerData.community?.city].filter(Boolean);
          const area = locParts.length > 0 ? locParts.join(', ') : (sellerData.community?.name || 'Local Community');

          // Determine availability & operating status
          const isCurrentlyOpen = sellerData.availability ? sellerData.availability.isOpen : true;
          let openStatusText = isCurrentlyOpen ? 'Open Now' : 'Closed';
          if (sellerData.availability) {
            if (sellerData.availability.status === 'preorder_only') {
              openStatusText = 'Pre-Order Only';
            } else if (sellerData.availability.status === 'busy') {
              openStatusText = 'Kitchen Busy';
            } else if (sellerData.availability.status === 'vacation') {
              openStatusText = 'On Vacation';
            } else if (!isCurrentlyOpen) {
              openStatusText = 'Closed Now';
            }
          }

          let closesAtText = '11:00 PM';
          if (sellerData.availability?.closesAt) {
            const closeD = new Date(sellerData.availability.closesAt);
            closesAtText = closeD.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          } else if (sellerData.orderCutoffTime) {
            closesAtText = `Cutoff: ${sellerData.orderCutoffTime}`;
          }

          // Compute delivery fee text dynamically based on seller policy
          let deliveryFeeText = 'Free over Rs 500';
          if (sellerData.freeDeliveryThreshold != null && Number(sellerData.freeDeliveryThreshold) > 0) {
            if (sellerData.deliveryFeeFixed != null && Number(sellerData.deliveryFeeFixed) > 0) {
              deliveryFeeText = `Rs ${sellerData.deliveryFeeFixed} (Free over Rs ${sellerData.freeDeliveryThreshold})`;
            } else {
              deliveryFeeText = `Free delivery over Rs ${sellerData.freeDeliveryThreshold}`;
            }
          } else if (sellerData.deliveryFeeFixed != null && Number(sellerData.deliveryFeeFixed) > 0) {
            deliveryFeeText = `Rs ${sellerData.deliveryFeeFixed} delivery`;
          } else if (sellerData.community?.deliveryBaseFee) {
            deliveryFeeText = `Rs ${sellerData.community.deliveryBaseFee} delivery`;
          }

          // Compute minimum order amount accurately
          let minOrderText = 'No min order';
          if (sellerData.minOrderAmountForDelivery != null && Number(sellerData.minOrderAmountForDelivery) > 0) {
            minOrderText = `Rs ${sellerData.minOrderAmountForDelivery}`;
          }

          // Compute verified & food authority badges dynamically
          const badges: string[] = [];
          if (sellerData.isVerified || sellerData.verificationStatus === 'approved') {
            badges.push('Verified Home Chef');
          } else {
            badges.push('Domestic Home Cook');
          }
          badges.push('100% Halal');

          const cityUpper = (sellerData.chef.city || sellerData.community?.city || '').toLowerCase();
          const areaUpper = (sellerData.chef.area || '').toLowerCase();
          if (
            cityUpper.includes('lahore') ||
            areaUpper.includes('askari 11') ||
            areaUpper.includes('askari 10') ||
            areaUpper.includes('dha phase') ||
            areaUpper.includes('gulberg')
          ) {
            badges.push('Punjab Food Authority Standard');
          } else if (
            cityUpper.includes('karachi') ||
            areaUpper.includes('gulshan') ||
            areaUpper.includes('clifton') ||
            areaUpper.includes('pechs') ||
            areaUpper.includes('bahria')
          ) {
            badges.push('Sindh Food Standard');
          } else if (cityUpper.includes('islamabad') || areaUpper.includes('f-') || areaUpper.includes('g-')) {
            badges.push('Islamabad Food Authority');
          } else {
            badges.push('Domestic Hygiene Inspected');
          }

          if (sellerData.businessType === 'home_kitchen') {
            badges.push('Certified Domestic Kitchen');
          }

          setKitchen({
            id: sellerData.id,
            name: sellerData.businessName,
            chefName: sellerData.chef.name,
            chefBio:
              sellerData.chef.bio ||
              sellerData.description ||
              'Passionate certified home chef preparing authentic generational family recipes with natural ingredients.',
            area,
            rating: Number(sellerData.ratingAverage) || 4.9,
            reviewCount: sellerData.totalReviews || (sellerData.reviews ? sellerData.reviews.length : 0),
            eta: `${sellerData.minPrepTimeMinutes || 20}-${(sellerData.minPrepTimeMinutes || 20) + 10} min`,
            deliveryFee: deliveryFeeText,
            minOrder: minOrderText,
            isOpen: isCurrentlyOpen,
            openStatusText,
            closesAt: closesAtText,
            coverPhoto:
              sellerData.coverImageUrl ||
              'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=1200&q=80&auto=format&fit=crop',
            chefAvatar:
              sellerData.chef.avatar ||
              'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&q=80&auto=format&fit=crop',
            cuisines:
              sellerData.mealCategories && sellerData.mealCategories.length > 0
                ? sellerData.mealCategories
                : ['Home Cooked Meals', 'Family Recipes'],
            badges,
            storeNotice: sellerData.storeNotice || null,
            reviews:
              sellerData.reviews && sellerData.reviews.length > 0
                ? sellerData.reviews.map((r) => ({
                    id: r.id,
                    rating: Number(r.rating) || 5,
                    comment: r.comment,
                    createdAt: r.createdAt,
                    author: r.author || 'Verified Buyer',
                    avatar: r.avatar || null,
                  }))
                : [],
            dishes:
              sellerData.products.length > 0
                ? sellerData.products.map((p) => ({
                    id: p.id,
                    name: p.name,
                    nameUrdu: p.nameUrdu || undefined,
                    description:
                      p.description || `${p.name} prepared freshly with authentic spices.`,
                    price: p.price,
                    originalPrice: p.originalPrice || undefined,
                    category: p.productType === 'frozen' ? 'frozen' : 'fresh',
                    isFrozen: p.productType === 'frozen',
                    photo:
                      p.images[0] ||
                      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80&auto=format&fit=crop',
                    badge:
                      p.originalPrice && p.originalPrice > p.price
                        ? 'Special Deal'
                        : p.productType === 'frozen'
                        ? 'Frozen'
                        : 'Fresh Batch',
                    prepTime: p.preparationTime
                      ? `${p.preparationTime} min`
                      : p.productType === 'frozen'
                      ? 'Frozen'
                      : '20 min',
                    portion: p.productType === 'frozen' ? 'Sub-zero pack' : 'Full portion',
                  }))
                : [
                    {
                      id: `${sellerData.id}-01`,
                      name: `${sellerData.businessName} Signature Dish`,
                      description: 'Freshly prepared specialty dish from this certified home kitchen.',
                      price: 650,
                      category: 'fresh',
                      isFrozen: false,
                      photo: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80&auto=format&fit=crop',
                      prepTime: '25 min',
                      portion: 'Serves 1-2',
                    },
                  ],
          });
        } else if (KITCHEN_DIRECTORY[kitchenId]) {
          setKitchen(KITCHEN_DIRECTORY[kitchenId]);
        } else {
          setKitchen(KITCHEN_DIRECTORY['k-saima']);
        }
      })
      .catch((err) => {
        console.error('Failed to load seller storefront:', err);
        if (KITCHEN_DIRECTORY[kitchenId]) {
          setKitchen(KITCHEN_DIRECTORY[kitchenId]);
        } else {
          setKitchen(KITCHEN_DIRECTORY['k-saima']);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [kitchenId]);

  const handleAddToCart = async (dish: KitchenDish) => {
    if (kitchen && !kitchen.isOpen && !kitchen.acceptsPreOrders) {
      showToast(`${kitchen.name} is currently closed and not accepting orders right now.`, 'error');
      return;
    }

    setAddedItems((prev) => ({
      ...prev,
      [dish.id]: (prev[dish.id] || 0) + 1,
    }));
    setCartCount((c) => c + 1);
    setCartTotal((t) => t + dish.price);

    if (kitchen && !kitchen.isOpen && kitchen.acceptsPreOrders) {
      showToast(`Added to pre-order cart for delivery at ${kitchen.opensAt || '7:00 PM'}!`, 'info');
    }

    // Add to global client cart store
    useCartStore.getState().addItem({
      id: `${dish.id}-${Date.now()}`,
      productId: dish.id,
      productName: dish.name,
      productImage: dish.photo,
      sellerId: kitchen?.id || 'unknown',
      sellerName: kitchen?.name || 'Home Kitchen',
      quantity: 1,
      unitPrice: dish.price,
      stockType: dish.isFrozen ? 'hub' : 'direct',
      subtotal: dish.price,
    });

    if (isAuthenticated) {
      try {
        await cartService.addToCart({
          productId: dish.id,
          quantity: 1,
          stockType: dish.isFrozen ? 'hub' : 'direct',
        });
      } catch (err: any) {
        if (err?.response?.status === 409 || err?.response?.data?.error?.code === 'CART_SELLER_MISMATCH') {
          const details = err?.response?.data?.error?.details;
          // Revert optimistic add
          setAddedItems((prev) => {
            const next = { ...prev };
            if (next[dish.id] <= 1) delete next[dish.id];
            else next[dish.id] -= 1;
            return next;
          });
          setCartCount((c) => Math.max(0, c - 1));
          setCartTotal((t) => Math.max(0, t - dish.price));

          setConflictModal({
            isOpen: true,
            existingKitchenName: details?.existingSeller?.name || 'another home kitchen',
            dish,
          });
          return;
        } else {
          console.warn('Backend cart add notice:', err?.message);
        }
      }
    }

    showToast(`Added ${dish.name} to your tray`, 'success');
  };

  const handleConfirmSwitchKitchen = async () => {
    const dish = conflictModal.dish;
    if (!dish) return;
    setSwitchingKitchen(true);
    try {
      await cartService.addToCart({
        productId: dish.id,
        quantity: 1,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        clearAndAdd: true,
      });
      useCartStore.getState().clearCart();
      useCartStore.getState().addItem({
        id: `${dish.id}-${Date.now()}`,
        productId: dish.id,
        productName: dish.name,
        productImage: dish.photo,
        sellerId: kitchen?.id || 'unknown',
        sellerName: kitchen?.name || 'Home Kitchen',
        quantity: 1,
        unitPrice: dish.price,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        subtotal: dish.price,
      });
      setAddedItems({ [dish.id]: 1 });
      setCartCount(1);
      setCartTotal(dish.price);
      showToast(`Tray updated with dishes from ${kitchen?.name}!`, 'success');
      setConflictModal({ isOpen: false, existingKitchenName: '', dish: null });
    } catch {
      showToast('Failed to replace cart items', 'error');
    } finally {
      setSwitchingKitchen(false);
    }
  };

  const handleRemoveFromCart = async (dish: KitchenDish) => {
    if (!addedItems[dish.id]) return;
    setAddedItems((prev) => {
      const next = { ...prev };
      if (next[dish.id] <= 1) delete next[dish.id];
      else next[dish.id] -= 1;
      return next;
    });
    setCartCount((c) => Math.max(0, c - 1));
    setCartTotal((t) => Math.max(0, t - dish.price));

    const itemInStore = useCartStore.getState().items.find((i) => i.productId === dish.id);
    if (itemInStore) {
      if (itemInStore.quantity <= 1) {
        useCartStore.getState().removeItem(itemInStore.id);
      } else {
        useCartStore.getState().updateItem(itemInStore.id, itemInStore.quantity - 1);
      }
    }

    if (isAuthenticated) {
      try {
        const serverCart = await cartService.getCart();
        const serverItem = serverCart.data?.items?.find((i) => i.product.id === dish.id);
        if (serverItem) {
          if (serverItem.quantity <= 1) {
            await cartService.removeCartItem(serverItem.id);
          } else {
            await cartService.updateCartItem(serverItem.id, serverItem.quantity - 1);
          }
        }
      } catch (err) {
        console.warn('Backend cart item update:', err);
      }
    }
  };

  if (!kitchen) {
    if (isAuthenticated) {
      return (
        <DashboardLayout
          title="Loading Kitchen..."
          subtitle="Fetching certified home cook menu"
          sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
          userType="customer"
        >
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-xs max-w-md mx-auto my-8">
            <div className="w-12 h-12 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-bold text-slate-800 text-sm">Loading home kitchen storefront...</p>
            <p className="text-xs text-slate-500 mt-1">Fetching certified home cook menu & fresh batches</p>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-sm max-w-sm">
          <div className="w-12 h-12 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-slate-800 text-sm">Loading home kitchen storefront...</p>
          <p className="text-xs text-slate-500 mt-1">Fetching certified home cook menu & fresh batches</p>
        </div>
      </div>
    );
  }

  const filteredDishes = activeCategory === 'all'
    ? kitchen.dishes
    : activeCategory === 'frozen'
    ? kitchen.dishes.filter((d) => d.isFrozen)
    : kitchen.dishes.filter((d) => !d.isFrozen);

  const renderStorefrontBody = (isPublic: boolean) => (
    <>

      {/* Kitchen Hero Banner */}
      <div className="relative bg-[#0C1016] text-white">
        <div className="h-56 sm:h-64 w-full overflow-hidden relative">
          <img
            src={kitchen.coverPhoto}
            alt={kitchen.name}
            className="w-full h-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0C1016] via-[#0C1016]/60 to-transparent" />
        </div>

        {/* Kitchen Info Card overlapping banner */}
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 -mt-20 sm:-mt-24 relative z-10">
          <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-lg border border-slate-200/80 text-slate-900 flex flex-col md:flex-row gap-5 items-start md:items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                <img
                  src={imageVariant(kitchen.chefAvatar, 'sm')}
                  decoding="async"
                  alt={kitchen.chefName}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-3 ring-white shadow-md"
                />
                <div className="absolute -bottom-1.5 -right-1.5 bg-[#FF5500] text-white text-xs font-bold p-1 rounded-full shadow-xs">
                  <Check className="w-3 h-3 text-white" />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      kitchen.isOpen
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        kitchen.isOpen ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'
                      }`}
                    />
                    <span>{kitchen.openStatusText || (kitchen.isOpen ? 'Open Now' : 'Closed')}</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[10px] font-bold">
                    {kitchen.closesAt.toLowerCase().includes('cutoff') ||
                    kitchen.closesAt.toLowerCase().includes('closes') ||
                    kitchen.closesAt.toLowerCase().includes('at')
                      ? kitchen.closesAt
                      : `Closes at ${kitchen.closesAt}`}
                  </span>
                </div>

                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
                  {kitchen.name}
                </h1>
                <p className="text-xs font-bold text-[#FF5500] mt-0.5">
                  Operated by {kitchen.chefName}
                </p>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#FF5500]" />
                  <span>{kitchen.area}</span>
                </p>

                <p className="text-xs text-slate-600 mt-2 max-w-xl line-clamp-2 leading-relaxed">
                  {kitchen.chefBio}
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex flex-wrap md:flex-col gap-2.5 w-full md:w-auto border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-6">
              <a
                href="#customer-reviews"
                className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100/80 px-2.5 py-1 rounded-xl border border-amber-200/80 transition-colors cursor-pointer"
                title="View customer reviews"
              >
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span className="text-amber-800 font-bold text-xs">{kitchen.rating.toFixed(1)}</span>
                <span className="text-[11px] text-amber-700 font-medium">({kitchen.reviewCount}+ reviews)</span>
              </a>
              <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/80">
                <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{kitchen.eta}</span>
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Bike className="w-3 h-3 text-slate-400" />
                  <span>{kitchen.deliveryFee}</span>
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/60">
                {kitchen.minOrder.startsWith('Rs') ? `Min. Order: ${kitchen.minOrder}` : 'No Minimum Order'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Badges & Dietary tags */}
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {kitchen.badges.map((b) => (
            <span
              key={b}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-200/80 text-xs font-semibold text-slate-700 shadow-2xs whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#FF5500]" />
              <span>{b}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Closed Kitchen / Scheduled Pre-Order Banner */}
      {!kitchen.isOpen && (
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-5">
          <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <Clock className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold uppercase tracking-wider">
                    Closed for Instant Orders
                  </span>
                  {kitchen.acceptsPreOrders && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                      Accepting Pre-Orders
                    </span>
                  )}
                </div>
                <h4 className="font-extrabold text-slate-900 text-sm">
                  {kitchen.acceptsPreOrders
                    ? `Chef ${kitchen.chefName} is taking advance orders for ${kitchen.opensAt || '7:00 PM'}`
                    : `${kitchen.name} is currently resting and closed`}
                </h4>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed max-w-2xl">
                  {kitchen.acceptsPreOrders
                    ? `Immediate 20-min delivery is not active. However, you can add dishes to your cart and place a scheduled pre-order for delivery at ${kitchen.opensAt || '7:00 PM'} (${kitchen.preOrderDeliveryTime || 'Today, 7:00 PM – 8:30 PM'}).`
                    : `Instant checkout is disabled for closed kitchens. You can review the chef's menu and check back when the kitchen re-opens at ${kitchen.opensAt || '7:00 PM'}.`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/products?openNow=true&view=kitchens"
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold transition-colors shadow-2xs whitespace-nowrap"
              >
                Browse Open Kitchens Delivering Now
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Store Notice banner if set by Chef */}
      {kitchen.storeNotice && (
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-4">
          <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
            <div className="p-1.5 rounded-xl bg-amber-200/70 text-amber-800 shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">Notice from Chef</h4>
              <p className="text-xs font-medium text-amber-900 mt-0.5">{kitchen.storeNotice}</p>
            </div>
          </div>
        </div>
      )}

      {/* Menu Categories Bar */}
      <div className="sticky top-16 z-30 bg-[#F8FAFC]/95 backdrop-blur-md border-b border-slate-200/80 py-3 mt-4">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 flex items-center gap-2.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-[#0C1016] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Full Kitchen Menu ({kitchen.dishes.length})</span>
          </button>
          <button
            onClick={() => setActiveCategory('fresh')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeCategory === 'fresh'
                ? 'bg-[#FF5500] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Fresh Hot Specials</span>
          </button>
          <button
            onClick={() => setActiveCategory('frozen')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeCategory === 'frozen'
                ? 'bg-[#00B4D8] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Snowflake className="w-3.5 h-3.5" />
            <span>Frozen Pantry Packs</span>
          </button>
        </div>
      </div>

      {/* Dishes Menu Grid */}
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-950">
              {activeCategory === 'all'
                ? "Chef's Current Menu"
                : activeCategory === 'fresh'
                ? 'Freshly Prepared Meals'
                : 'Frozen Packs'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hand-prepared in {kitchen.chefName}'s certified domestic kitchen
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {filteredDishes.length} items available
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredDishes.map((dish) => {
            const count = addedItems[dish.id] || 0;
            return (
              <div
                key={dish.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex flex-col sm:flex-row gap-4 items-start"
              >
                <div className="w-full sm:w-36 h-36 rounded-xl overflow-hidden relative flex-shrink-0 bg-slate-100">
                  <img
                    src={imageVariant(dish.photo, 'md')}
                    loading="lazy"
                    decoding="async"
                    alt={dish.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                  {dish.badge && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-[9px] font-bold tracking-wide backdrop-blur-xs">
                      {dish.badge}
                    </span>
                  )}
                  <span
                    className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                      dish.isFrozen
                        ? 'bg-cyan-600 text-white'
                        : 'bg-[#FF5500] text-white'
                    }`}
                  >
                    {dish.isFrozen ? (
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
                </div>

                <div className="flex-1 flex flex-col justify-between h-full min-w-0">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">
                        {dish.name}
                      </h3>
                    </div>
                    {dish.nameUrdu && (
                      <p className="text-xs text-[#FF5500] font-medium mt-0.5 font-urdu">
                        {dish.nameUrdu}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                      {dish.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold text-slate-950">
                          {formatPrice(dish.price)}
                        </span>
                        {dish.originalPrice && (
                          <span className="text-xs text-slate-400 line-through">
                            {formatPrice(dish.originalPrice)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        {dish.portion} • {dish.prepTime}
                      </span>
                    </div>

                    {!kitchen.isOpen && !kitchen.acceptsPreOrders ? (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold border border-slate-200 cursor-not-allowed">
                        Closed
                      </span>
                    ) : count === 0 ? (
                      <button
                        onClick={() => handleAddToCart(dish)}
                        className={`px-3.5 py-1.5 rounded-xl text-white text-xs font-bold shadow-2xs transition-all active:scale-95 ${
                          !kitchen.isOpen
                            ? 'bg-amber-600 hover:bg-amber-700 flex items-center gap-1.5'
                            : 'bg-[#FF5500] hover:bg-[#e04400]'
                        }`}
                      >
                        {!kitchen.isOpen ? (
                          <>
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pre-Order</span>
                          </>
                        ) : (
                          '+ Add to Cart'
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-xl border border-slate-200">
                        <button
                          onClick={() => handleRemoveFromCart(dish)}
                          className="w-6 h-6 rounded-lg bg-white text-slate-900 font-bold hover:bg-slate-200 transition-colors flex items-center justify-center text-xs shadow-2xs"
                        >
                          -
                        </button>
                        <span className="font-bold text-xs text-slate-900 px-1">
                          {count}
                        </span>
                        <button
                          onClick={() => handleAddToCart(dish)}
                          className="w-6 h-6 rounded-lg bg-[#FF5500] text-white font-bold hover:bg-[#e04400] transition-colors flex items-center justify-center text-xs shadow-2xs"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Customer Reviews & Feedback Section */}
      <section id="customer-reviews" className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-14 mb-10 scroll-mt-24">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold uppercase tracking-wider mb-1">
                <MessageSquare className="w-3 h-3 text-amber-600" />
                <span>Verified Buyer Feedback</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-950">
                Customer Reviews &amp; Ratings
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authentic opinions from food lovers who ordered from {kitchen.chefName}
              </p>
            </div>

            <div className="flex items-center gap-3 bg-amber-50/70 border border-amber-200/60 rounded-2xl px-4 py-2.5 self-start sm:self-auto">
              <div className="text-3xl font-black text-amber-900">{kitchen.rating.toFixed(1)}</div>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= Math.round(kitchen.rating)
                          ? 'fill-amber-500 text-amber-500'
                          : 'text-slate-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-amber-800 font-semibold mt-0.5 block">
                  {kitchen.reviewCount} verified {kitchen.reviewCount === 1 ? 'review' : 'reviews'}
                </span>
              </div>
            </div>
          </div>

          {/* Reviews List */}
          <div className="mt-6">
            {kitchen.reviews && kitchen.reviews.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {kitchen.reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF5500] to-amber-500 flex items-center justify-center text-white font-bold text-xs shadow-2xs">
                            {rev.author.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 block leading-tight">
                              {rev.author}
                            </span>
                            <span className="text-[10px] text-emerald-700 font-semibold inline-flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" />
                              <span>Verified Customer</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3 h-3 ${
                                s <= rev.rating
                                  ? 'fill-amber-500 text-amber-500'
                                  : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed italic mt-2">
                        &ldquo;{rev.comment || 'Excellent home-cooked meal, freshly prepared and great quality!'}&rdquo;
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200/60 text-[10px] text-slate-400">
                      {new Date(rev.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <ChefHat className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No reviews yet for this kitchen</p>
                <p className="text-xs text-slate-400 mt-1">
                  Order from {kitchen.name} today and be the first to share your dining experience!
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Floating Kitchen Cart Pill (Foodpanda/DoorDash style) */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4">
          <div className="bg-[#0C1016] text-white p-3 rounded-2xl shadow-xl border border-white/10 flex items-center justify-between gap-5 max-w-lg w-full">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FF5500] flex items-center justify-center text-white font-bold text-xs">
                {cartCount}
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">
                  {!kitchen.isOpen ? 'Pre-Order Total' : 'Total Order'}
                </div>
                <div className="text-sm font-bold text-white">{formatPrice(cartTotal)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!kitchen.isOpen && !kitchen.acceptsPreOrders ? (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold border border-slate-700 cursor-not-allowed"
                >
                  Checkout Disabled (Kitchen Closed)
                </button>
              ) : (
                <Link
                  href="/cart"
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#ff6a1a] text-white text-xs font-bold transition-colors shadow-sm"
                >
                  <span>
                    {!kitchen.isOpen
                      ? `Schedule Pre-Order (${kitchen.opensAt || '7:00 PM'})`
                      : 'Review & Checkout'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Styled Modern Modal for Single Kitchen Batch Switching */}
      <ConfirmModal
        isOpen={conflictModal.isOpen}
        title="Start Order from This Kitchen?"
        message={`Your tray currently contains dishes from ${conflictModal.existingKitchenName}. Nuray ensures direct, single-kitchen artisanal batches for guaranteed freshness. Would you like to clear your existing tray and start a new order with ${kitchen.name}?`}
        confirmText="Clear Tray & Add Dish"
        cancelText="Keep Existing Tray"
        variant="warning"
        loading={switchingKitchen}
        onConfirm={handleConfirmSwitchKitchen}
        onCancel={() => setConflictModal({ isOpen: false, existingKitchenName: '', dish: null })}
      />
    </>
  );

  // Authenticated customer: Render inside the customer DashboardLayout shell
  if (isAuthenticated) {
    return (
      <DashboardLayout
        title={kitchen.name}
        subtitle={`${kitchen.chefName} • ${kitchen.area} • Certified Domestic Kitchen`}
        sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
        userType="customer"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-1">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF5500] transition-colors py-1.5 px-3 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Kitchens &amp; Menus</span>
            </Link>
            <Link
              href="/kitchens"
              className="text-xs font-semibold text-slate-500 hover:text-[#FF5500] transition-colors"
            >
              View All Kitchens Directory →
            </Link>
          </div>

          {renderStorefrontBody(false)}
        </div>
      </DashboardLayout>
    );
  }

  // Public visitor: Render with top marketplace header
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-32">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <BrandLockup markSize={30} wordSize={20} />
            </Link>
            <div className="hidden sm:block">
              <CommunitySelector variant="navbar" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/products"
              className="text-xs font-semibold text-slate-700 hover:text-[#FF5500] px-3 py-1.5"
            >
              Browse Marketplace
            </Link>
            <Link
              href="/cart"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0C1016] text-white text-xs font-bold shadow-xs hover:bg-black transition-colors"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Cart</span>
              {cartCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#FF5500] text-white flex items-center justify-center text-[10px] font-bold">
                  {cartCount}
                </span>
              )}
            </Link>
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-700 hover:text-[#FF5500] px-2 py-1.5"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-3.5 py-1.5 rounded-xl bg-[#FF5500] hover:bg-[#e04400] text-white text-xs font-bold transition-colors shadow-2xs"
            >
              Join
            </Link>
          </div>
        </div>
      </header>

      {renderStorefrontBody(true)}
    </div>
  );
}
