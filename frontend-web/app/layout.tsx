import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/AuthProvider";
import { SellerNewOrderNotification } from "@/components/SellerNewOrderNotification";
import { CustomerOrderNotification } from "@/components/CustomerOrderNotification";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nuray - Homemade Food Marketplace",
  description: "Buy and sell homemade food in Pakistan - frozen, fresh, ready-to-eat and daily meals",
  applicationName: "Nuray",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Nuray" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f23e02" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
};

// No-FOUC theme init: set .dark before first paint from saved choice / system.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <style
          // Design tokens — inlined so they bypass Tailwind's @layer pipeline,
          // which was dropping our :root block during dev compilation.
          dangerouslySetInnerHTML={{
            __html: `:root{color-scheme:light;--brand-50:#fff3ed;--brand-100:#ffe3d4;--brand-200:#ffc4a6;--brand-300:#ff9d70;--brand-400:#ff6f3c;--brand-500:#f23e02;--brand-600:#d83502;--brand-700:#b32907;--brand-800:#8f230c;--brand-900:#74200e;--forest-50:#fff3ed;--forest-100:#ffe3d4;--forest-200:#ffc4a6;--forest-300:#ff9d70;--forest-400:#ff6f3c;--forest-500:#f23e02;--forest-600:#d83502;--forest-700:#b32907;--forest-800:#8f230c;--forest-900:#74200e;--gold-400:#f7b733;--gold-500:#f5a623;--gold-600:#d4880f;--anar-50:#fdeaea;--anar-100:#fdeaea;--anar-200:#f3b4b4;--anar-500:#e5333b;--anar-600:#c81e25;--anar-700:#a3161c;--ink-50:#ececef;--ink-100:#f1f1f3;--ink-200:#ececef;--ink-300:#dededf;--ink-400:#ababb3;--ink-500:#8a8a93;--ink-600:#6a6a73;--ink-700:#2b2b30;--ink-800:#17171a;--ink-900:#17171a;--cream-50:#f6f6f7;--cream-100:#f1f1f3;--cream-200:#ececef;--cream-300:#ececef;--paper-0:#ffffff;--bg-page:#f6f6f7;--bg-card:#ffffff;--bg-raised:#f1f1f3;--bg-inverse:#17171a;--fg-default:#17171a;--fg-muted:#6a6a73;--fg-subtle:#8a8a93;--fg-faint:#ababb3;--fg-inverse:#ffffff;--border-hair:#ececef;--border-rule:#dededf;--border-strong:#17171a;--accent:#f23e02;--accent-soft:#fff3ed;--accent-deep:#b32907;--shadow-xs:0 1px 2px 0 rgba(17,17,20,.04);--shadow-sm:0 2px 8px -4px rgba(17,17,20,.10),0 1px 2px -1px rgba(17,17,20,.05);--shadow-md:0 12px 24px -8px rgba(17,17,20,.12),0 4px 8px -2px rgba(17,17,20,.06);--shadow-lg:0 28px 48px -16px rgba(17,17,20,.18),0 8px 16px -4px rgba(17,17,20,.08);--font-display:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--font-ui:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--font-mono:'Geist Mono',ui-monospace,Menlo,monospace;--font-serif:'Fraunces','Times New Roman',Georgia,serif}.dark{color-scheme:dark;--brand-50:#2c160d;--brand-100:#3a1d12;--brand-600:#ff7a45;--brand-700:#ff8d5e;--forest-50:#2c160d;--forest-100:#3a1d12;--forest-600:#ff7a45;--forest-700:#ff8d5e;--anar-50:#2c1416;--anar-100:#2c1416;--ink-50:#28282e;--ink-100:#232328;--ink-200:#2a2a30;--ink-300:#36363d;--ink-400:#6e6e77;--ink-500:#8b8b94;--ink-600:#a9a9b2;--ink-700:#e6e6ea;--ink-800:#f6f6f8;--ink-900:#f6f6f8;--cream-50:#0f0f11;--cream-100:#232328;--cream-200:#28282e;--cream-300:#2a2a30;--paper-0:#1a1a1e;--bg-page:#0f0f11;--bg-card:#1a1a1e;--bg-raised:#232328;--bg-inverse:#f6f6f8;--fg-default:#f6f6f8;--fg-muted:#a9a9b2;--fg-subtle:#8b8b94;--fg-faint:#6e6e77;--fg-inverse:#17171a;--border-hair:#2a2a30;--border-rule:#36363d;--border-strong:#f6f6f8;--accent:#f23e02;--accent-soft:#2c160d;--accent-deep:#ff8d5e;--shadow-xs:0 1px 2px 0 rgba(0,0,0,.4);--shadow-sm:0 2px 8px -4px rgba(0,0,0,.5),0 1px 2px -1px rgba(0,0,0,.4);--shadow-md:0 12px 24px -8px rgba(0,0,0,.55),0 4px 8px -2px rgba(0,0,0,.4);--shadow-lg:0 28px 48px -16px rgba(0,0,0,.65),0 8px 16px -4px rgba(0,0,0,.45)}
html,body{font-family:var(--font-ui);background:var(--bg-page);color:var(--fg-default);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}.display,.font-display{font-family:var(--font-display);font-weight:800;font-style:normal;line-height:1.08;letter-spacing:-.03em}.eyebrow{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.14em;color:var(--fg-subtle)}.price,.font-mono{font-family:var(--font-mono);font-feature-settings:'tnum' on;font-weight:600;color:var(--fg-default)}.brand-mark{display:inline-grid;place-items:center;position:relative;flex:0 0 auto;border-radius:9999px;background:var(--brand-500);color:#fff}.brand-mark::before{content:'';position:absolute;inset:2px;border:1px dashed rgba(255,255,255,.4);border-radius:50%}.brand-mark>span{font-family:var(--font-serif);font-style:italic;font-weight:400;line-height:1;letter-spacing:-.04em;position:relative}::selection{background:var(--brand-200);color:var(--brand-900)}
/* === Nuray button + form utility classes (Tailwind-independent) === */
.nuray-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 24px;border-radius:9999px;font-family:var(--font-ui);font-size:14px;font-weight:600;letter-spacing:-.005em;cursor:pointer;transition:all .2s var(--ease-out,cubic-bezier(.2,.6,.2,1));border:0;text-decoration:none}
.nuray-btn-sm{height:36px;padding:0 16px;font-size:13px}
.nuray-btn-lg{height:52px;padding:0 28px;font-size:15px}
.nuray-btn-primary{background:var(--brand-500);color:#fff}
.nuray-btn-primary:hover{background:var(--brand-600)}
.nuray-btn-dark{background:var(--bg-inverse);color:var(--fg-inverse)}
.nuray-btn-dark:hover{opacity:.9}
.nuray-btn-outline{background:transparent;color:var(--fg-default);border:1px solid var(--border-rule)}
.nuray-btn-outline:hover{background:var(--bg-raised);border-color:var(--ink-400)}
.nuray-btn-ghost{background:transparent;color:var(--accent-deep)}
.nuray-btn-ghost:hover{background:var(--accent-soft)}
.nuray-btn-destructive{background:var(--anar-500);color:#fff}
.nuray-btn-destructive:hover{background:var(--anar-600)}
.nuray-btn:disabled{opacity:.5;pointer-events:none}
.nuray-card{background:var(--bg-card);border-radius:16px;box-shadow:var(--shadow-md)}
.nuray-card-flat{background:var(--bg-card);border-radius:14px;border:1px solid var(--border-hair)}
.nuray-input{width:100%;height:44px;padding:0 16px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border-rule);color:var(--fg-default);font-family:var(--font-ui);font-size:15px;outline:none;transition:border-color .2s var(--ease-out,cubic-bezier(.2,.6,.2,1))}
.nuray-input:focus{border-color:var(--brand-500);box-shadow:0 0 0 3px rgba(242,62,2,.15)}
.nuray-input-otp{text-align:center;font-size:24px;letter-spacing:.4em}
.nuray-bg-cream{background:var(--bg-page)}
.nuray-bg-paper{background:var(--bg-card)}
.nuray-bg-ink{background:var(--bg-inverse);color:var(--fg-inverse)}
.nuray-text-forest{color:var(--accent-deep)}
.nuray-text-muted{color:var(--fg-subtle)}
.nuray-text-ink{color:var(--fg-default)}
.nuray-link{color:var(--accent-deep);font-weight:500;text-decoration:none}
.nuray-link:hover{color:var(--accent);text-decoration:underline}
.nuray-divider{border-top:1px solid var(--border-hair)}
.nuray-w-card-sm{max-width:440px;width:100%}
.nuray-w-card-md{max-width:480px;width:100%}
.nuray-nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg-page) 85%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border-hair)}
.nuray-section-bg{background:var(--bg-page)}
.nuray-drawer{transform:translateX(-100%);transition:transform .2s var(--ease-out,cubic-bezier(.2,.6,.2,1))}
.nuray-drawer[data-open="true"]{transform:translateX(0)}
@media(min-width:1024px){.nuray-drawer{transform:translateX(0)!important}}
/* === Legacy Tailwind color remap → brand tokens (now theme-aware, flip in dark) === */
.bg-gray-50{background-color:var(--cream-50)!important}
.bg-gray-100{background-color:var(--cream-100)!important}
.bg-gray-200{background-color:var(--cream-200)!important}
.bg-white{background-color:var(--paper-0)!important}
.bg-green-50{background-color:var(--accent-soft)!important}
.bg-green-100{background-color:var(--forest-100)!important}
.bg-green-500,.bg-green-600{background-color:var(--brand-500)!important}
.bg-green-700{background-color:var(--brand-600)!important}
.bg-green-800{background-color:var(--brand-700)!important}
.bg-gray-700,.bg-gray-800,.bg-gray-900{background-color:var(--bg-inverse)!important;color:var(--fg-inverse)}
.hover\\:bg-green-700:hover{background-color:var(--brand-600)!important}
.hover\\:bg-green-600:hover{background-color:var(--brand-600)!important}
.hover\\:bg-green-50:hover{background-color:var(--accent-soft)!important}
.hover\\:bg-gray-50:hover{background-color:var(--cream-100)!important}
.hover\\:bg-gray-100:hover{background-color:var(--cream-200)!important}
.hover\\:bg-gray-800:hover{background-color:var(--ink-800)!important}
.text-gray-400{color:var(--ink-400)!important}
.text-gray-500{color:var(--ink-500)!important}
.text-gray-600{color:var(--ink-600)!important}
.text-gray-700{color:var(--ink-700)!important}
.text-gray-800{color:var(--ink-800)!important}
.text-gray-900{color:var(--ink-900)!important}
.text-green-500,.text-green-600{color:var(--accent)!important}
.text-green-700,.text-green-800{color:var(--accent-deep)!important}
.hover\\:text-green-600:hover{color:var(--accent)!important}
.hover\\:text-green-700:hover{color:var(--accent-deep)!important}
.hover\\:text-gray-900:hover{color:var(--ink-900)!important}
.border-gray-100{border-color:var(--ink-100)!important}
.border-gray-200{border-color:var(--ink-200)!important}
.border-gray-300{border-color:var(--ink-300)!important}
.border-green-200{border-color:var(--forest-200)!important}
.border-green-500,.border-green-600{border-color:var(--brand-500)!important}
.from-green-50{--tw-gradient-from:var(--accent-soft)!important}
.to-white{--tw-gradient-to:var(--paper-0)!important}
.ring-green-500{--tw-ring-color:var(--brand-500)!important}
.focus\\:ring-green-500:focus{--tw-ring-color:var(--brand-500)!important}
.focus\\:ring-gray-500:focus{--tw-ring-color:var(--brand-500)!important}
/* Foreign accent colors → brand family for consistency */
.bg-blue-50,.bg-orange-50,.bg-purple-50,.bg-yellow-50,.bg-pink-50,.bg-indigo-50{background-color:var(--cream-100)!important}
.bg-blue-100,.bg-orange-100,.bg-purple-100,.bg-yellow-100,.bg-pink-100,.bg-indigo-100{background-color:var(--cream-200)!important}
.bg-red-50{background-color:var(--anar-50)!important}
.bg-red-100,.bg-red-200{background-color:var(--anar-50)!important}
.bg-red-500,.bg-red-600,.bg-red-700{background-color:var(--anar-500)!important}
.text-red-500,.text-red-600,.text-red-700,.text-red-800{color:var(--anar-500)!important}
.text-blue-500,.text-blue-600,.text-blue-700{color:var(--accent)!important}
.text-orange-500,.text-orange-600,.text-orange-700{color:var(--brand-600)!important}
.text-yellow-500,.text-yellow-600,.text-yellow-700{color:var(--gold-600)!important}
.text-purple-500,.text-purple-600,.text-purple-700{color:var(--ink-800)!important}
.text-pink-500,.text-pink-600,.text-pink-700{color:var(--anar-600)!important}
.text-indigo-500,.text-indigo-600,.text-indigo-700{color:var(--accent)!important}
.bg-blue-500,.bg-blue-600{background-color:var(--brand-500)!important}
.bg-orange-500,.bg-orange-600{background-color:var(--brand-500)!important}
.bg-yellow-500,.bg-yellow-600{background-color:var(--gold-500)!important}
.bg-purple-500,.bg-purple-600,.bg-indigo-500,.bg-indigo-600{background-color:var(--ink-800)!important}
.bg-pink-500,.bg-pink-600{background-color:var(--anar-500)!important}
.border-red-200{border-color:var(--anar-200)!important}
.border-red-300{border-color:var(--anar-200)!important}
.border-blue-100,.border-blue-200,.border-orange-100,.border-orange-200,.border-purple-100,.border-purple-200,.border-yellow-100,.border-yellow-200,.border-pink-100,.border-pink-200,.border-indigo-100,.border-indigo-200{border-color:var(--ink-200)!important}
/* Promo / hero cards keep structure, adopt brand */
[class*="from-green-400"],[class*="from-green-500"],[class*="from-green-600"]{background-image:none!important;background-color:var(--brand-500)!important;color:#fff!important}
/* Light foreign-tinted promo cards → readable neutral surface (keep inner dark text, flips in dark) */
[class~="from-blue-50"],[class~="from-blue-100"],[class~="from-blue-200"],[class~="from-indigo-50"],[class~="from-indigo-100"],[class~="from-purple-50"],[class~="from-purple-100"],[class~="from-violet-50"],[class~="from-violet-100"],[class~="from-orange-50"],[class~="from-orange-100"],[class~="from-yellow-50"],[class~="from-yellow-100"],[class~="from-pink-50"],[class~="from-pink-100"],[class~="from-red-50"],[class~="from-red-100"]{background-image:none!important;background-color:var(--bg-raised)!important}
/* Bold foreign cards → solid brand fill + white text */
[class~="from-blue-400"],[class~="from-blue-500"],[class~="from-blue-600"],[class~="from-blue-700"],[class~="from-indigo-400"],[class~="from-indigo-500"],[class~="from-indigo-600"],[class~="from-purple-400"],[class~="from-purple-500"],[class~="from-purple-600"],[class~="from-purple-700"],[class~="from-violet-500"],[class~="from-violet-600"],[class~="from-orange-400"],[class~="from-orange-500"],[class~="from-orange-600"],[class~="from-orange-700"],[class~="from-yellow-500"],[class~="from-yellow-600"]{background-image:none!important;background-color:var(--brand-500)!important;color:#fff!important}
/* Bold red/pink/rose → semantic error red + white */
[class~="from-red-500"],[class~="from-red-600"],[class~="from-pink-500"],[class~="from-pink-600"],[class~="from-rose-500"],[class~="from-rose-600"]{background-image:none!important;background-color:var(--anar-500)!important;color:#fff!important}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegister />
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
