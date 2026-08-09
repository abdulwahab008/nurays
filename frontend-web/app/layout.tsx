import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/AuthProvider";
import { SellerNewOrderNotification } from "@/components/SellerNewOrderNotification";
import { CustomerOrderNotification } from "@/components/CustomerOrderNotification";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  
  return (
    <html lang="en">
      <head>
        <style
          // Design tokens — inlined so they bypass Tailwind's @layer pipeline,
          // which was dropping our :root block during dev compilation.
          dangerouslySetInnerHTML={{
            __html: `:root{--forest-50:#ecf3ec;--forest-100:#d2e3d2;--forest-200:#a4c8a6;--forest-300:#6fa873;--forest-400:#438849;--forest-500:#0a7a3a;--forest-600:#086530;--forest-700:#074f25;--forest-800:#0a3d1d;--forest-900:#082818;--gold-50:#fbf6e9;--gold-100:#f4e7c2;--gold-200:#e8cf85;--gold-300:#d8b153;--gold-400:#c19a3e;--gold-500:#a17e28;--gold-600:#7a5f1d;--gold-700:#574214;--anar-50:#fbeaea;--anar-100:#f4cdcd;--anar-200:#e69b9b;--anar-500:#a8232c;--anar-600:#871a22;--anar-700:#631218;--ink-50:#f5ece0;--ink-100:#ece1ce;--ink-200:#d9cdb6;--ink-300:#b8a98e;--ink-400:#7e7059;--ink-500:#6a5d47;--ink-600:#4e4434;--ink-700:#3a3225;--ink-800:#29231a;--ink-900:#1a1610;--cream-50:#fbf8f1;--cream-100:#f5efe1;--cream-200:#ebe2cc;--cream-300:#ddd0b1;--paper-0:#ffffff;--bg-page:var(--cream-50);--bg-card:var(--paper-0);--bg-raised:var(--cream-100);--bg-inverse:var(--ink-900);--fg-default:var(--ink-900);--fg-muted:var(--ink-600);--fg-subtle:var(--ink-500);--fg-faint:var(--ink-400);--fg-inverse:var(--cream-50);--border-hair:var(--ink-200);--border-rule:var(--ink-300);--border-strong:var(--ink-900);--accent:var(--forest-500);--accent-soft:var(--forest-50);--accent-deep:var(--forest-700);--shadow-xs:0 1px 0 0 rgba(26,22,16,0.04);--shadow-sm:0 2px 8px -4px rgba(26,22,16,0.08),0 1px 2px -1px rgba(26,22,16,0.04);--shadow-md:0 12px 24px -8px rgba(26,22,16,0.10),0 4px 8px -2px rgba(26,22,16,0.05);--shadow-lg:0 28px 48px -16px rgba(26,22,16,0.16),0 8px 16px -4px rgba(26,22,16,0.06);--font-display:'Fraunces','Times New Roman',Georgia,serif;--font-ui:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--font-mono:'Geist Mono',ui-monospace,Menlo,monospace}html,body{font-family:var(--font-ui);background:var(--bg-page);color:var(--fg-default);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}.display,.font-display{font-family:var(--font-display);font-weight:300;font-style:italic;font-variation-settings:"opsz" 144;line-height:1.05;letter-spacing:-0.02em}.eyebrow{font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.18em;color:var(--fg-subtle)}.price,.font-mono{font-family:var(--font-mono);font-feature-settings:'tnum' on;font-weight:500;color:var(--fg-default)}.brand-mark{display:inline-grid;place-items:center;position:relative;flex:0 0 auto;border-radius:9999px;background:var(--forest-500);color:var(--cream-50)}.brand-mark::before{content:'';position:absolute;inset:2px;border:1px dashed rgba(251,248,241,0.35);border-radius:50%}.brand-mark>span{font-family:var(--font-display);font-style:italic;font-weight:300;line-height:1;letter-spacing:-0.04em;position:relative}::selection{background:var(--forest-200);color:var(--ink-900)}
/* === Nuray button + form utility classes (Tailwind-independent) === */
.nuray-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 24px;border-radius:9999px;font-family:var(--font-ui);font-size:14px;font-weight:500;letter-spacing:-.005em;cursor:pointer;transition:all .2s var(--ease-out,cubic-bezier(.2,.6,.2,1));border:0;text-decoration:none}
.nuray-btn-sm{height:36px;padding:0 16px;font-size:13px}
.nuray-btn-lg{height:52px;padding:0 28px;font-size:15px}
.nuray-btn-primary{background:var(--forest-500);color:var(--cream-50)}
.nuray-btn-primary:hover{background:var(--forest-600)}
.nuray-btn-dark{background:var(--ink-900);color:var(--cream-50)}
.nuray-btn-dark:hover{background:var(--ink-800)}
.nuray-btn-outline{background:transparent;color:var(--ink-900);border:1px solid var(--ink-300)}
.nuray-btn-outline:hover{background:var(--cream-100);border-color:var(--ink-400)}
.nuray-btn-ghost{background:transparent;color:var(--forest-700)}
.nuray-btn-ghost:hover{background:var(--forest-50)}
.nuray-btn-destructive{background:var(--anar-500);color:var(--cream-50)}
.nuray-btn-destructive:hover{background:var(--anar-600)}
.nuray-btn:disabled{opacity:.5;pointer-events:none}
.nuray-card{background:var(--paper-0);border-radius:16px;box-shadow:var(--shadow-md)}
.nuray-card-flat{background:var(--paper-0);border-radius:14px;border:1px solid var(--ink-100)}
.nuray-input{width:100%;height:44px;padding:0 16px;border-radius:10px;background:var(--paper-0);border:1px solid var(--ink-200);color:var(--ink-900);font-family:var(--font-ui);font-size:15px;outline:none;transition:border-color .2s var(--ease-out,cubic-bezier(.2,.6,.2,1))}
.nuray-input:focus{border-color:var(--forest-500);box-shadow:0 0 0 3px rgba(10,122,58,.1)}
.nuray-input-otp{text-align:center;font-size:24px;letter-spacing:.4em}
.nuray-bg-cream{background:var(--cream-50)}
.nuray-bg-paper{background:var(--paper-0)}
.nuray-bg-ink{background:var(--ink-900);color:var(--cream-50)}
.nuray-text-forest{color:var(--forest-700)}
.nuray-text-muted{color:var(--ink-500)}
.nuray-text-ink{color:var(--ink-900)}
.nuray-link{color:var(--forest-700);font-weight:500;text-decoration:none}
.nuray-link:hover{color:var(--forest-800);text-decoration:underline}
.nuray-divider{border-top:1px solid var(--ink-200)}
.nuray-w-card-sm{max-width:440px;width:100%}
.nuray-w-card-md{max-width:480px;width:100%}
.nuray-nav{position:sticky;top:0;z-index:50;background:rgba(251,248,241,.94);backdrop-filter:blur(12px);border-bottom:1px solid var(--ink-100)}
.nuray-section-bg{background:var(--cream-50)}
.nuray-drawer{transform:translateX(-100%);transition:transform .2s var(--ease-out,cubic-bezier(.2,.6,.2,1))}
.nuray-drawer[data-open="true"]{transform:translateX(0)}
@media(min-width:1024px){.nuray-drawer{transform:translateX(0)!important}}
/* === Legacy Tailwind color remap → brand tokens ===
   Pages were built with green-/gray- utilities; remap so they pick up forest/ink/cream
   without rewriting every utility. */
.bg-gray-50{background-color:var(--cream-50)!important}
.bg-gray-100{background-color:var(--cream-100)!important}
.bg-gray-200{background-color:var(--cream-200)!important}
.bg-white{background-color:var(--paper-0)!important}
.bg-green-50{background-color:var(--forest-50)!important}
.bg-green-100{background-color:var(--forest-100)!important}
.bg-green-500,.bg-green-600{background-color:var(--forest-500)!important}
.bg-green-700{background-color:var(--forest-600)!important}
.bg-green-800{background-color:var(--forest-700)!important}
.bg-gray-700,.bg-gray-800,.bg-gray-900{background-color:var(--ink-900)!important}
.hover\:bg-green-700:hover{background-color:var(--forest-600)!important}
.hover\:bg-green-600:hover{background-color:var(--forest-600)!important}
.hover\:bg-green-50:hover{background-color:var(--forest-50)!important}
.hover\:bg-gray-50:hover{background-color:var(--cream-100)!important}
.hover\:bg-gray-100:hover{background-color:var(--cream-200)!important}
.hover\:bg-gray-800:hover{background-color:var(--ink-800)!important}
.text-gray-400{color:var(--ink-400)!important}
.text-gray-500{color:var(--ink-500)!important}
.text-gray-600{color:var(--ink-600)!important}
.text-gray-700{color:var(--ink-700)!important}
.text-gray-800{color:var(--ink-800)!important}
.text-gray-900{color:var(--ink-900)!important}
.text-green-500,.text-green-600{color:var(--forest-600)!important}
.text-green-700,.text-green-800{color:var(--forest-700)!important}
.hover\:text-green-600:hover{color:var(--forest-600)!important}
.hover\:text-green-700:hover{color:var(--forest-700)!important}
.hover\:text-gray-900:hover{color:var(--ink-900)!important}
.border-gray-100{border-color:var(--ink-100)!important}
.border-gray-200{border-color:var(--ink-200)!important}
.border-gray-300{border-color:var(--ink-300)!important}
.border-green-200{border-color:var(--forest-200)!important}
.border-green-500,.border-green-600{border-color:var(--forest-500)!important}
.from-green-50{--tw-gradient-from:var(--forest-50)!important}
.to-white{--tw-gradient-to:var(--paper-0)!important}
.ring-green-500{--tw-ring-color:var(--forest-500)!important}
.focus\:ring-green-500:focus{--tw-ring-color:var(--forest-500)!important}
.focus\:ring-gray-500:focus{--tw-ring-color:var(--forest-500)!important}
/* Vibrant accents → muted brand palette. Premium leans calm, not candy-shop. */
.bg-blue-50,.bg-orange-50,.bg-purple-50,.bg-yellow-50,.bg-pink-50,.bg-indigo-50,.bg-red-50{background-color:var(--cream-100)!important}
.bg-blue-100,.bg-orange-100,.bg-purple-100,.bg-yellow-100,.bg-pink-100,.bg-indigo-100{background-color:var(--cream-200)!important}
.bg-red-100,.bg-red-200{background-color:var(--anar-50)!important}
.bg-red-500,.bg-red-600,.bg-red-700{background-color:var(--anar-500)!important}
.text-red-500,.text-red-600,.text-red-700,.text-red-800{color:var(--anar-700)!important}
.text-blue-500,.text-blue-600,.text-blue-700{color:var(--forest-700)!important}
.text-orange-500,.text-orange-600,.text-orange-700{color:var(--gold-600)!important}
.text-yellow-500,.text-yellow-600,.text-yellow-700{color:var(--gold-600)!important}
.text-purple-500,.text-purple-600,.text-purple-700{color:var(--ink-800)!important}
.text-pink-500,.text-pink-600,.text-pink-700{color:var(--anar-600)!important}
.text-indigo-500,.text-indigo-600,.text-indigo-700{color:var(--forest-700)!important}
.bg-blue-500,.bg-blue-600{background-color:var(--forest-500)!important}
.bg-orange-500,.bg-orange-600,.bg-yellow-500,.bg-yellow-600{background-color:var(--gold-600)!important}
.bg-purple-500,.bg-purple-600,.bg-indigo-500,.bg-indigo-600{background-color:var(--ink-800)!important}
.bg-pink-500,.bg-pink-600{background-color:var(--anar-500)!important}
.border-red-200{border-color:var(--anar-200)!important}
.border-red-300{border-color:var(--anar-200)!important}
.border-blue-100,.border-blue-200,.border-orange-100,.border-orange-200,.border-purple-100,.border-purple-200,.border-yellow-100,.border-yellow-200,.border-pink-100,.border-pink-200,.border-indigo-100,.border-indigo-200{border-color:var(--ink-200)!important}
/* Gradient backgrounds → flat cream */
.bg-gradient-to-r,.bg-gradient-to-l,.bg-gradient-to-t,.bg-gradient-to-b,.bg-gradient-to-br,.bg-gradient-to-bl,.bg-gradient-to-tr,.bg-gradient-to-tl{background-image:none!important;background-color:var(--cream-100)!important}
.bg-gradient-to-r.from-green-50,.bg-gradient-to-b.from-green-50,.bg-gradient-to-br.from-green-50{background-color:var(--forest-50)!important}
/* Promo / hero cards lighten up but keep the structure.
   Shade-restricted to 400-900 ONLY -- light shades (50/100/200/300) are section
   headers/placeholders meant to stay light with dark text (e.g. from-gray-50
   to-white), and fall through to the flat cream-100 default above. Matching
   every shade here (as an earlier, broader version of this rule did) forced
   those light gradients dark while their own text stayed dark too --
   unreadable dark-on-dark section headers across seller dashboard/orders/
   analytics/earnings and the admin login page. */
[class*="from-green-400"],[class*="from-green-500"],[class*="from-green-600"],[class*="from-green-700"],[class*="from-green-800"],[class*="from-green-900"]{background-color:var(--forest-500)!important;color:var(--cream-50)!important}
[class*="from-purple-400"],[class*="from-purple-500"],[class*="from-purple-600"],[class*="from-purple-700"],[class*="from-purple-800"],[class*="from-purple-900"],[class*="from-violet-400"],[class*="from-violet-500"],[class*="from-violet-600"],[class*="from-violet-700"],[class*="from-violet-800"],[class*="from-violet-900"]{background-color:var(--ink-800)!important;color:var(--cream-50)!important}
[class*="from-orange-400"],[class*="from-orange-500"],[class*="from-orange-600"],[class*="from-orange-700"],[class*="from-orange-800"],[class*="from-orange-900"],[class*="from-yellow-400"],[class*="from-yellow-500"],[class*="from-yellow-600"],[class*="from-yellow-700"],[class*="from-yellow-800"],[class*="from-yellow-900"]{background-color:var(--gold-600)!important;color:var(--cream-50)!important}
[class*="from-red-400"],[class*="from-red-500"],[class*="from-red-600"],[class*="from-red-700"],[class*="from-red-800"],[class*="from-red-900"],[class*="from-pink-400"],[class*="from-pink-500"],[class*="from-pink-600"],[class*="from-pink-700"],[class*="from-pink-800"],[class*="from-pink-900"],[class*="from-rose-400"],[class*="from-rose-500"],[class*="from-rose-600"],[class*="from-rose-700"],[class*="from-rose-800"],[class*="from-rose-900"]{background-color:var(--anar-500)!important;color:var(--cream-50)!important}
[class*="from-blue-400"],[class*="from-blue-500"],[class*="from-blue-600"],[class*="from-blue-700"],[class*="from-blue-800"],[class*="from-blue-900"],[class*="from-indigo-400"],[class*="from-indigo-500"],[class*="from-indigo-600"],[class*="from-indigo-700"],[class*="from-indigo-800"],[class*="from-indigo-900"]{background-color:var(--forest-600)!important;color:var(--cream-50)!important}
[class*="from-emerald-400"],[class*="from-emerald-500"],[class*="from-emerald-600"],[class*="from-emerald-700"],[class*="from-emerald-800"],[class*="from-emerald-900"],[class*="from-teal-400"],[class*="from-teal-500"],[class*="from-teal-600"],[class*="from-teal-700"],[class*="from-teal-800"],[class*="from-teal-900"],[class*="from-cyan-400"],[class*="from-cyan-500"],[class*="from-cyan-600"],[class*="from-cyan-700"],[class*="from-cyan-800"],[class*="from-cyan-900"]{background-color:var(--forest-500)!important;color:var(--cream-50)!important}
[class*="from-amber-400"],[class*="from-amber-500"],[class*="from-amber-600"],[class*="from-amber-700"],[class*="from-amber-800"],[class*="from-amber-900"]{background-color:var(--gold-600)!important;color:var(--cream-50)!important}
[class*="from-gray-400"],[class*="from-gray-500"],[class*="from-gray-600"],[class*="from-gray-700"],[class*="from-gray-800"],[class*="from-gray-900"],[class*="from-slate-400"],[class*="from-slate-500"],[class*="from-slate-600"],[class*="from-slate-700"],[class*="from-slate-800"],[class*="from-slate-900"],[class*="from-zinc-400"],[class*="from-zinc-500"],[class*="from-zinc-600"],[class*="from-zinc-700"],[class*="from-zinc-800"],[class*="from-zinc-900"],[class*="from-neutral-400"],[class*="from-neutral-500"],[class*="from-neutral-600"],[class*="from-neutral-700"],[class*="from-neutral-800"],[class*="from-neutral-900"]{background-color:var(--ink-700)!important;color:var(--cream-50)!important}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
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
