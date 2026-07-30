'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { BrandLockup, Mark } from '@/components/ui/Mark';

const HERO_PHOTO =
  'https://images.unsplash.com/photo-1543353071-873f17a7a088?w=1200&q=80&auto=format&fit=crop';
const FEATURED_PHOTO =
  'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=900&q=80&auto=format&fit=crop';
const SPICES_PHOTO =
  'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=900&q=80&auto=format&fit=crop';

type Plate = {
  href: string;
  kitchen: string;
  name: string;
  note: string;
  price: string;
  rating: string;
  photo: string;
};

const PLATES: Plate[] = [
  {
    href: '/products?productType=frozen',
    kitchen: 'Saima’s · Gulshan',
    name: 'Hand-rolled aloo paratha',
    note: 'Today’s bestseller',
    price: 'PKR 480',
    rating: '4.8',
    photo:
      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&q=80&auto=format&fit=crop',
  },
  {
    href: '/products?productType=ready_to_eat',
    kitchen: 'Naseem · DHA',
    name: 'Sindhi dum biryani',
    note: 'Cooked Saturday morning',
    price: 'PKR 850',
    rating: '4.9',
    photo:
      'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=700&q=80&auto=format&fit=crop',
  },
  {
    href: '/products?productType=ready_to_cook',
    kitchen: 'Phupo Asma · PECHS',
    name: 'Slow-cooked beef nihari',
    note: '12-hour braise',
    price: 'PKR 1,100',
    rating: '4.7',
    photo:
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=700&q=80&auto=format&fit=crop',
  },
];

const PANTRY: Plate[] = [
  {
    href: '/products?productType=frozen',
    kitchen: 'Fareeha’s',
    name: 'Samosa pack',
    note: '',
    price: 'PKR 360',
    rating: '4.6',
    photo:
      'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&q=80&auto=format&fit=crop',
  },
  {
    href: '/products?productType=frozen',
    kitchen: 'Ammi’s Sunday',
    name: 'Daal makhani',
    note: '',
    price: 'PKR 620',
    rating: '4.7',
    photo:
      'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&q=80&auto=format&fit=crop',
  },
  {
    href: '/products?productType=frozen',
    kitchen: 'Phupo Asma',
    name: 'Kheer · cardamom',
    note: '',
    price: 'PKR 480',
    rating: '4.8',
    photo:
      'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600&q=80&auto=format&fit=crop',
  },
  {
    href: '/products?productType=frozen',
    kitchen: 'Burns Road Home',
    name: 'Halwa puri',
    note: '',
    price: 'PKR 540',
    rating: '4.7',
    photo:
      'https://images.unsplash.com/photo-1604152135912-04a022e23696?w=600&q=80&auto=format&fit=crop',
  },
];

function StarIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function SparkleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  );
}

function PinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function HeartIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ArrowRight({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function SectionHead({
  eyebrow,
  title,
  subtitle,
  more,
  href,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  more?: string;
  href?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2
          className="font-display mt-3 text-[44px] md:text-[56px]"
          style={{ color: 'var(--ink-900)' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-3 max-w-md text-sm" style={{ color: 'var(--ink-500)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {more && href && (
        <Link
          href={href}
          className="hidden md:inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap"
          style={{ color: 'var(--forest-600)' }}
        >
          {more} <ArrowRight />
        </Link>
      )}
    </div>
  );
}

function DishCard({ dish }: { dish: Plate }) {
  return (
    <Link
      href={dish.href}
      className="group block"
    >
      <div
        className="relative overflow-hidden rounded-2xl transition-transform group-hover:-translate-y-1"
        style={{
          aspectRatio: '5 / 6',
          background: 'var(--cream-100)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <img
          src={dish.photo}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span
          className="absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-transform group-hover:scale-105"
          style={{
            background: 'var(--cream-50)',
            color: 'var(--ink-900)',
            boxShadow: '0 8px 16px -4px rgba(0,0,0,0.15)',
          }}
        >
          + Add to bag
        </span>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">{dish.kitchen}</div>
          <h3
            className="font-display mt-1 text-[24px] leading-tight"
            style={{ color: 'var(--ink-900)', fontStyle: 'normal', fontWeight: 400 }}
          >
            {dish.name}
          </h3>
          <p
            className="mt-1 text-sm italic"
            style={{ color: 'var(--ink-500)', fontFamily: 'var(--font-display)', fontWeight: 300 }}
          >
            {dish.note}
          </p>
        </div>
        <div className="text-right">
          <div className="price text-base">{dish.price}</div>
          <div
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: 'var(--gold-600)' }}
          >
            <StarIcon /> {dish.rating}
          </div>
        </div>
      </div>
    </Link>
  );
}

function PantryCard({ item }: { item: Plate }) {
  return (
    <Link href={item.href} className="group block">
      <div
        className="relative overflow-hidden rounded-2xl transition-transform group-hover:-translate-y-1"
        style={{
          aspectRatio: '1 / 1',
          background: 'var(--cream-100)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <img
          src={item.photo}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="mt-3">
        <div className="eyebrow">{item.kitchen}</div>
        <h4 className="mt-1 text-[15px] font-medium" style={{ color: 'var(--ink-900)' }}>
          {item.name}
        </h4>
        <div className="price mt-1 text-[13px]" style={{ color: 'var(--ink-700)' }}>
          {item.price}
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated && user) {
      const userType = user.userType || user.user_type;
      if (userType === 'admin') router.push('/admin/dashboard');
      else if (userType === 'seller') router.push('/sellers/dashboard');
      else if (userType === 'rider') router.push('/riders/dashboard');
      else router.push('/dashboard');
    }
  }, [isAuthenticated, user, router]);

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream-50)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--forest-500)' }} />
          <p style={{ color: 'var(--ink-500)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--cream-50)', color: 'var(--ink-900)', minHeight: '100vh' }}>
      {/* ===== HEADER ===== */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md"
        style={{
          background: 'rgba(251,248,241,0.94)',
          borderBottom: '1px solid var(--ink-100)',
        }}
      >
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 h-[72px] grid grid-cols-[auto_1fr_auto] items-center gap-6">
          <Link href="/">
            <BrandLockup markSize={32} wordSize={26} />
          </Link>
          <nav className="hidden md:flex items-center gap-7 justify-center">
            <Link href="/products" className="text-[13px] font-medium tracking-tight" style={{ color: 'var(--ink-800)' }}>
              Today's plates
            </Link>
            <Link href="/products?productType=frozen" className="text-[13px] font-medium tracking-tight" style={{ color: 'var(--ink-800)' }}>
              Pantry
            </Link>
            <Link href="/products?productType=fresh" className="text-[13px] font-medium tracking-tight" style={{ color: 'var(--ink-800)' }}>
              Fresh
            </Link>
            <Link href="/sellers/register" className="text-[13px] font-medium tracking-tight" style={{ color: 'var(--ink-800)' }}>
              Sell with us
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <span
              className="hidden md:inline-flex items-center gap-2 h-10 px-3.5 rounded-full text-[13px] font-medium"
              style={{ border: '1px solid var(--ink-200)', color: 'var(--ink-800)' }}
            >
              <span style={{ color: 'var(--forest-600)' }}><PinIcon /></span>
              DHA Phase 5
            </span>
            <Link
              href="/login"
              className="h-10 inline-flex items-center px-4 rounded-full text-[13px] font-medium"
              style={{ color: 'var(--ink-800)' }}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="h-10 inline-flex items-center px-5 rounded-full text-[13px] font-medium"
              style={{ background: 'var(--ink-900)', color: 'var(--cream-50)' }}
            >
              Join Nuray
            </Link>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="px-6 md:px-12 pt-8 md:pt-10">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-stretch">
          <div className="flex flex-col justify-center pr-2 lg:pr-6 min-h-[420px]">
            <div className="eyebrow">This week's home · Karachi</div>
            <h1
              className="font-display mt-4 text-[56px] sm:text-[68px] lg:text-[80px] leading-[1.02]"
              style={{ color: 'var(--ink-900)' }}
            >
              The taste of
              <br />
              <span style={{ color: 'var(--forest-600)' }}>home,</span>
              <br />
              delivered.
            </h1>
            <p className="mt-7 max-w-[480px] text-[17px] leading-[1.55]" style={{ color: 'var(--ink-600)' }}>
              Sealed, frozen, and delivered cold from verified home kitchens across Karachi. Hand-rolled, slow-cooked, and signed by the cook.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 h-12 px-6 rounded-full text-[14px] font-medium"
                style={{ background: 'var(--ink-900)', color: 'var(--cream-50)' }}
              >
                Browse today's plates <ArrowRight />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 h-12 px-6 rounded-full text-[14px] font-medium"
                style={{ border: '1px solid var(--ink-300)', color: 'var(--ink-900)' }}
              >
                How it works
              </Link>
            </div>

            <div
              className="mt-14 pt-7 flex flex-wrap gap-9"
              style={{ borderTop: '1px solid var(--ink-200)' }}
            >
              {[
                { n: '180+', l: 'verified kitchens' },
                { n: '3', l: 'Karachi hubs' },
                { n: '−18°', l: 'cold-chain' },
              ].map((s) => (
                <div key={s.l}>
                  <div className="font-display text-[36px]" style={{ color: 'var(--forest-700)' }}>
                    {s.n}
                  </div>
                  <div className="eyebrow mt-1.5">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-[20px]"
            style={{ background: 'var(--cream-100)', minHeight: 480 }}
          >
            <img
              src={HERO_PHOTO}
              alt="Hands of a home cook"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(26,22,16,0.5) 0%, rgba(26,22,16,0.1) 50%, transparent 100%)',
              }}
            />
            <div
              className="absolute top-5 left-5 inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[11px] uppercase tracking-[0.14em] font-semibold backdrop-blur-md"
              style={{ background: 'rgba(251,248,241,0.92)', color: 'var(--forest-700)' }}
            >
              <span style={{ color: 'var(--gold-500)' }}><SparkleIcon /></span>
              Featured this week
            </div>
            <div className="absolute left-6 bottom-6 right-6" style={{ color: 'var(--cream-50)' }}>
              <div className="text-[11px] uppercase tracking-[0.14em] font-semibold opacity-85">
                Saima's Kitchen · Gulshan
              </div>
              <h3 className="font-display mt-1.5 text-[28px] sm:text-[36px] leading-[1]">
                Hand-rolled parathas,
                <br />
                at six in the morning.
              </h3>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TODAY'S PLATES ===== */}
      <section className="px-6 md:px-12 pt-24 md:pt-32">
        <div className="max-w-[1440px] mx-auto">
          <SectionHead
            eyebrow="On the menu today"
            title="Today's plates"
            subtitle="Curated by our team every morning"
            more="Show all dishes"
            href="/products"
          />
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLATES.map((d) => (
              <DishCard key={d.name} dish={d} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== PROMISE ===== */}
      <section className="px-6 md:px-12 pt-24 md:pt-32">
        <div className="max-w-[1440px] mx-auto">
          <div
            className="relative overflow-hidden rounded-[24px] p-10 md:p-16 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-14 items-center"
            style={{ background: 'var(--ink-900)', color: 'var(--cream-50)' }}
          >
            <div
              aria-hidden
              className="absolute -top-24 -right-24 w-[400px] h-[400px] rounded-full"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(10,122,58,0.35), transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="eyebrow" style={{ color: 'var(--forest-300)' }}>
                The Nuray promise
              </div>
              <h2
                className="font-display mt-4 text-[42px] md:text-[56px] leading-[1.04]"
                style={{ color: 'var(--cream-50)' }}
              >
                Sealed at the source.
                <br />
                <span style={{ color: 'var(--forest-300)' }}>Inspected at the hub.</span>
              </h2>
              <p
                className="mt-5 max-w-[480px] text-base leading-[1.55]"
                style={{ color: 'var(--cream-200)', opacity: 0.9 }}
              >
                Every dish is weighed, smelled, photographed, and re-frozen at one of our Karachi hubs before it goes out for delivery. Real cooks. Real cold chain. No middlemen.
              </p>
              <Link
                href="/sellers"
                className="mt-7 inline-flex items-center gap-2 h-12 px-6 rounded-full text-[14px] font-medium"
                style={{ background: 'var(--forest-500)', color: 'var(--cream-50)' }}
              >
                Take a hub tour <ArrowRight />
              </Link>
            </div>
            <div
              className="relative overflow-hidden rounded-2xl aspect-square"
            >
              <img
                src={SPICES_PHOTO}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== PANTRY ===== */}
      <section className="px-6 md:px-12 pt-24 md:pt-32">
        <div className="max-w-[1440px] mx-auto">
          <SectionHead
            eyebrow="Stock the freezer"
            title="Pantry essentials"
            subtitle="Packs that hold for weeks, perfect for busy days"
            more="Browse pantry"
            href="/products?productType=frozen"
          />
          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-5">
            {PANTRY.map((p) => (
              <PantryCard key={p.name} item={p} />
            ))}
          </div>
        </div>
      </section>

      {/* ===== TRUST STRIP ===== */}
      <section className="px-6 md:px-12 pt-24 md:pt-32">
        <div
          className="max-w-[1440px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 py-10"
          style={{ borderTop: '1px solid var(--ink-200)' }}
        >
          {[
            { i: <SparkleIcon size={18} />, h: 'Verified home cooks', b: 'We meet every cook. We taste every dish.' },
            { i: <PinIcon size={18} />, h: 'Karachi hub network', b: 'Three hubs · 8 km radius · −18°C end-to-end.' },
            { i: <HeartIcon size={18} />, h: 'Money-back promise', b: 'Not happy with a dish? Full refund, no questions.' },
            { i: <StarIcon size={18} />, h: 'Real reviews, real photos', b: 'Verified buyers only. We never delete bad reviews.' },
          ].map((v) => (
            <div key={v.h} className="flex flex-col gap-2.5">
              <div
                className="w-11 h-11 rounded-xl grid place-items-center"
                style={{ background: 'var(--cream-100)', color: 'var(--forest-600)' }}
              >
                {v.i}
              </div>
              <h4 className="mt-1 text-base font-semibold" style={{ color: 'var(--ink-900)' }}>
                {v.h}
              </h4>
              <p className="text-[13px] leading-[1.55]" style={{ color: 'var(--ink-600)' }}>
                {v.b}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="mt-20" style={{ background: 'var(--cream-100)' }}>
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <Mark size={36} />
                <span
                  className="font-display italic"
                  style={{ fontSize: 30, color: 'var(--ink-900)', fontWeight: 400 }}
                >
                  nuray
                </span>
              </div>
              <p className="text-sm leading-[1.55] max-w-[300px]" style={{ color: 'var(--ink-600)' }}>
                Pakistan's first frozen homemade marketplace. Sealed, frozen, and delivered cold from verified home kitchens.
              </p>
            </div>
            {[
              { h: 'Shop', l: [['Today’s plates', '/products'], ['Pantry', '/products?productType=frozen'], ['Fresh daily', '/products?productType=fresh']] },
              { h: 'Partners', l: [['Become a cook', '/register'], ['Hub network', '/sellers']] },
              { h: 'Help', l: [['Track order', '/orders'], ['Support', '/support']] },
            ].map((c) => (
              <div key={c.h}>
                <div className="eyebrow mb-3.5">{c.h}</div>
                <div className="flex flex-col gap-2.5">
                  {c.l.map(([label, href]) => (
                    <Link key={label} href={href} className="text-[13px]" style={{ color: 'var(--ink-800)' }}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div
            className="mt-14 pt-6 flex flex-col sm:flex-row justify-between gap-3 text-xs"
            style={{ borderTop: '1px solid var(--ink-200)', color: 'var(--ink-500)' }}
          >
            <span>© 2026 Nuray · Made in Karachi</span>
            <span>JazzCash · EasyPaisa · Visa · COD</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
