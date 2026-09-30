'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { userProfileService, UserProfile } from '@/lib/services/user-profile.service';
import { formatPhoneNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import {
  Store,
  Bike,
  ShoppingCart,
  Camera,
  Zap,
  MapPin,
  Package,
  BarChart3,
  User,
  Pencil,
  Phone,
  Mail,
  Lock,
  Key,
  AlertTriangle,
  Check,
  ArrowRight,
  Globe,
  ShieldCheck,
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser, logout } = useAuthStore();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    city: '',
    area: '',
    languagePreference: 'en',
  });

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  useEffect(() => {
    const token = typeof window !== 'undefined' ? (sessionStorage.getItem('access_token') || localStorage.getItem('access_token')) : null;
    if (!token && !isAuthenticated) {
      router.push('/login');
      return;
    }
    loadProfile();
  }, [isAuthenticated]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const response = await userProfileService.getProfile();
      setProfile(response.data);
      setFormData({
        fullName: response.data.profile?.fullName || '',
        email: response.data.email || '',
        city: response.data.profile?.city || '',
        area: response.data.profile?.area || '',
        languagePreference: response.data.profile?.languagePreference || 'en',
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await userProfileService.updateProfile(formData);
      setProfile(response.data);
      setUser(response.data as any);
      setEditing(false);
      showToast('Profile updated successfully', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update profile', 'error');
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        title="My Profile"
        subtitle="Manage your account"
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your profile...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="My Profile"
      subtitle="Manage your account settings"
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card - Left Side */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header Banner */}
            <div className="h-24 bg-gradient-to-r from-green-500 to-emerald-600"></div>
            
            {/* Avatar & Basic Info */}
            <div className="px-6 pb-6 -mt-12 text-center">
              <div className="w-24 h-24 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center overflow-hidden shadow-lg border-4 border-white">
                {profile?.profile?.avatarUrl ? (
                  <img
                    src={profile.profile.avatarUrl}
                    alt={profile.profile.fullName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">
                      {profile?.profile?.fullName?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {profile?.profile?.fullName || 'User'}
              </h3>
              <p className="text-gray-500 text-sm mb-4">
                {profile?.email || profile?.phone || 'Customer'}
              </p>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                  profile?.userType === 'seller'
                    ? 'bg-purple-100 text-purple-800'
                    : profile?.userType === 'rider'
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-green-100 text-green-800'
                }`}>
                  {profile?.userType === 'seller' ? <Store className="w-3.5 h-3.5" /> : profile?.userType === 'rider' ? <Bike className="w-3.5 h-3.5" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                  <span className="capitalize">{profile?.userType || 'Customer'}</span>
                </span>
                {profile?.isEmailVerified && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Verified
                  </span>
                )}
              </div>
              <Button variant="outline" className="w-full mb-3 flex items-center justify-center gap-2" size="sm">
                <Camera className="w-4 h-4" /> Change Photo
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-6">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> Quick Links
            </h3>
            <div className="space-y-2">
              <Link href="/profile/addresses" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Addresses</p>
                  <p className="text-xs text-gray-500">Manage delivery locations</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/orders" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
                  <Package className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Order History</p>
                  <p className="text-xs text-gray-500">View past orders</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
              </Link>
              {profile?.userType !== 'seller' && (
                <Link href="/sellers/register" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                    <Store className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Become a Seller</p>
                    <p className="text-xs text-gray-500">Start your business</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
              {profile?.userType === 'seller' && (
                <Link href="/sellers/dashboard" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Seller Dashboard</p>
                    <p className="text-xs text-gray-500">Manage your store</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Main Content - Right Side */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-[#FF5500]" /> Personal Information
                </h2>
                <p className="text-sm text-gray-500">Update your personal details</p>
              </div>
              {!editing && (
                <Button variant="outline" onClick={() => setEditing(true)} size="sm" className="flex items-center gap-1.5">
                  <Pencil className="w-4 h-4" /> Edit
                </Button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleUpdateProfile}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      required
                      placeholder="Enter your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder="Enter your email"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder="e.g., Karachi"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Area</label>
                    <input
                      type="text"
                      value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                      placeholder="e.g., DHA Phase 6"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Language Preference
                    </label>
                    <select
                      value={formData.languagePreference}
                      onChange={(e) =>
                        setFormData({ ...formData, languagePreference: e.target.value })
                      }
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                    >
                      <option value="en">English</option>
                      <option value="ur">Urdu</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <Button type="submit" className="bg-green-600 hover:bg-green-700 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Save Changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      loadProfile();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Phone Number</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-500" />
                    {profile?.phone ? formatPhoneNumber(profile.phone) : 'Not provided'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Email Address</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    {profile?.email || 'Not provided'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Full Name</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    {profile?.profile?.fullName || 'Not set'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Location</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-500" />
                    {profile?.profile?.area && profile?.profile?.city
                      ? `${profile.profile.area}, ${profile.profile.city}`
                      : 'Not set'}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Account Type</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    {profile?.userType === 'seller' ? <Store className="w-4 h-4 text-purple-600" /> : profile?.userType === 'rider' ? <Bike className="w-4 h-4 text-orange-600" /> : <ShoppingCart className="w-4 h-4 text-green-600" />}
                    <span className="capitalize">{profile?.userType || 'Customer'}</span>
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Language</p>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    {profile?.profile?.languagePreference === 'ur' ? 'Urdu' : 'English'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Security & Account */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-slate-700" /> Account Security
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Password</p>
                    <p className="text-xs text-gray-500">Last changed: Never</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">Change</Button>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Email Verification</p>
                    <p className="text-xs text-gray-500">
                      {profile?.isEmailVerified ? 'Your email is verified' : 'Verify your email address'}
                    </p>
                  </div>
                </div>
                {!profile?.isEmailVerified && (
                  <Button variant="outline" size="sm">Verify</Button>
                )}
                {profile?.isEmailVerified && (
                  <span className="text-green-600 font-medium text-sm flex items-center gap-1">
                    <Check className="w-4 h-4" /> Verified
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
            <h2 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" /> Danger Zone
            </h2>
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl">
              <div>
                <p className="font-medium text-gray-900">Sign Out</p>
                <p className="text-xs text-gray-500">Sign out from your account</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => {
                  logout();
                  router.push('/');
                }}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

