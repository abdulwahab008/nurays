import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/AuthProvider";
import { SellerNewOrderNotification } from "@/components/SellerNewOrderNotification";
import { CustomerOrderNotification } from "@/components/CustomerOrderNotification";
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

export const metadata: Metadata = {
  title: "Nuray Food & Frost | Pakistan's Unorthodox Food & Cold-Chain Delivery",
  description: "Express hot homemade meals & sub-zero -18°C frozen packs delivered straight from verified home kitchens in Karachi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${plusJakartaSans.variable} ${geistMono.variable} font-sans antialiased bg-[#FAFAFA] text-[#0F172A] selection:bg-[#FF5500] selection:text-white`}
      >
        <ToastProvider>
          <AuthProvider>
            <SellerNewOrderNotification />
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
      </body>
    </html>
  );
}
