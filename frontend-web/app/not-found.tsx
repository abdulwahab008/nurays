import Link from 'next/link';
import { BrandLockup } from '@/components/ui/Mark';
import { NOT_FOUND_METADATA } from '@/lib/seo';

export const metadata = NOT_FOUND_METADATA;

/** An address that leads nowhere: say so, and offer the places a visitor most likely wanted. */
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-4 sm:px-8 py-4 border-b border-line bg-surface">
        <Link href="/" aria-label="Nuray home" className="inline-flex">
          <BrandLockup markSize={32} wordSize={22} />
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center bg-surface border border-line rounded-[24px] p-8 sm:p-10">
          <p className="inline-flex px-3 py-1 rounded-full bg-accent-soft text-accent-soft-ink text-sm font-extrabold">404</p>
          <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight text-ink">This page could not be found</h1>
          <p className="mt-2 text-sm text-muted">
            The address may have a typo, or the dish, the kitchen or the page may have been taken down.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/" className="inline-flex items-center h-11 px-5 rounded-xl bg-brand text-on-brand text-sm font-extrabold hover:bg-brand-500">
              Home
            </Link>
            <Link href="/products" className="inline-flex items-center h-11 px-4 rounded-xl border border-line-strong text-sm font-bold text-ink hover:bg-raised">
              Browse dishes
            </Link>
            <Link href="/kitchens" className="inline-flex items-center h-11 px-4 rounded-xl border border-line-strong text-sm font-bold text-ink hover:bg-raised">
              Kitchens
            </Link>
            <Link href="/help" className="inline-flex items-center h-11 px-4 rounded-xl border border-line-strong text-sm font-bold text-ink hover:bg-raised">
              Help
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
