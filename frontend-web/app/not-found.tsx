import Link from 'next/link';
import { BrandLockup } from '@/components/ui/Mark';
import { NOT_FOUND_METADATA } from '@/lib/seo';

export const metadata = NOT_FOUND_METADATA;

/** An address that leads nowhere: say so, and offer the places a visitor most likely wanted. */
export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-4 sm:px-8 py-4 border-b border-slate-200 bg-white">
        <Link href="/" aria-label="Nuray home" className="inline-flex">
          <BrandLockup markSize={32} wordSize={22} />
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <p className="text-sm font-bold text-brand-ink">404</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">This page could not be found</h1>
          <p className="mt-2 text-sm text-slate-600">
            The address may have a typo, or the dish, the kitchen or the page may have been taken down.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/" className="px-4 py-2 rounded-xl bg-brand text-on-brand text-sm font-semibold hover:bg-brand-500">
              Home
            </Link>
            <Link href="/products" className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Browse dishes
            </Link>
            <Link href="/kitchens" className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Kitchens
            </Link>
            <Link href="/help" className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Help
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
