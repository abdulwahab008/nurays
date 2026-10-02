'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bike, Store, ArrowRight, MapPin, Plus, X } from 'lucide-react';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { DatePicker } from '@/components/ui/DatePicker';

const MEAL_CATEGORIES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'brunch', label: 'Brunch' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'evening_snacks', label: 'Evening Snacks' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'late_night', label: 'Late Night' },
  { value: 'desserts', label: 'Desserts' },
  { value: 'beverages', label: 'Beverages' },
];

const BUSINESS_TYPES = [
  { value: 'home_kitchen', label: 'Home Kitchen' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'cafe', label: 'Café' },
  { value: 'cloud_kitchen', label: 'Cloud Kitchen' },
];

const AVAILABILITY_OVERRIDES = [
  { value: '', label: 'Normal Schedule' },
  { value: 'open', label: 'Force Open' },
  { value: 'closed', label: 'Temporarily Closed' },
  { value: 'busy', label: 'Kitchen Busy' },
  { value: 'vacation', label: 'On Vacation' },
];

export default function SellerSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [deliveryModel, setDeliveryModel] = useState<'model_a' | 'model_b'>('model_b');
  const [newAreaInput, setNewAreaInput] = useState('');

  const [formData, setFormData] = useState({
    businessName: '',
    businessNameUrdu: '',
    description: '',
    kitchenVideoUrl: '',
    coverImageUrl: '',
    jazzcashNumber: '',
    jazzcashAccountTitle: '',
    easypaisaNumber: '',
    easypaisaAccountTitle: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankName: '',
    lowStockThreshold: 10,
    enableStockAlerts: true,

    // Delivery fields
    freeDeliveryAreas: [] as string[],
    freeDeliveryRadiusKm: null as number | null,
    latitude: 31.4720 as number | null,
    longitude: 74.4530 as number | null,
    deliveryFeeType: 'fixed' as '' | 'fixed' | 'distance',
    deliveryFeeFixed: 50 as number | null,
    deliveryFeeBase: 40 as number | null,
    deliveryFeePerKm: 15 as number | null,
    maxDeliveryDistanceKm: 5 as number | null,
    minOrderAmountForDelivery: 250 as number | null,
    freeDeliveryThreshold: 500 as number | null,
    deliveryModes: ['delivery'] as string[],

    businessType: 'home_kitchen',
    mealCategories: [] as string[],
    storeNotice: '',

    scheduleMode: 'fixed_daily' as '24_7' | 'fixed_daily' | 'per_day',
    fixedDailyOpen: '09:00',
    fixedDailyClose: '22:00',

    availabilityOverride: '' as string,
    availabilityOverrideUntil: '' as string,
    availabilityNote: '',

    orderCutoffTime: '' as string,
    maxDailyOrders: null as number | null,
    minPrepTimeMinutes: null as number | null,
    preOrderOnly: false,
    advanceBookingMinDays: null as number | null,
    advanceBookingMaxDays: null as number | null,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Seller access required.', 'error');
      return;
    }

    loadSettings();
  }, [isAuthenticated, user, router]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await apiClient.get('/sellers/me');
      if (response.data.success) {
        const seller = response.data.data;
        const feeType = seller.deliveryFeeType || '';

        // deliveryProvider is the source of truth for who delivers; fee fields no longer imply it.
        setDeliveryModel(seller.deliveryProvider === 'self' ? 'model_b' : 'model_a');

        setFormData({
          businessName: seller.businessName || '',
          businessNameUrdu: seller.businessNameUrdu || '',
          description: seller.description || '',
          kitchenVideoUrl: seller.kitchenVideoUrl || '',
          coverImageUrl: seller.coverImageUrl || '',
          jazzcashNumber: seller.jazzcashNumber || '',
          jazzcashAccountTitle: seller.jazzcashAccountTitle || '',
          easypaisaNumber: seller.easypaisaNumber || '',
          easypaisaAccountTitle: seller.easypaisaAccountTitle || '',
          bankAccountName: seller.bankAccountName || '',
          bankAccountNumber: seller.bankAccountNumber || '',
          bankName: seller.bankName || '',
          lowStockThreshold: seller.lowStockThreshold ?? 10,
          enableStockAlerts: seller.enableStockAlerts ?? true,

          freeDeliveryAreas: Array.isArray(seller.freeDeliveryAreas) ? seller.freeDeliveryAreas : [],
          freeDeliveryRadiusKm: seller.freeDeliveryRadiusKm ?? 2.5,
          latitude: seller.latitude != null ? parseFloat(String(seller.latitude)) : 31.4720,
          longitude: seller.longitude != null ? parseFloat(String(seller.longitude)) : 74.4530,
          deliveryFeeType: (seller.deliveryFeeType as '' | 'fixed' | 'distance') || 'fixed',
          deliveryFeeFixed: seller.deliveryFeeFixed ?? 50,
          deliveryFeeBase: seller.deliveryFeeBase ?? 40,
          deliveryFeePerKm: seller.deliveryFeePerKm != null ? parseFloat(String(seller.deliveryFeePerKm)) : 15,
          maxDeliveryDistanceKm: seller.maxDeliveryDistanceKm ?? 5,
          minOrderAmountForDelivery: seller.minOrderAmountForDelivery ?? 250,
          freeDeliveryThreshold: seller.freeDeliveryThreshold ?? 500,
          deliveryModes: Array.isArray(seller.deliveryModes) && seller.deliveryModes.length ? seller.deliveryModes : ['delivery'],

          businessType: seller.businessType || 'home_kitchen',
          mealCategories: Array.isArray(seller.mealCategories) ? seller.mealCategories : [],
          storeNotice: seller.storeNotice || '',

          scheduleMode: (seller.scheduleMode as '24_7' | 'fixed_daily' | 'per_day') || 'fixed_daily',
          fixedDailyOpen: seller.operatingHours?.fixedDaily?.open || '09:00',
          fixedDailyClose: seller.operatingHours?.fixedDaily?.close || '22:00',

          availabilityOverride: seller.availabilityOverride || '',
          availabilityOverrideUntil: seller.availabilityOverrideUntil
            ? new Date(seller.availabilityOverrideUntil).toISOString().slice(0, 10)
            : '',
          availabilityNote: seller.availabilityNote || '',

          orderCutoffTime: seller.orderCutoffTime || '',
          maxDailyOrders: seller.maxDailyOrders ?? null,
          minPrepTimeMinutes: seller.minPrepTimeMinutes ?? null,
          preOrderOnly: seller.preOrderOnly ?? false,
          advanceBookingMinDays: seller.advanceBookingMinDays ?? null,
          advanceBookingMaxDays: seller.advanceBookingMaxDays ?? null,
        });
      }
    } catch (error: any) {
      console.error('Failed to load settings:', error);
      setLoadError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddArea = () => {
    const trimmed = newAreaInput.trim();
    if (!trimmed) return;
    if (formData.freeDeliveryAreas.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      setNewAreaInput('');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      freeDeliveryAreas: [...prev.freeDeliveryAreas, trimmed],
    }));
    setNewAreaInput('');
  };

  const handleRemoveArea = (areaToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      freeDeliveryAreas: prev.freeDeliveryAreas.filter((a) => a !== areaToRemove),
    }));
  };

  const toggleMealCategory = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      mealCategories: prev.mealCategories.includes(value)
        ? prev.mealCategories.filter((c) => c !== value)
        : [...prev.mealCategories, value],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        freeDeliveryAreas,
        freeDeliveryRadiusKm,
        latitude,
        longitude,
        deliveryFeeType,
        deliveryFeeFixed,
        deliveryFeeBase,
        deliveryFeePerKm,
        maxDeliveryDistanceKm,
        minOrderAmountForDelivery,
        freeDeliveryThreshold,
        deliveryModes,
        businessType,
        mealCategories,
        storeNotice,
        scheduleMode,
        fixedDailyOpen,
        fixedDailyClose,
        availabilityOverride,
        availabilityOverrideUntil,
        availabilityNote,
        orderCutoffTime,
        maxDailyOrders,
        minPrepTimeMinutes,
        preOrderOnly,
        advanceBookingMinDays,
        advanceBookingMaxDays,
        ...rest
      } = formData;

      const operatingHours =
        scheduleMode === 'fixed_daily'
          ? { fixedDaily: { open: fixedDailyOpen, close: fixedDailyClose } }
          : null;

      let deliveryPayload: Record<string, any> = {
        deliveryModes: deliveryModes && deliveryModes.length ? deliveryModes : ['delivery'],
        deliveryProvider: deliveryModel === 'model_b' ? 'self' : 'platform',
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
      };

      // Platform fleet: the rider pool delivers, so there is no self-delivery
      // pricing to send. Existing fee settings are left untouched (they are the
      // fallback where no per-community fee applies); community fees live on
      // the Delivery console.
      if (deliveryModel === 'model_b') {
        deliveryPayload = {
          ...deliveryPayload,
          deliveryFeeType: deliveryFeeType || 'fixed',
          deliveryFeeFixed:
            deliveryFeeType === 'fixed' && deliveryFeeFixed != null
              ? Math.max(0, Math.round(Number(deliveryFeeFixed)))
              : null,
          deliveryFeeBase:
            deliveryFeeType === 'distance' && deliveryFeeBase != null
              ? Math.max(0, Math.round(Number(deliveryFeeBase)))
              : null,
          deliveryFeePerKm:
            deliveryFeeType === 'distance' && deliveryFeePerKm != null
              ? Math.max(0, Number(deliveryFeePerKm))
              : null,
          freeDeliveryAreas: (freeDeliveryAreas || [])
            .map((a: string) => (typeof a === 'string' ? a.trim() : ''))
            .filter((a: string) => a.length > 0),
          freeDeliveryRadiusKm:
            freeDeliveryRadiusKm != null && !isNaN(Number(freeDeliveryRadiusKm))
              ? Math.max(0, Number(freeDeliveryRadiusKm))
              : null,
          freeDeliveryThreshold:
            freeDeliveryThreshold != null && !isNaN(Number(freeDeliveryThreshold))
              ? Math.max(0, Number(freeDeliveryThreshold))
              : null,
          maxDeliveryDistanceKm:
            maxDeliveryDistanceKm != null && Number(maxDeliveryDistanceKm) > 0
              ? Number(maxDeliveryDistanceKm)
              : null,
          minOrderAmountForDelivery:
            minOrderAmountForDelivery != null && !isNaN(Number(minOrderAmountForDelivery))
              ? Math.max(0, Number(minOrderAmountForDelivery))
              : null,
        };
      }

      if (!rest.businessName || !rest.businessName.trim()) {
        showToast('Business name is required.', 'error');
        setLoading(false);
        return;
      }

      const sanitizedRest = {
        businessName: rest.businessName.trim(),
        businessNameUrdu: rest.businessNameUrdu?.trim() || null,
        description: rest.description?.trim() || null,
        kitchenVideoUrl: rest.kitchenVideoUrl?.trim() || null,
        coverImageUrl: rest.coverImageUrl?.trim() || null,
        jazzcashNumber: rest.jazzcashNumber?.trim() || null,
        jazzcashAccountTitle: rest.jazzcashAccountTitle?.trim() || null,
        easypaisaNumber: rest.easypaisaNumber?.trim() || null,
        easypaisaAccountTitle: rest.easypaisaAccountTitle?.trim() || null,
        bankAccountName: rest.bankAccountName?.trim() || null,
        bankAccountNumber: rest.bankAccountNumber?.trim() || null,
        bankName: rest.bankName?.trim() || null,
        lowStockThreshold: typeof rest.lowStockThreshold === 'number' ? rest.lowStockThreshold : 10,
        enableStockAlerts: Boolean(rest.enableStockAlerts),
      };

      await apiClient.patch('/sellers/me', {
        ...sanitizedRest,
        ...deliveryPayload,
        businessType,
        mealCategories,
        storeNotice: storeNotice || undefined,
        scheduleMode,
        operatingHours,
        availabilityOverride: availabilityOverride || null,
        availabilityOverrideUntil: availabilityOverride && availabilityOverrideUntil
          ? new Date(availabilityOverrideUntil).toISOString()
          : undefined,
        availabilityNote: availabilityNote || undefined,
        orderCutoffTime: orderCutoffTime || undefined,
        maxDailyOrders: maxDailyOrders ?? undefined,
        minPrepTimeMinutes: minPrepTimeMinutes ?? undefined,
        preOrderOnly,
        advanceBookingMinDays: advanceBookingMinDays ?? undefined,
        advanceBookingMaxDays: advanceBookingMaxDays ?? undefined,
      });

      showToast('Settings saved successfully.', 'success');
    } catch (error: any) {
      const firstIssue = error.response?.data?.error?.details?.[0]?.message;
      const generalMsg = error.response?.data?.error?.message;
      showToast(firstIssue || generalMsg || 'Failed to save settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout
      title="Settings"
      subtitle="Manage kitchen profile, delivery, and schedule"
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <div className="max-w-3xl mx-auto space-y-6 pb-16">
        {loadError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center justify-between">
            <span>{loadError}</span>
            <button onClick={loadSettings} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Kitchen Profile */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Kitchen Profile</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Business Name (English)
                </label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Business Name (Urdu)
                </label>
                <input
                  type="text"
                  value={formData.businessNameUrdu}
                  onChange={(e) => setFormData({ ...formData, businessNameUrdu: e.target.value })}
                  placeholder="مثلاً: فاطمہ کچن"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Tell customers about your kitchen and specialty dishes..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Kitchen Type</label>
                <select
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                >
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Storefront Notice</label>
                <input
                  type="text"
                  value={formData.storeNotice}
                  onChange={(e) => setFormData({ ...formData, storeNotice: e.target.value })}
                  placeholder="e.g. Special weekend Biryani available"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Meal Categories &amp; Timings</label>
              <div className="flex flex-wrap gap-1.5">
                {MEAL_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleMealCategory(c.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      formData.mealCategories.includes(c.value)
                        ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
                {formData.mealCategories
                  .filter((cat) => !MEAL_CATEGORIES.some((c) => c.value === cat))
                  .map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleMealCategory(cat)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border bg-slate-800 text-white border-slate-800 transition-colors flex items-center gap-1.5"
                    >
                      <span>{cat}</span>
                      <span className="text-[10px] text-slate-400">✕</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Delivery & Fulfillment */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">Delivery &amp; Rates</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Choose fulfillment model and local pricing</p>
              </div>
              <Link
                href="/sellers/delivery"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF5500] hover:text-[#e04400]"
              >
                <span>Full Delivery Console</span>
                <ArrowRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div
                onClick={() => setDeliveryModel('model_a')}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  deliveryModel === 'model_a' ? 'border-blue-600 bg-blue-50/20' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bike className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900">Nuray Rider Fleet</span>
                </div>
              </div>

              <div
                onClick={() => setDeliveryModel('model_b')}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                  deliveryModel === 'model_b' ? 'border-emerald-600 bg-emerald-50/20' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900">Self-Delivery</span>
                </div>
              </div>
            </div>

            {deliveryModel === 'model_b' && (
              <div className="space-y-4 pt-3 border-t border-slate-100">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Community Delivery Fee</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={formData.deliveryFeeFixed ?? 50}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            deliveryFeeFixed: e.target.value === '' ? null : parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full ps-3 pe-10 py-1.5 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                      />
                      <span className="absolute end-3 top-2 text-[10px] text-slate-400 font-medium">PKR</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Free Delivery Radius</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={formData.freeDeliveryRadiusKm ?? 2.5}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            freeDeliveryRadiusKm: e.target.value === '' ? null : parseFloat(e.target.value),
                          })
                        }
                        className="w-full ps-3 pe-8 py-1.5 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                      />
                      <span className="absolute end-3 top-2 text-[10px] text-slate-400 font-medium">KM</span>
                    </div>
                  </div>
                </div>

                {/* Free Areas */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Free Delivery Societies</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newAreaInput}
                      onChange={(e) => setNewAreaInput(e.target.value)}
                      placeholder="Add area (e.g. Askari 11)..."
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                    />
                    <Button
                      type="button"
                      onClick={handleAddArea}
                      variant="outline"
                      className="h-8 px-3 text-xs border-slate-300"
                    >
                      Add
                    </Button>
                  </div>

                  {formData.freeDeliveryAreas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {formData.freeDeliveryAreas.map((area) => (
                        <span
                          key={area}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-800"
                        >
                          <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                          <span>{area}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveArea(area)}
                            className="hover:text-red-500 ms-0.5"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Operating Hours & Schedule */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Hours &amp; Availability</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Availability Override</label>
                <select
                  value={formData.availabilityOverride}
                  onChange={(e) => setFormData({ ...formData, availabilityOverride: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                >
                  {AVAILABILITY_OVERRIDES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {formData.availabilityOverride && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Reopen Date</label>
                  <DatePicker
                    value={formData.availabilityOverrideUntil}
                    onChange={(date) => setFormData({ ...formData, availabilityOverrideUntil: date })}
                    min={new Date().toISOString().split('T')[0]}
                    placeholder="Select date"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Opening Time</label>
                <input
                  type="time"
                  value={formData.fixedDailyOpen}
                  onChange={(e) => setFormData({ ...formData, fixedDailyOpen: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Closing Time</label>
                <input
                  type="time"
                  value={formData.fixedDailyClose}
                  onChange={(e) => setFormData({ ...formData, fixedDailyClose: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Daily Cut-off Time</label>
                <input
                  type="time"
                  value={formData.orderCutoffTime}
                  onChange={(e) => setFormData({ ...formData, orderCutoffTime: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Max Daily Orders</label>
                <input
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={formData.maxDailyOrders ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxDailyOrders: e.target.value === '' ? null : parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
                />
              </div>
            </div>
          </div>

          {/* Payment & Payouts */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Direct Payout Accounts</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Customers transfer funds directly to these accounts when selecting Bank Transfer, JazzCash, or EasyPaisa.
              </p>
            </div>

            {/* JazzCash Section */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                JazzCash Account
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">JazzCash Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="03XXXXXXXXX"
                    value={formData.jazzcashNumber}
                    onChange={(e) => setFormData({ ...formData, jazzcashNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Account Title (Name on JazzCash)</label>
                  <input
                    type="text"
                    placeholder="e.g. Bareera Zarish"
                    value={formData.jazzcashAccountTitle}
                    onChange={(e) => setFormData({ ...formData, jazzcashAccountTitle: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                  />
                </div>
              </div>
            </div>

            {/* EasyPaisa Section */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                EasyPaisa Account
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">EasyPaisa Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="03XXXXXXXXX"
                    value={formData.easypaisaNumber}
                    onChange={(e) => setFormData({ ...formData, easypaisaNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Account Title (Name on EasyPaisa)</label>
                  <input
                    type="text"
                    placeholder="e.g. Bareera Zarish"
                    value={formData.easypaisaAccountTitle}
                    onChange={(e) => setFormData({ ...formData, easypaisaAccountTitle: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Bank Transfer / IBFT Section */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Bank Transfer / Raast (IBFT)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Bank Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Bank Alfalah / Meezan Bank"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Account Title</label>
                  <input
                    type="text"
                    placeholder="Account Holder Name"
                    value={formData.bankAccountName}
                    onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">IBAN / Account Number</label>
                  <input
                    type="text"
                    placeholder="PK00XXXX..."
                    value={formData.bankAccountNumber}
                    onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stock Alerts */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Stock Alerts</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Receive alert when food portion inventory runs low</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Threshold:</span>
              <input
                type="number"
                min={1}
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value, 10) || 5 })}
                className="w-16 px-2.5 py-1 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#FF5500]"
              />
            </div>
          </div>

          {/* Save Action */}
          <div className="flex items-center justify-end pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#FF5500] hover:bg-[#e04400] text-white px-7 py-2.5 rounded-xl font-bold text-xs shadow-sm transition-all"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
