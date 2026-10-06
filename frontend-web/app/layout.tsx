import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/AuthProvider";
import { SellerNewOrderNotification } from "@/components/SellerNewOrderNotification";
import { RiderNewJobNotification } from "@/components/RiderNewJobNotification";
import { CustomerOrderNotification } from "@/components/CustomerOrderNotification";
import { LocaleProvider } from "@/lib/i18n";
import { DEFAULT_LOCALE, dirFor, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
        className={`${plusJakartaSans.variable} ${geistMono.variable} font-sans antialiased bg-[#FAFAFA] text-[#0F172A] selection:bg-[#FF5500] selection:text-white`}
      >
        <LocaleProvider initialLocale={locale}>
        <ToastProvider>
          <AuthProvider>
            <SellerNewOrderNotification />
            <RiderNewJobNotification />
            <CustomerOrderNotification />
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
