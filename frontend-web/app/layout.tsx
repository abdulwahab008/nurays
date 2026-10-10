import { ImageFallback } from '@/components/ImageFallback';
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/AuthProvider";
import { RoleNotifications } from "@/components/RoleNotifications";
import { LocaleProvider } from "@/lib/i18n";
import { DEFAULT_LOCALE, dirFor, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import "./fonts/fonts.css";
import "./globals.css";

// Phones: scale to the screen, tint the browser bar, and reach under the notch (pages keep their own padding).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FF5500',
};

export const metadata: Metadata = {
  appleWebApp: { capable: true, title: 'Nuray', statusBarStyle: 'default' },
  icons: { apple: '/brand/icon-192.png' },
  title: "Nuray | Home-cooked food from kitchens in your community",
  description: "Order fresh and frozen home-cooked food from verified home kitchens in your community, for delivery or pickup.",
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
