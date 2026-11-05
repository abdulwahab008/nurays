'use client';

import { useState, useEffect } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorDetails, apiErrorMessage } from '@/lib/api-client';
import { DatePicker } from '@/components/ui/DatePicker';
import { bankAccountIsWrong, walletNumberIsWrong } from '@/lib/payout-account';
import { sendAskingForPassword } from '@/lib/send-asking-for-password';
import { useShallow } from 'zustand/react/shallow';

const MEAL_CATEGORIES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'brunch', label: 'Brunch' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'evening_snacks', label: 'Evening snacks' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'late_night', label: 'Late night' },
  { value: 'desserts', label: 'Desserts' },
  { value: 'beverages', label: 'Beverages' },
];

const BUSINESS_TYPES = [
  { value: 'home_kitchen', label: 'Home kitchen' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'cafe', label: 'Café' },
  { value: 'cloud_kitchen', label: 'Cloud kitchen' },
];

const WALLET_NUMBER_PROBLEM = 'Enter a Pakistani mobile number such as 03001234567.';
const BANK_ACCOUNT_PROBLEM = 'Enter an IBAN such as PK36SCBL0000001123456702, or an account number of 8 to 20 digits.';

const AVAILABILITY_OVERRIDES = [
  { value: '', label: 'Normal hours' },
  { value: 'open', label: 'Open, whatever the hours' },
  { value: 'closed', label: 'Closed for now' },
  { value: 'busy', label: 'Too busy for new orders' },
  { value: 'vacation', label: 'On holiday' },
];

export default function SellerSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const { ask: askDialog } = useDialogs();
  const [loading, setLoading] = useState(false);
  // Why the kitchen's settings could not be read. Until they were read there is no form: it would hold blanks and made-up defaults,
  // and saving them would replace the kitchen's real profile, payout accounts, delivery terms and hours.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [settingsRead, setSettingsRead] = useState(false);
  // What is wrong with a payout account number typed in the form, by field: customers pay into these, so a wrong digit pays a stranger.
  const [payoutErrors, setPayoutErrors] = useState<Record<string, string>>({});
  // The numbers the server holds (as loaded, or as last saved). One the kitchen has not touched is not checked again: it may have been
  // saved before the numbers were checked, and it must not stop the rest of the settings from being saved.
  const [heldNumbers, setHeldNumbers] = useState({ jazzcashNumber: '', easypaisaNumber: '', bankAccountNumber: '' });

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
  // The form as the server holds it (as loaded, or as last saved): Save changes stays quiet until the form differs from it.
  const [savedForm, setSavedForm] = useState(formData);
  const changed = JSON.stringify(formData) !== JSON.stringify(savedForm);

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

        setHeldNumbers({
          jazzcashNumber: seller.jazzcashNumber || '',
          easypaisaNumber: seller.easypaisaNumber || '',
          bankAccountNumber: seller.bankAccountNumber || '',
        });
        const loaded: typeof formData = {
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

          // A value the list does not offer (an old record) would be refused when the form is saved: start from a valid one.
          businessType: BUSINESS_TYPES.some((b) => b.value === seller.businessType) ? seller.businessType : 'home_kitchen',
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
        };
        setFormData(loaded);
        setSavedForm(loaded);
        setSettingsRead(true);
      } else {
        throw new Error('The settings were not in the answer');
      }
    } catch (error: unknown) {
      console.error('Failed to load settings:', error);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('This page is for kitchens.', 'error');
      return;
    }

    loadSettings();
  }, [isAuthenticated, user, router]);

  /** A number typed again no longer shows the message about what was typed before. */
  const clearPayoutError = (field: string) =>
    setPayoutErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

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
    if (!settingsRead) return;

    const problems: Record<string, string> = {};
    const numberChanged = (field: keyof typeof heldNumbers) => formData[field].trim() !== heldNumbers[field];
    if (numberChanged('jazzcashNumber') && walletNumberIsWrong(formData.jazzcashNumber)) problems.jazzcashNumber = WALLET_NUMBER_PROBLEM;
    if (numberChanged('easypaisaNumber') && walletNumberIsWrong(formData.easypaisaNumber)) problems.easypaisaNumber = WALLET_NUMBER_PROBLEM;
    if (numberChanged('bankAccountNumber') && bankAccountIsWrong(formData.bankAccountNumber)) problems.bankAccountNumber = BANK_ACCOUNT_PROBLEM;
    setPayoutErrors(problems);
    if (Object.keys(problems).length > 0) {
      showToast('Check the account numbers marked in red.', 'error');
      return;
    }

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

      let deliveryPayload: Record<string, unknown> = {
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
        showToast('Enter your kitchen name.', 'error');
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

      // Changing where customers send their money asks for the password again (a stolen session must not be able to re-point it
      // alone): the server says so, we ask, and the same save goes again with the password. Nothing is saved until then.
      const saved = await sendAskingForPassword(
        (currentPassword) =>
          apiClient.patch('/sellers/me', {
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
            orderCutoffTime: orderCutoffTime || null,
            maxDailyOrders: maxDailyOrders ?? undefined,
            minPrepTimeMinutes: minPrepTimeMinutes ?? undefined,
            preOrderOnly,
            advanceBookingMinDays: advanceBookingMinDays ?? undefined,
            advanceBookingMaxDays: advanceBookingMaxDays ?? undefined,
            ...(currentPassword ? { currentPassword } : {}),
          }),
        () =>
          askDialog({
            title: 'Enter your password',
            message: 'You are changing the accounts customers pay into. Enter your password to save.',
            type: 'password',
            confirmText: 'Save',
          })
      );
      if (!saved) {
        showToast('Nothing was saved: your password was not entered.', 'info');
        return;
      }

      // The server keeps each number in one form (03001234567, PK36…): show what it kept.
      const kept = saved.data?.data;
      if (kept) {
        const numbers = { jazzcashNumber: kept.jazzcashNumber ?? '', easypaisaNumber: kept.easypaisaNumber ?? '', bankAccountNumber: kept.bankAccountNumber ?? '' };
        setHeldNumbers(numbers);
        setFormData((prev) => ({ ...prev, ...numbers }));
        setSavedForm({ ...formData, ...numbers });
      } else {
        setSavedForm(formData);
      }
      showToast('Settings saved.', 'success');
    } catch (error) {
      const firstIssue = (apiErrorDetails(error) as Array<{ message?: string }> | undefined)?.[0]?.message;
      showToast(firstIssue || apiErrorMessage(error, 'Could not save your settings'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    'w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-muted focus:outline-none focus:ring-3 focus:ring-brand/30 focus:border-brand-600';
  const labelClass = 'block text-sm font-medium text-ink mb-1.5';
  const payoutFieldClass = (field: string) =>
    `${fieldClass} ${payoutErrors[field] ? 'border-red-700 focus:border-red-700' : ''}`;
  const chipClass = (on: boolean) =>
    `inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
      on ? 'border-brand-600 bg-brand-soft text-brand-soft-ink font-medium' : 'border-line-strong bg-surface text-ink hover:bg-raised'
    }`;
  const sectionClass = 'py-8 border-t border-line first:border-t-0 first:pt-0';
  const headingClass = 'text-sm font-semibold text-ink';

  // No form until the kitchen's own settings were read: the boxes would hold blanks, and saving them would replace the real ones.
  if (!settingsRead) {
    return (
      <DashboardLayout
        title="Settings"
        subtitle="Your kitchen, hours, delivery and payout accounts"
        sidebarItems={SELLER_SIDEBAR_ITEMS}
        userType="seller"
      >
        <div className="max-w-3xl pb-16">
          {loadError ? (
            <LoadError error={loadError} onRetry={loadSettings} title="We couldn't load your kitchen settings" />
          ) : (
            <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
              <span className="h-5 w-5 rounded-full border-2 border-line-strong border-t-brand-600 motion-safe:animate-spin" aria-hidden="true" />
              Loading your settings…
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Settings"
      subtitle="Your kitchen, hours, delivery and payout accounts"
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <form onSubmit={handleSubmit} className="max-w-3xl pb-16">
        <section aria-labelledby="hours-heading" className={sectionClass}>
          <h2 id="hours-heading" className={headingClass}>Hours</h2>
          <p className="text-sm text-muted mt-1">When customers can order from you.</p>

          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="availability-override" className={labelClass}>Right now</label>
                <select
                  id="availability-override"
                  value={formData.availabilityOverride}
                  onChange={(e) => setFormData({ ...formData, availabilityOverride: e.target.value })}
                  className={fieldClass}
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
                  <label htmlFor="availability-override-until" className={labelClass}>Until</label>
                  <DatePicker
                    id="availability-override-until"
                    value={formData.availabilityOverrideUntil}
                    onChange={(date) => setFormData({ ...formData, availabilityOverrideUntil: date })}
                    min={new Date().toISOString().split('T')[0]}
                    placeholder="Pick a date"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="open-time" className={labelClass}>Opens at</label>
                <input
                  id="open-time"
                  type="time"
                  value={formData.fixedDailyOpen}
                  onChange={(e) => setFormData({ ...formData, fixedDailyOpen: e.target.value })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="close-time" className={labelClass}>Closes at</label>
                <input
                  id="close-time"
                  type="time"
                  value={formData.fixedDailyClose}
                  onChange={(e) => setFormData({ ...formData, fixedDailyClose: e.target.value })}
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="cutoff-time" className={labelClass}>Last order of the day</label>
                <input
                  id="cutoff-time"
                  type="time"
                  value={formData.orderCutoffTime}
                  onChange={(e) => setFormData({ ...formData, orderCutoffTime: e.target.value })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="max-orders" className={labelClass}>Most orders in a day</label>
                <input
                  id="max-orders"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="No limit"
                  value={formData.maxDailyOrders ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxDailyOrders: e.target.value === '' ? null : parseInt(e.target.value, 10),
                    })
                  }
                  className={fieldClass}
                />
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="kitchen-heading" className={sectionClass}>
          <h2 id="kitchen-heading" className={headingClass}>Your kitchen</h2>
          <p className="text-sm text-muted mt-1">What customers see on your kitchen page.</p>

          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="business-name" className={labelClass}>Kitchen name</label>
                <input
                  id="business-name"
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className={fieldClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="business-name-urdu" className={labelClass}>Kitchen name in Urdu</label>
                <input
                  id="business-name-urdu"
                  type="text"
                  dir="rtl"
                  value={formData.businessNameUrdu}
                  onChange={(e) => setFormData({ ...formData, businessNameUrdu: e.target.value })}
                  placeholder="مثلاً: فاطمہ کچن"
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="description" className={labelClass}>About your kitchen</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="What you cook and what you are known for"
                className={`${fieldClass} py-2.5`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="business-type" className={labelClass}>Kind of kitchen</label>
                <select
                  id="business-type"
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                  className={fieldClass}
                >
                  {BUSINESS_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="store-notice" className={labelClass}>Notice on your page</label>
                <input
                  id="store-notice"
                  type="text"
                  value={formData.storeNotice}
                  onChange={(e) => setFormData({ ...formData, storeNotice: e.target.value })}
                  placeholder="Biryani this weekend only"
                  className={fieldClass}
                />
              </div>
            </div>

            <fieldset>
              <legend className={labelClass}>Meals you cook</legend>
              <div className="flex flex-wrap gap-2">
                {MEAL_CATEGORIES.map((c) => {
                  const on = formData.mealCategories.includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleMealCategory(c.value)}
                      className={chipClass(on)}
                    >
                      {c.label}
                    </button>
                  );
                })}
                {formData.mealCategories
                  .filter((cat) => !MEAL_CATEGORIES.some((c) => c.value === cat))
                  .map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={true}
                      aria-label={`Remove ${cat}`}
                      onClick={() => toggleMealCategory(cat)}
                      className={chipClass(true)}
                    >
                      {cat}
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  ))}
              </div>
            </fieldset>
          </div>
        </section>

        <section aria-labelledby="delivery-heading" className={sectionClass}>
          <h2 id="delivery-heading" className={headingClass}>Delivery</h2>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
            <p className="text-sm text-muted">
              {deliveryModel === 'model_a' ? 'Nuray riders deliver your orders.' : 'You deliver your orders yourself.'}
            </p>
            <Link
              href="/sellers/delivery"
              className="inline-flex items-center min-h-11 text-sm font-medium text-brand-ink hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 rounded"
            >
              Change
            </Link>
          </div>

          {deliveryModel === 'model_b' && (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="delivery-fee" className={labelClass}>Delivery fee</label>
                  <div className="relative">
                    <input
                      id="delivery-fee"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={10}
                      value={formData.deliveryFeeFixed ?? 50}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          deliveryFeeFixed: e.target.value === '' ? null : parseInt(e.target.value, 10),
                        })
                      }
                      className={`${fieldClass} pe-12 tabular-nums`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted">Rs</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="free-radius" className={labelClass}>Free delivery within</label>
                  <div className="relative">
                    <input
                      id="free-radius"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      value={formData.freeDeliveryRadiusKm ?? 2.5}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          freeDeliveryRadiusKm: e.target.value === '' ? null : parseFloat(e.target.value),
                        })
                      }
                      className={`${fieldClass} pe-12 tabular-nums`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted">km</span>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="free-area" className={labelClass}>Free delivery to these areas</label>
                <div className="flex gap-2">
                  <input
                    id="free-area"
                    type="text"
                    value={newAreaInput}
                    onChange={(e) => setNewAreaInput(e.target.value)}
                    placeholder="Askari 11"
                    className={`${fieldClass} flex-1 min-w-0`}
                  />
                  <Button type="button" onClick={handleAddArea} variant="outline">
                    Add
                  </Button>
                </div>

                {formData.freeDeliveryAreas.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {formData.freeDeliveryAreas.map((area) => (
                      <li
                        key={area}
                        className="inline-flex items-center gap-1 min-h-11 ps-4 rounded-full bg-raised text-sm text-ink"
                      >
                        {area}
                        <button
                          type="button"
                          onClick={() => handleRemoveArea(area)}
                          aria-label={`Remove ${area}`}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-ink hover:bg-line focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="payout-heading" className={sectionClass}>
          <h2 id="payout-heading" className={headingClass}>Where customers pay you</h2>
          <p className="text-sm text-muted mt-1">
            Customers who pay by JazzCash, Easypaisa or bank transfer send the money here. Check every digit: a wrong number sends their
            money to someone else. Changing an account asks for your password.
          </p>

          <div className="mt-6 space-y-7">
            <fieldset className="space-y-4">
              <legend className="text-sm font-medium text-ink mb-3">JazzCash</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="jazzcash-number" className={labelClass}>Mobile number</label>
                  <input
                    id="jazzcash-number"
                    type="tel"
                    dir="ltr"
                    placeholder="03XXXXXXXXX"
                    value={formData.jazzcashNumber}
                    onChange={(e) => {
                      setFormData({ ...formData, jazzcashNumber: e.target.value });
                      clearPayoutError('jazzcashNumber');
                    }}
                    aria-invalid={Boolean(payoutErrors.jazzcashNumber)}
                    aria-describedby={payoutErrors.jazzcashNumber ? 'jazzcash-number-error' : undefined}
                    className={payoutFieldClass('jazzcashNumber')}
                  />
                  {payoutErrors.jazzcashNumber && <p id="jazzcash-number-error" role="alert" className="text-sm text-red-700 mt-1.5">{payoutErrors.jazzcashNumber}</p>}
                </div>
                <div>
                  <label htmlFor="jazzcash-title" className={labelClass}>Name on the account</label>
                  <input
                    id="jazzcash-title"
                    type="text"
                    placeholder="As written on the account"
                    value={formData.jazzcashAccountTitle}
                    onChange={(e) => setFormData({ ...formData, jazzcashAccountTitle: e.target.value })}
                    className={fieldClass}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="text-sm font-medium text-ink mb-3">Easypaisa</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="easypaisa-number" className={labelClass}>Mobile number</label>
                  <input
                    id="easypaisa-number"
                    type="tel"
                    dir="ltr"
                    placeholder="03XXXXXXXXX"
                    value={formData.easypaisaNumber}
                    onChange={(e) => {
                      setFormData({ ...formData, easypaisaNumber: e.target.value });
                      clearPayoutError('easypaisaNumber');
                    }}
                    aria-invalid={Boolean(payoutErrors.easypaisaNumber)}
                    aria-describedby={payoutErrors.easypaisaNumber ? 'easypaisa-number-error' : undefined}
                    className={payoutFieldClass('easypaisaNumber')}
                  />
                  {payoutErrors.easypaisaNumber && <p id="easypaisa-number-error" role="alert" className="text-sm text-red-700 mt-1.5">{payoutErrors.easypaisaNumber}</p>}
                </div>
                <div>
                  <label htmlFor="easypaisa-title" className={labelClass}>Name on the account</label>
                  <input
                    id="easypaisa-title"
                    type="text"
                    placeholder="As written on the account"
                    value={formData.easypaisaAccountTitle}
                    onChange={(e) => setFormData({ ...formData, easypaisaAccountTitle: e.target.value })}
                    className={fieldClass}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="text-sm font-medium text-ink mb-3">Bank transfer or Raast</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="bank-name" className={labelClass}>Bank</label>
                  <input
                    id="bank-name"
                    type="text"
                    placeholder="Bank name"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="bank-title" className={labelClass}>Name on the account</label>
                  <input
                    id="bank-title"
                    type="text"
                    placeholder="As written on the account"
                    value={formData.bankAccountName}
                    onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="bank-number" className={labelClass}>IBAN or account number</label>
                  <input
                    id="bank-number"
                    type="text"
                    dir="ltr"
                    placeholder="PK.. or account number"
                    value={formData.bankAccountNumber}
                    onChange={(e) => {
                      setFormData({ ...formData, bankAccountNumber: e.target.value });
                      clearPayoutError('bankAccountNumber');
                    }}
                    aria-invalid={Boolean(payoutErrors.bankAccountNumber)}
                    aria-describedby={payoutErrors.bankAccountNumber ? 'bank-number-error' : undefined}
                    className={payoutFieldClass('bankAccountNumber')}
                  />
                  {payoutErrors.bankAccountNumber && <p id="bank-number-error" role="alert" className="text-sm text-red-700 mt-1.5">{payoutErrors.bankAccountNumber}</p>}
                </div>
              </div>
            </fieldset>
          </div>
        </section>

        <section aria-labelledby="stock-heading" className={sectionClass}>
          <h2 id="stock-heading" className={headingClass}>Running low</h2>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor="low-stock" className="text-[15px] text-ink">Tell me when a dish has this many portions left</label>
            <input
              id="low-stock"
              type="number"
              inputMode="numeric"
              min={1}
              value={formData.lowStockThreshold}
              onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value, 10) || 5 })}
              className={`${fieldClass.replace('w-full', 'w-24')} tabular-nums`}
            />
          </div>
        </section>

        <div className="sticky bottom-0 z-10 mt-8 flex justify-end border-t border-line bg-page/95 py-4 pb-[calc(1rem+var(--safe-bottom,0px))] backdrop-blur">
          <Button type="submit" disabled={loading || !changed} className="min-h-11 w-full px-6 sm:w-auto">
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </DashboardLayout>
  );
}
