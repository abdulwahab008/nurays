'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

interface Order {
  id: string;
  orderNumber: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
  itemsCount: number;
  items: Array<{
    id: string;
    productName: string;
    productImage: string | null;
    quantity: number;
  }>;
}

interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalSpent: number;
}

const CATEGORIES = [
  { name: 'Biryani', href: '/products?category=biryani', photo: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&q=80&auto=format&fit=crop' },
  { name: 'Kebabs', href: '/products?category=kebab', photo: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&q=80&auto=format&fit=crop' },
  { name: 'Curries', href: '/products?category=curry', photo: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400&q=80&auto=format&fit=crop' },
  { name: 'Parathas', href: '/products?category=paratha', photo: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=80&auto=format&fit=crop' },
  { name: 'Desserts', href: '/products?category=dessert', photo: 'https://images.unsplash.com/photo-1605478371313-fa6f93afb78c?w=400&q=80&auto=format&fit=crop' },
  { name: 'Snacks', href: '/products?category=snacks', photo: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=80&auto=format&fit=crop' },
];

const PROMOS = [
  { title: 'First order', discount: '20% off', code: 'WELCOME20', tone: 'forest' as const },
  { title: 'Weekend special', discount: '15% off', code: 'WEEKEND15', tone: 'gold' as const },
  { title: 'Free delivery', discount: 'Rs 500+', code: 'FREEDEL', tone: 'ink' as const },
];

const SIDEBAR_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Browse', href: '/products', icon: '🛍️' },
  { name: 'Favorites', href: '/favorites', icon: '' },
  { name: 'Orders', href: '/orders', icon: '📦' },
  { name: 'Cart', href: '/cart', icon: '🛒' },
  { name: 'Wallet', href: '/wallet', icon: '💰' },
  { name: 'Profile', href: '/profile', icon: '👤' },
  { name: 'Addresses', href: '/profile/addresses', icon: '📍' },
  { name: 'Support', href: '/support', icon: '💬' },
];

function PromoTile({ promo }: { promo: typeof PROMOS[0] }) {
  const palette = {
    forest: { bg: 'var(--forest-500)', fg: 'var(--cream-50)', chip: 'rgba(251,248,241,0.18)' },
    gold:   { bg: 'var(--gold-500)',   fg: 'var(--cream-50)', chip: 'rgba(26,22,16,0.18)' },
    ink:    { bg: 'var(--ink-900)',    fg: 'var(--cream-50)', chip: 'rgba(251,248,241,0.18)' },
  }[promo.tone];
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ background: palette.bg, color: palette.fg }}>
      <div className="eyebrow" style={{ color: palette.fg, opacity: 0.85 }}>{promo.title}</div>
      <div className="font-display italic text-[28px] sm:text-[34px] leading-none mt-2">
        {promo.discount}
      </div>
      <div
        className="font-mono text-[11px] tracking-wider uppercase mt-4 inline-block px-2.5 py-1 rounded-full"
        style={{ background: palette.chip }}
      >
        {promo.code}
      </div>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0, pendingOrders: 0, completedOrders: 0, totalSpent: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    (async () => {
      try {
        const ordersResp = await apiClient.get('/orders/me?page=1&limit=10');
        const orders: Order[] = ordersResp.data?.data?.orders || [];
        setRecentOrders(orders);
        const active = orders.find((o) =>
          ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit'].includes(o.orderStatus),
        );
        setActiveOrder(active || null);
        setStats({
          totalOrders: orders.length,
          pendingOrders: orders.filter((o) =>
            ['pending', 'confirmed', 'preparing', 'in_transit'].includes(o.orderStatus),
          ).length,
          completedOrders: orders.filter((o) =>
            ['delivered', 'completed'].includes(o.orderStatus),
          ).length,
          totalSpent: orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0),
        });
      } catch {
        // Empty state covers errors gracefully
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, router]);

  const firstName =
    user?.profile?.fullName?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'there';

  if (!isAuthenticated) return null;

  const greetingText =
    new Date().getHours() < 12 ? 'Good morning' :
    new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  if (loading) {
    return (
      <DashboardLayout title="Loading" subtitle="" sidebarItems={SIDEBAR_ITEMS} userType="customer">
        <div className="flex items-center justify-center h-64">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2"
            style={{ borderColor: 'var(--forest-500)' }}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="" subtitle="" sidebarItems={SIDEBAR_ITEMS} userType="customer">
      {/* HERO */}
      <section
        className="relative overflow-hidden rounded-3xl px-6 py-8 sm:p-10 lg:p-12 mb-8"
        style={{ background: 'var(--ink-900)', color: 'var(--cream-50)' }}
      >
        <div
          aria-hidden
          className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle at center, rgba(10,122,58,0.35), transparent 60%)' }}
        />
        <div className="relative max-w-2xl">
          <div className="eyebrow" style={{ color: 'var(--forest-300)' }}>
            {greetingText} · Karachi
          </div>
          <h1 className="font-display italic mt-3 text-[32px] sm:text-[52px] lg:text-[64px] leading-[1.2] sm:leading-[1.05] pb-1">
            Hey, {firstName}.
            <br />
            <span style={{ color: 'var(--forest-300)' }}>What's for dinner?</span>
          </h1>
          <p className="mt-5 text-base max-w-md" style={{ color: 'var(--cream-200)', opacity: 0.9 }}>
            Sealed, frozen, and delivered cold from verified home kitchens across the city.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/products">
              <Button size="lg">Browse today's plates</Button>
            </Link>
            <Link href="/orders">
              <Button size="lg" variant="outline" style={{ color: 'var(--cream-50)', borderColor: 'var(--ink-300)' }}>
                Order history
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ACTIVE ORDER */}
      {activeOrder && (
        <Link href={`/orders/${activeOrder.id}`} className="block mb-8">
          <div
            className="rounded-2xl p-5 transition-shadow hover:shadow-md flex items-center gap-5"
            style={{ background: 'var(--paper-0)', border: '1px solid var(--forest-200)' }}
          >
            <div
              className="w-12 h-12 rounded-full flex-shrink-0 grid place-items-center"
              style={{ background: 'var(--forest-50)', color: 'var(--forest-700)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5" /><path d="M21 3l-7 7" /><path d="M8 21H3v-5" /><path d="M3 21l7-7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="eyebrow" style={{ color: 'var(--forest-700)' }}>Live tracking</div>
              <p className="mt-1 font-semibold" style={{ color: 'var(--ink-900)' }}>
                Order #{activeOrder.orderNumber}
              </p>
              <p className="text-sm" style={{ color: 'var(--ink-500)' }}>
                {activeOrder.orderStatus.replace('_', ' ')} · {activeOrder.itemsCount} items
              </p>
            </div>
            <div className="text-right">
              <p className="price text-base" style={{ color: 'var(--ink-900)' }}>
                {formatPrice(activeOrder.totalAmount)}
              </p>
              <span className="text-sm inline-flex items-center gap-1 mt-1" style={{ color: 'var(--forest-700)' }}>
                Track <ArrowRight />
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* PROMOS */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="eyebrow">Limited offers</div>
            <h2 className="font-display italic text-[28px] sm:text-[32px] mt-1" style={{ color: 'var(--ink-900)' }}>
              Hot deals
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PROMOS.map((p) => <PromoTile key={p.code} promo={p} />)}
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="mb-10">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="eyebrow">Tonight's craving</div>
            <h2 className="font-display italic text-[28px] sm:text-[32px] mt-1" style={{ color: 'var(--ink-900)' }}>
              What's on your mind?
            </h2>
          </div>
          <Link href="/products" className="hidden sm:inline-flex items-center gap-2 text-sm font-medium"
                style={{ color: 'var(--forest-700)' }}>
            See all <ArrowRight />
          </Link>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {CATEGORIES.map((cat) => (
            <Link key={cat.name} href={cat.href} className="group block">
              <div
                className="aspect-square rounded-2xl overflow-hidden relative transition-transform group-hover:-translate-y-1"
                style={{ background: 'var(--cream-100)', boxShadow: 'var(--shadow-xs)' }}
              >
                <img
                  src={cat.photo}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              <p className="mt-3 text-sm font-medium text-center" style={{ color: 'var(--ink-900)' }}>
                {cat.name}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* STATS */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-10">
        {[
          { label: 'Total orders', value: String(stats.totalOrders) },
          { label: 'In progress', value: String(stats.pendingOrders) },
          { label: 'Delivered', value: String(stats.completedOrders) },
          { label: 'Lifetime', value: formatPrice(stats.totalSpent) },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-5"
            style={{ background: 'var(--paper-0)', border: '1px solid var(--ink-100)' }}
          >
            <div className="eyebrow">{s.label}</div>
            <div className="font-display italic text-[32px] sm:text-[40px] mt-2 leading-none" style={{ color: 'var(--ink-900)' }}>
              {s.value}
            </div>
          </div>
        ))}
      </section>

      {/* RECENT ORDERS + QUICK LINKS */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div
          className="lg:col-span-3 rounded-2xl overflow-hidden"
          style={{ background: 'var(--paper-0)', border: '1px solid var(--ink-100)' }}
        >
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--ink-100)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--ink-900)' }}>Recent orders</h2>
            <Link href="/orders" className="text-sm font-medium" style={{ color: 'var(--forest-700)' }}>
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="font-display italic text-[24px] mb-2" style={{ color: 'var(--ink-900)' }}>
                No orders yet.
              </h3>
              <p className="text-sm mb-5" style={{ color: 'var(--ink-500)' }}>
                Place your first order today.
              </p>
              <Link href="/products">
                <Button>Start shopping</Button>
              </Link>
            </div>
          ) : (
            <ul>
              {recentOrders.slice(0, 4).map((order) => (
                <li key={order.id} style={{ borderTop: '1px solid var(--ink-100)' }}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="block p-5 transition-colors hover:bg-[var(--cream-100)]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold" style={{ color: 'var(--ink-900)' }}>
                          #{order.orderNumber}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--ink-500)' }}>
                          {order.itemsCount} items ·{' '}
                          {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="price text-[15px]" style={{ color: 'var(--ink-900)' }}>
                          {formatPrice(order.totalAmount)}
                        </p>
                        <span
                          className="eyebrow inline-block mt-1"
                          style={{ color: 'var(--forest-700)' }}
                        >
                          {order.orderStatus.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 space-y-3">
          {[
            { href: '/products', title: 'Browse menu', sub: '100+ frozen items' },
            { href: '/cart', title: 'Your bag', sub: 'View items' },
            { href: '/profile/addresses', title: 'Addresses', sub: 'Manage locations' },
            { href: '/support', title: 'Support', sub: 'Help center' },
          ].map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="block rounded-2xl p-5 transition-colors hover:bg-[var(--cream-100)]"
              style={{ background: 'var(--paper-0)', border: '1px solid var(--ink-100)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold" style={{ color: 'var(--ink-900)' }}>{q.title}</p>
                  <p className="text-sm" style={{ color: 'var(--ink-500)' }}>{q.sub}</p>
                </div>
                <span style={{ color: 'var(--ink-400)' }}><ArrowRight /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </DashboardLayout>
  );
}
