'use client';

// The one-click demo accounts: a development aid with a shared password. The sign-in page loads this file only in a build
// that switches them on (NEXT_PUBLIC_DEMO_LOGIN, set in next.config.ts). In any other build that condition is a constant
// false, the require is dropped, and none of these e-mail addresses or the password reach a visitor's browser.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShoppingCart, ChefHat, Clock, AlertCircle, Bike, ShieldCheck, Sparkles, Layers, ArrowRight } from 'lucide-react';
import { homeFor } from '@/lib/utils';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

interface DemoAccount {
  id: string;
  role: string;
  badge: string;
  badgeClass: string;
  name: string;
  email: string;
  subtitle: string;
  targetUrl: string;
  description: string;
}

const DEMO_PASSWORD = 'Password123!';

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'customer',
    role: 'Customer / Buyer',
    badge: 'BUYER',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    name: 'Ayesha Khan',
    email: 'customer@nuray.test',
    subtitle: 'Askari 11, Karachi • COD & JazzCash',
    targetUrl: '/dashboard',
    description: 'Browse dishes, manage single-seller cart, and track order deliveries.',
  },
  {
    id: 'seller',
    role: 'Approved Seller (Kitchen Active)',
    badge: 'KITCHEN LIVE',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    name: "Saima's Craft Kitchen",
    email: 'seller@nuray.test',
    subtitle: 'Verified Home Cook • Kitchen Cockpit',
    targetUrl: '/sellers/dashboard',
    description: 'Incoming order tickets, Store OPEN/CLOSED switch, 7-metric earnings breakdown.',
  },
  {
    id: 'seller-pending',
    role: 'Seller (Under Admin Review)',
    badge: 'PENDING MODERATION',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    name: 'Chef Ahmed Khan',
    email: 'seller.pending@nuray.test',
    subtitle: 'Ahmed Tikka & Karahi • Awaiting Approval',
    targetUrl: '/sellers/register',
    description: 'Applicant view during hygiene & document verification review.',
  },
  {
    id: 'seller-rejected',
    role: 'Seller (Rejected / Needs Fix)',
    badge: 'REJECTED • FIX',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    name: 'Chef Bilal Tariq',
    email: 'seller.rejected@nuray.test',
    subtitle: 'Bilal Shawarma • Rejection Reason Shown',
    targetUrl: '/sellers/register',
    description: 'Inspect blurry CNIC rejection reason and test Fix & Resubmit loop.',
  },
  {
    id: 'rider',
    role: 'Delivery Rider Fleet',
    badge: 'RIDER',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    name: 'Tariq Mehmood',
    email: 'rider@nuray.test',
    subtitle: 'Motorcycle KHI-8921 • Corridor Dispatch',
    targetUrl: '/riders/dashboard',
    description: 'Claim deliveries, route batching bonus, and doorstep PIN handover.',
  },
  {
    id: 'admin',
    role: 'Super Admin Operations',
    badge: 'SUPER ADMIN',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
    name: 'Platform Ops',
    email: 'admin@frozennuray.com',
    subtitle: 'Governance, Telemetry & Payouts',
    targetUrl: '/admin/dashboard',
    description: 'Approve/reject kitchens, moderate catalog, double-entry ledger audits.',
  },
];

export function DemoDevLink() {
  return (
    <Link
      href="/dev-login"
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-800 text-xs font-bold transition-all shadow-2xs"
    >
      <Layers className="w-3.5 h-3.5" />
      <span>Multi-Tab Isolator</span>
    </Link>
  );
}

export function DemoPasswordHint() {
  return <span className="text-[11px] text-slate-500">Default: {DEMO_PASSWORD}</span>;
}

/** The quick-login cards. `onAutofill` puts an account's e-mail and password into the sign-in form. */
export function DemoLoginPanel({ onAutofill, onError, busy }: { onAutofill: (email: string, password: string) => void; onError: (message: string) => void; busy: boolean }) {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const { showToast } = useToast();
  const [quickLoadingId, setQuickLoadingId] = useState<string | null>(null);

  const quickLogin = async (acc: DemoAccount) => {
    setQuickLoadingId(acc.id);
    onError('');
    onAutofill(acc.email, DEMO_PASSWORD);
    try {
      const response = await authService.loginWithEmail(acc.email, DEMO_PASSWORD);
      apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
      setUser(response.data.user);
      showToast(`Logged in as ${acc.name}`, 'success');
      if (acc.targetUrl) {
        router.push(acc.targetUrl);
      } else {
        const userType = response.data.user?.userType || response.data.user?.user_type;
        router.push(homeFor(userType));
      }
    } catch (err: any) {
      onError(err.response?.data?.error?.message || err.message || 'Quick login failed');
    } finally {
      setQuickLoadingId(null);
    }
  };

  const autofill = (acc: DemoAccount) => {
    onAutofill(acc.email, DEMO_PASSWORD);
    showToast(`Autofilled credentials for ${acc.role}`, 'info');
  };

  return (
    <div className="lg:col-span-7 bg-slate-50/80 rounded-2xl p-5 sm:p-6 border border-slate-200/70">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-[#FF5500] bg-orange-100/80 px-2.5 py-0.5 rounded-full uppercase">
            Instant Access
          </span>
          <h2 className="text-lg font-bold text-slate-900 mt-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#FF5500]" />
            <span>Quick Login via Role</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Click any account below for 1-click authentication or autofill:
          </p>
        </div>
        <span className="hidden sm:inline-block text-xs font-medium text-slate-500">
          Password: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-700">{DEMO_PASSWORD}</code>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-4">
        {DEMO_ACCOUNTS.map((acc) => {
          const isCurrentLoading = quickLoadingId === acc.id;
          return (
            <div
              key={acc.id}
              className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs hover:shadow-xs hover:border-orange-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    {acc.id === 'customer' && <ShoppingCart className="w-4 h-4 text-emerald-600" />}
                    {acc.id === 'seller' && <ChefHat className="w-4 h-4 text-emerald-600" />}
                    {acc.id === 'seller-pending' && <Clock className="w-4 h-4 text-amber-600" />}
                    {acc.id === 'seller-rejected' && <AlertCircle className="w-4 h-4 text-rose-600" />}
                    {acc.id === 'rider' && <Bike className="w-4 h-4 text-blue-600" />}
                    {acc.id === 'admin' && <ShieldCheck className="w-4 h-4 text-purple-600" />}
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${acc.badgeClass}`}>
                    {acc.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 leading-snug">{acc.role}</h3>
                <p className="text-xs text-slate-700 font-semibold mt-0.5">{acc.name}</p>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{acc.email}</p>
                <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                  {acc.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => quickLogin(acc)}
                  disabled={isCurrentLoading || busy}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-[#FF5500] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {isCurrentLoading ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => autofill(acc)}
                  title="Fill into form without submitting"
                  className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                >
                  Fill
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between text-xs text-amber-900">
        <span className="font-medium flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
          <span>Need to test Buyer, Seller, Rider &amp; Admin simultaneously?</span>
        </span>
        <Link
          href="/dev-login"
          className="font-bold text-[#FF5500] hover:underline ms-2 flex-shrink-0"
        >
          Open Tab Isolator →
        </Link>
      </div>
    </div>
  );
}
