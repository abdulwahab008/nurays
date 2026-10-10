import { ImageFallback } from '@/components/ImageFallback';
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/AuthProvider";
import { RoleNotifications } from "@/components/RoleNotifications";
import { LocaleProvider } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";
import { DEFAULT_LOCALE, dirFor, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import "./fonts/fonts.css";
import "./globals.css";

// Phones: scale to the screen, tint the browser bar, and reach under the notch. Fixed and sticky bars keep clear of the notch, the
// status bar and the home indicator with the --safe-* variables in globals.css.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FF5500',
};

const SITE_TITLE = "Nuray | Home-cooked food from kitchens in your community";
const SITE_DESCRIPTION = "Order fresh and frozen home-cooked food from verified home kitchens in your community, for delivery or pickup.";
const site = siteUrl();

export const metadata: Metadata = {
  // The site's address (NEXT_PUBLIC_SITE_URL) makes the preview image of a shared link absolute; without it there is no image,
  // and search engines are told to stay away (a test site must not turn up in a search).
  ...(site ? { metadataBase: new URL(site) } : { robots: { index: false, follow: false } }),
  appleWebApp: { capable: true, title: 'Nuray', statusBarStyle: 'default' },
  icons: { apple: '/brand/icon-192.png' },
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'Nuray',
    locale: 'en_PK',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    ...(site ? { images: [{ url: '/brand/icon-512.png', width: 512, height: 512, alt: 'Nuray' }] } : {}),
  },
  twitter: { card: 'summary', title: SITE_TITLE, description: SITE_DESCRIPTION },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={dirFor(locale)} className="scroll-smooth">
      <body
        className="font-sans antialiased bg-[#FAFAFA] text-[#0F172A] selection:bg-[#FF5500] selection:text-white"
      >
        <LocaleProvider initialLocale={locale}>
        <ToastProvider>
          <AuthProvider>
            <ImageFallback />
            <RoleNotifications />
            {googleClientId ? (
              <GoogleOAuthProvider clientId={googleClientId}>
                {children}
              </GoogleOAuthProvider>
            ) : (
              children
            )}
          </AuthProvider>
        </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
