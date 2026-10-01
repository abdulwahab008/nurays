'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams, notFound } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { Mark, BrandLockup } from '@/components/ui/Mark';

interface RoleConfig {
  id: 'customer' | 'seller' | 'seller-pending' | 'seller-rejected' | 'rider' | 'admin';
  name: string;
  badge: string;
  badgeColor: string;
  email: string;
  pass: string;
  subtitle: string;
  targetUrl: string;
  icon: string;
  description: string;
}

const ROLES: RoleConfig[] = [
  {
    id: 'customer',
    name: 'Customer / Buyer Account',
    badge: 'CUSTOMER',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    email: 'customer@nuray.test',
    pass: 'Password123!',
    subtitle: 'Ayesha Khan • Askari 11 & DHA, Karachi',
    targetUrl: '/dashboard',
    icon: '🛒',
    description: 'Browse home kitchens, add items to single-seller bag, place COD / JazzCash orders, and track deliveries.',
  },
  {
    id: 'seller',
    name: 'Approved Seller (Kitchen Active)',
    badge: 'HOME CHEF • ACTIVE',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    email: 'seller@nuray.test',
    pass: 'Password123!',
    subtitle: "Saima's Craft Kitchen • Verified Chef",
    targetUrl: '/sellers/dashboard',
    icon: '👩‍🍳',
    description: 'Kitchen orders cockpit, 1-click Store OPEN/CLOSED switch, cooking countdown, and 7-metric earnings breakdown.',
  },
  {
    id: 'seller-pending',
    name: 'Seller (Under Admin Review)',
    badge: 'PENDING APPROVAL',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    email: 'seller.pending@nuray.test',
    pass: 'Password123!',
    subtitle: 'Chef Ahmed Khan • Ahmed Tikka & Karahi',
    targetUrl: '/sellers/register',
    icon: '⏳',
    description: 'View the pending onboarding screen while food safety and kitchen hygiene documents are being vetted.',
  },
  {
    id: 'seller-rejected',
    name: 'Seller (Rejected / Fix & Resubmit)',
    badge: 'REJECTED • FIX & RESUBMIT',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
    email: 'seller.rejected@nuray.test',
    pass: 'Password123!',
    subtitle: 'Chef Bilal Tariq • Bilal Shawarma & Wraps',
    targetUrl: '/sellers/register',
    icon: '🚫',
    description: 'Inspect exact rejection reason, modify profile/photos, and test the Fix & Resubmit onboarding loop.',
  },
  {
    id: 'rider',
    name: 'Delivery Rider Fleet',
    badge: 'RIDER',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    email: 'rider@nuray.test',
    pass: 'Password123!',
    subtitle: 'Tariq Mehmood • Motorcycle KHI-8921',
    targetUrl: '/riders/dashboard',
    icon: '🛵',
    description: 'Claim deliveries, route matching along Askari 11 corridor, and doorstep handover confirmation.',
  },
  {
    id: 'admin',
    name: 'Super Admin Operations',
    badge: 'SUPER ADMIN',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    email: 'admin@frozennuray.com',
    pass: 'Password123!',
    subtitle: 'Platform Governance & Auditing',
    targetUrl: '/admin/dashboard',
    icon: '🛡️',
    description: 'Approve/reject seller applications, catalog moderation, dispatch telemetry, and platform ledger payouts.',
  },
];

function DevLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((state) => state.setUser);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const performLogin = async (roleKey: RoleConfig['id'] | string, isolate = true) => {
    const role = ROLES.find((r) => r.id === roleKey);
    if (!role) return;

    setLoadingRole(roleKey);
    setStatusMessage(`Authenticating as ${role.name}...`);

    try {
      if (typeof window !== 'undefined' && isolate) {
        sessionStorage.setItem('tab_isolated', 'true');
      }

      const res = await apiClient.post('/auth/login', {
        phoneOrEmail: role.email,
        otpCodeOrPassword: role.pass,
        loginMethod: 'email',
      });

      if (res.data?.success && res.data?.data) {
        const { user, tokens } = res.data.data;
        apiClient.setTokens(tokens.access_token, tokens.refresh_token, isolate);
        setUser(user);
        setStatusMessage(`Success! Redirecting to ${role.targetUrl}...`);
        router.push(role.targetUrl);
      }
    } catch (err: any) {
      setStatusMessage(`Login failed: ${err.response?.data?.error?.message || err.message}`);
      setLoadingRole(null);
    }
  };

  // Handle auto-login via URL query params (e.g. /dev-login?role=seller&autologin=1)
  useEffect(() => {
    const roleParam = searchParams.get('role') as RoleConfig['id'] | null;
    const auto = searchParams.get('autologin');

    if (roleParam && auto === '1') {
      performLogin(roleParam, true);
    }
  }, [searchParams]);

  const openAllRolesInTabs = () => {
    ROLES.forEach((role) => {
      window.open(`/dev-login?role=${role.id}&autologin=1`, '_blank');
    });
  };

  const openSingleRoleInTab = (roleId: string) => {
    window.open(`/dev-login?role=${roleId}&autologin=1`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/20 to-slate-100 text-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-4">
            <BrandLockup markSize={36} />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-bold uppercase tracking-wider mb-3">
            ⚡ Multi-User Concurrent Testing Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
            Test All User Roles in Separate Tabs
          </h1>
          <p className="mt-2 text-base text-slate-600 max-w-2xl mx-auto">
            Each button opens a <strong>tab-isolated session</strong> so you can have Customer, Kitchen, Rider, and Admin open simultaneously without signing each other out!
          </p>

          {/* Master Action Button */}
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <button
              onClick={openAllRolesInTabs}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white font-extrabold text-sm shadow-xl shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span>🚀 Open All 4 Roles in Separate Tabs</span>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-bold">1-Click</span>
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-sm shadow-sm hover:bg-slate-50 transition-all"
            >
              Back to Marketplace
            </Link>
          </div>

          {statusMessage && (
            <div className="mt-4 inline-block px-4 py-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-sm font-semibold animate-pulse">
              {statusMessage}
            </div>
          )}
        </div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ROLES.map((role) => {
            const isLoading = loadingRole === role.id;
            return (
              <div
                key={role.id}
                className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-orange-200 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl shadow-inner">
                        {role.icon}
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-slate-900 leading-snug">{role.name}</h2>
                        <p className="text-xs text-slate-500 font-medium">{role.subtitle}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-black tracking-widest px-2.5 py-1 rounded-full border ${role.badgeColor}`}
                    >
                      {role.badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed mb-4">{role.description}</p>

                  <div className="bg-slate-50 rounded-xl p-3 mb-5 border border-slate-100 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Email:</span>
                      <code className="text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {role.email}
                      </code>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Password:</span>
                      <code className="text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {role.pass}
                      </code>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Landing Page:</span>
                      <code className="text-orange-700 font-bold">{role.targetUrl}</code>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => openSingleRoleInTab(role.id)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-black text-xs border border-orange-200 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>↗ Open in New Tab</span>
                  </button>
                  <button
                    onClick={() => performLogin(role.id, false)}
                    disabled={isLoading}
                    className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-black text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isLoading ? 'Signing in...' : 'Sign in Here'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Operational Testing Walkthrough */}
        <div className="mt-10 bg-white rounded-3xl p-6 border border-slate-200">
          <h3 className="text-base font-black text-slate-900 mb-2">💡 Recommended Concurrent Testing Workflow:</h3>
          <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>
              Click <strong>&quot;Open All 4 Roles in Separate Tabs&quot;</strong> above to spawn 4 independent tabs.
            </li>
            <li>
              <strong>Tab 1 (Customer)</strong>: Go to <Link href="/products" className="text-orange-600 underline font-bold">/products</Link>, add an item to tray, and complete checkout. Note your <strong>Doorstep Handover PIN</strong>!
            </li>
            <li>
              <strong>Tab 2 (Seller)</strong>: Go to <strong>/sellers/orders</strong>, click <em>Confirm</em>, then <em>Start Preparing</em> to trigger the predictive JIT dispatch!
            </li>
            <li>
              <strong>Tab 3 (Rider)</strong>: Go to <strong>/riders/dashboard</strong>, mark <em>Arrived at Kitchen</em> $\to$ <em>Picked Up</em> $\to$ <em>Arrived at Customer</em>. Enter the PIN from Tab 1!
            </li>
            <li>
              <strong>Tab 4 (Admin)</strong>: Go to <strong>/admin/dashboard</strong>, see today&apos;s revenue update in real-time, with all 4 double-entry ledger records posted!
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default function DevLoginPage() {
  // A page of one-click logins for seeded accounts: development only.
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN !== 'true') {
    notFound();
  }
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500 font-bold">Loading Nuray Testing Hub...</div>}>
      <DevLoginContent />
    </Suspense>
  );
}
