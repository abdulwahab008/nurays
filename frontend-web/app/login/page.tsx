'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { BrandLockup } from '@/components/ui/Mark';
import {
  ShoppingCart,
  ChefHat,
  Clock,
  AlertCircle,
  Bike,
  ShieldCheck,
  Sparkles,
  Layers,
  ArrowRight,
} from 'lucide-react';

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

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const { showToast } = useToast();
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [loginMethod, setLoginMethod] = useState<'otp' | 'email'>('email');
  const [step, setStep] = useState<'input' | 'verify'>('input');
  const [loading, setLoading] = useState(false);
  const [quickLoadingId, setQuickLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleQuickLogin = async (acc: DemoAccount) => {
    setQuickLoadingId(acc.id);
    setError('');
    setPhoneOrEmail(acc.email);
    setPassword('Password123!');
    setLoginMethod('email');

    try {
      const response = await authService.loginWithEmail(acc.email, 'Password123!');
      apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
      setUser(response.data.user);
      showToast(`Logged in as ${acc.name}`, 'success');

      if (acc.targetUrl) {
        router.push(acc.targetUrl);
      } else {
        const userType = response.data.user?.userType || response.data.user?.user_type;
        if (userType === 'admin') router.push('/admin/dashboard');
        else if (userType === 'seller') router.push('/sellers/dashboard');
        else if (userType === 'rider') router.push('/riders/dashboard');
        else router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Quick login failed');
    } finally {
      setQuickLoadingId(null);
    }
  };

  const handleAutofill = (acc: DemoAccount) => {
    setLoginMethod('email');
    setPhoneOrEmail(acc.email);
    setPassword('Password123!');
    showToast(`Autofilled credentials for ${acc.role}`, 'info');
  };

  const handleGoogleSuccess = async (accessToken: string) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await authService.loginWithGoogle(accessToken);
      
      if (response && response.data) {
        if (response.data.tokens) {
          apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
        }
        
        if (response.data.user) {
          setUser(response.data.user);
        }
        
        showToast('Successfully signed in with Google!', 'success');
        
        if (response.data.requiresEmailVerification && !response.data.user?.emailVerified) {
          router.push('/verify-email-pending');
        } else {
          const userType = response.data.user?.userType || response.data.user?.user_type;
          if (userType === 'admin') {
            router.push('/admin/dashboard');
          } else if (userType === 'seller') {
            router.push('/sellers/dashboard');
          } else if (userType === 'rider') {
            router.push('/riders/dashboard');
          } else {
            router.push('/dashboard');
          }
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Google sign-in failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.loginSendOtp({ phone: phoneOrEmail });
      setStep('verify');
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to send OTP';
      const errorCode = err.response?.data?.error?.code;
      
      if (errorCode === 'USER_NOT_FOUND') {
        setError('No account found with this phone number. Please register first.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.loginVerifyOtp({ phone: phoneOrEmail, otp });
      apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
      setUser(response.data.user);
      
      const userType = response.data.user?.userType || response.data.user?.user_type;
      if (userType === 'admin') {
        router.push('/admin/dashboard');
      } else if (userType === 'seller') {
        router.push('/sellers/dashboard');
      } else if (userType === 'rider') {
        router.push('/riders/dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'OTP verification failed';
      const errorCode = err.response?.data?.error?.code;
      
      if (errorCode === 'INVALID_OTP' || errorMessage.includes('Invalid OTP')) {
        setError('Invalid OTP code. Please check and try again.');
      } else if (errorCode === 'OTP_EXPIRED') {
        setError('OTP has expired. Please request a new one.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.loginWithEmail(phoneOrEmail, password);
      apiClient.setTokens(response.data.tokens.access_token, response.data.tokens.refresh_token);
      setUser(response.data.user);
      
      if (response.data.requiresEmailVerification) {
        router.push('/verify-email-pending');
      } else {
        const userType = response.data.user?.userType || response.data.user?.user_type;
        if (userType === 'admin') {
          router.push('/admin/dashboard');
        } else if (userType === 'seller') {
          router.push('/sellers/dashboard');
        } else if (userType === 'rider') {
          router.push('/riders/dashboard');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Login failed';
      const errorCode = err.response?.data?.error?.code;
      
      if (errorCode === 'INVALID_CREDENTIALS' || errorMessage.includes('Invalid email or password')) {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else if (errorCode === 'USER_NOT_FOUND') {
        setError('No account found with this email. Please register first.');
      } else if (errorCode === 'PASSWORD_NOT_SET') {
        setError('Password not set for this account. Please use OTP login or reset your password.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const tabBase = 'flex-1 h-11 rounded-full font-bold transition-all';
  const tabActive: React.CSSProperties = { background: 'linear-gradient(135deg, #FF5500 0%, #FF2A00 100%)', color: '#FFFFFF', fontSize: 13 };
  const tabInactive: React.CSSProperties = { background: 'transparent', color: '#64748B', fontSize: 13 };
  const inputClass = 'nuray-input';
  const inputStyle: React.CSSProperties = {};
  const labelClass = 'text-xs font-black uppercase tracking-wider text-slate-500 block mb-2';

  return (
    <div className="min-h-screen py-10 px-4 bg-gradient-to-br from-slate-50 via-orange-50/20 to-slate-100 flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl bg-white rounded-3xl p-6 sm:p-10 border border-slate-200/90 shadow-2xl">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between pb-8 mb-8 border-b border-slate-100 gap-4">
          <Link href="/" className="inline-block">
            <BrandLockup markSize={40} wordSize={28} />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dev-login"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-800 text-xs font-bold transition-all shadow-2xs"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Multi-Tab Isolator</span>
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
            >
              <span>New Account? Sign Up</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Column: Quick Role Login Area */}
          <div className="lg:col-span-7 bg-slate-50/80 rounded-2xl p-5 sm:p-6 border border-slate-200/70">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[10px] font-bold tracking-wider text-[#FF5500] bg-orange-100/80 px-2.5 py-0.5 rounded-full uppercase">
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
              <span className="hidden sm:inline-block text-xs font-medium text-slate-400">
                Password: <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-700">Password123!</code>
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
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${acc.badgeClass}`}>
                          {acc.badge}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">{acc.role}</h3>
                      <p className="text-xs text-slate-700 font-semibold mt-0.5">{acc.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">{acc.email}</p>
                      <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                        {acc.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickLogin(acc)}
                        disabled={isCurrentLoading || loading}
                        className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-[#FF5500] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-95 disabled:opacity-50"
                      >
                        {isCurrentLoading ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span>Sign In</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAutofill(acc)}
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
                className="font-bold text-[#FF5500] hover:underline ml-2 flex-shrink-0"
              >
                Open Tab Isolator →
              </Link>
            </div>
          </div>

          {/* Right Column: Standard Login Form */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Welcome back.
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
                Sign in to track orders, manage your kitchen, or start eating.
              </p>
            </div>

            {/* Login Method Toggle */}
            <div className="flex gap-1 mb-6 p-1 rounded-full bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('otp');
                  setStep('input');
                  setError('');
                }}
                className={tabBase}
                style={loginMethod === 'otp' ? tabActive : tabInactive}
              >
                OTP
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('email');
                  setStep('input');
                  setError('');
                }}
                className={tabBase}
                style={loginMethod === 'email' ? tabActive : tabInactive}
              >
                Email
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-700 font-medium">
                {error}
              </div>
            )}

            {loginMethod === 'otp' ? (
              step === 'input' ? (
                <form onSubmit={handleSendOtp}>
                  <div className="mb-4">
                    <label htmlFor="phone" className={labelClass}>
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      value={phoneOrEmail}
                      onChange={(e) => setPhoneOrEmail(e.target.value)}
                      placeholder="+923001234567"
                      required
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                  <Button type="submit" className="w-full h-12 text-sm font-bold shadow-md" disabled={loading}>
                    {loading ? 'Sending...' : 'Send OTP'}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp}>
                  <div className="mb-4">
                    <label htmlFor="otp" className={labelClass}>
                      Enter OTP
                    </label>
                    <input
                      type="text"
                      id="otp"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      required
                      className={`${inputClass} text-center text-2xl tracking-widest font-mono`}
                      style={inputStyle}
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      OTP sent to {phoneOrEmail}
                    </p>
                  </div>
                  <Button type="submit" className="w-full h-12 text-sm font-bold shadow-md" disabled={loading}>
                    {loading ? 'Verifying...' : 'Verify & Login'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setStep('input')}
                    className="w-full mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700"
                  >
                    Change Phone Number
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={handleEmailLogin}>
                <div className="mb-4">
                  <label htmlFor="email" className={labelClass}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={phoneOrEmail}
                    onChange={(e) => setPhoneOrEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className={labelClass}>
                      Password
                    </label>
                    <span className="text-[11px] text-slate-400">Default: Password123!</span>
                  </div>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-sm font-bold shadow-md" disabled={loading}>
                  {loading ? 'Logging in...' : 'Login'}
                </Button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 text-[11px] uppercase tracking-[0.18em] font-bold text-slate-400 bg-white">
                      Or continue with
                    </span>
                  </div>
                </div>

                <GoogleSignInButton onSuccess={handleGoogleSuccess} text="Continue with Google" />
              </form>
            )}

            <div className="mt-6 text-center">
              <p className="text-xs text-slate-500">
                Don't have an account?{' '}
                <Link href="/register" className="font-bold text-orange-600 hover:text-orange-700">
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
