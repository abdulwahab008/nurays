import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/**
 * What search engines may read. Without a site address (NEXT_PUBLIC_SITE_URL: development, staging) nothing is offered,
 * so a test site never ends up in a search result. On the real site the public pages are open, and what belongs to a
 * signed-in person or to staff is not.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  if (!base) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/sellers/register'],
      disallow: [
        '/admin',
        '/api',
        '/cart',
        '/checkout',
        '/dashboard',
        '/delete-account',
        '/dev-login',
        '/favorites',
        '/forgot-password',
        '/hub',
        '/notifications',
        '/orders',
        '/payment',
        '/profile',
        '/reset-password',
        '/riders',
        '/sellers/',
        '/support',
        '/verify-email',
        '/wallet',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
