'use client';

import { useState, useEffect, useMemo } from 'react';
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
import LocationMap from '@/components/ui/LocationMap';
import { bankAccountIsWrong, walletNumberIsWrong } from '@/lib/payout-account';
import { sendAskingForPassword } from '@/lib/send-asking-for-password';
import { useShallow } from 'zustand/react/shallow';
import { useT } from '@/lib/i18n';
import { kitchenSettingsMessages } from '@/lib/i18n/messages/kitchen-settings';

const MEAL_CATEGORIES = [
  { value: 'breakfast', label: 'meal.breakfast' },
  { value: 'brunch', label: 'meal.brunch' },
  { value: 'lunch', label: 'meal.lunch' },
  { value: 'evening_snacks', label: 'meal.evening_snacks' },
  { value: 'dinner', label: 'meal.dinner' },
  { value: 'late_night', label: 'meal.late_night' },
  { value: 'desserts', label: 'meal.desserts' },
  { value: 'beverages', label: 'meal.beverages' },
] as const;

const BUSINESS_TYPES = [
  { value: 'home_kitchen', label: 'type.home_kitchen' },
  { value: 'restaurant', label: 'type.restaurant' },
  { value: 'bakery', label: 'type.bakery' },
  { value: 'cafe', label: 'type.cafe' },
  { value: 'cloud_kitchen', label: 'type.cloud_kitchen' },
] as const;


type ScheduleMode = '24_7' | 'fixed_daily' | 'per_day';

const SCHEDULE_MODES = [
  { value: '24_7', label: 'mode.24_7', hint: 'mode.24_7.hint' },
  { value: 'fixed_daily', label: 'mode.fixed_daily', hint: 'mode.fixed_daily.hint' },
  { value: 'per_day', label: 'mode.per_day', hint: 'mode.per_day.hint' },
] as const;

const WEEK_DAYS = [
  { key: 'monday', label: 'day.monday' },
  { key: 'tuesday', label: 'day.tuesday' },
  { key: 'wednesday', label: 'day.wednesday' },
  { key: 'thursday', label: 'day.thursday' },
  { key: 'friday', label: 'day.friday' },
  { key: 'saturday', label: 'day.saturday' },
  { key: 'sunday', label: 'day.sunday' },
] as const;
type WeekDay = (typeof WEEK_DAYS)[number]['key'];
type Session = { name: string; open: string; close: string };
// One row per day on the form. A day saved earlier with more than one session keeps the others as they were (`more`).
type DayHours = { closed: boolean; open: string; close: string; more: Session[] };
type WeekHours = Record<WeekDay, DayHours>;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Is `time` inside the open hours `open`–`close`? Closing at or before opening means the kitchen stays open past midnight. */
const insideHours = (time: string, open: string, close: string) => {
  const t = toMinutes(time);
  const o = toMinutes(open);
  const c = toMinutes(close);
  return c > o ? t >= o && t <= c : t >= o || t <= c;
};

function weekFromSaved(weekly: unknown, fallbackOpen: string, fallbackClose: string): WeekHours {
  const saved = (weekly && typeof weekly === 'object' ? weekly : {}) as Partial<Record<WeekDay, { closed?: boolean; sessions?: Session[] }>>;
  const week = {} as WeekHours;
  for (const { key } of WEEK_DAYS) {
    const day = saved[key];
    const sessions = Array.isArray(day?.sessions) ? day.sessions : [];
    week[key] = day
      ? { closed: Boolean(day.closed) || sessions.length === 0, open: sessions[0]?.open ?? '', close: sessions[0]?.close ?? '', more: sessions.slice(1) }
      : { closed: false, open: fallbackOpen, close: fallbackClose, more: [] };
  }
  return week;
}

const AVAILABILITY_OVERRIDES = [
  { value: '', label: 'override.none' },
  { value: 'open', label: 'override.open' },
  { value: 'closed', label: 'override.closed' },
  { value: 'busy', label: 'override.busy' },
  { value: 'vacation', label: 'override.vacation' },
] as const;

const TABS = [
  { id: 'hours', label: 'hours' },
  { id: 'kitchen', label: 'kitchen' },
  { id: 'location', label: 'location' },
  { id: 'delivery', label: 'delivery' },
  { id: 'payout', label: 'accounts' },
  { id: 'stock', label: 'runningLow' },
] as const;
type SettingsTab = (typeof TABS)[number]['id'];

/** Moves focus once the tab just chosen has rendered. */
const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

export default function SellerSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const { ask: askDialog } = useDialogs();
  const t = useT(kitchenSettingsMessages);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<SettingsTab>('hours');
  // Why the kitchen's settings could not be read. Until they were read there is no form: it would hold blanks and made-up defaults,
  // and saving them would replace the kitchen's real profile, payout accounts, delivery terms and hours.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [settingsRead, setSettingsRead] = useState(false);
  // What is wrong with a payout account number typed in the form, by field: customers pay into these, so a wrong digit pays a stranger.
  const [payoutErrors, setPayoutErrors] = useState<Record<string, string>>({});
  // The numbers the server holds (as loaded, or as last saved). One the kitchen has not touched is not checked again: it may have been
  // saved before the numbers were checked, and it must not stop the rest of the settings from being saved.
  const [heldNumbers, setHeldNumbers] = useState({ jazzcashNumber: '', easypaisaNumber: '', bankAccountNumber: '' });

  // What is wrong with the hours typed in the form, by field (open-time, close-time, cutoff-time, or a day's key).
  const [hoursErrors, setHoursErrors] = useState<Record<string, string>>({});
  // Where the map opens when the kitchen has no pin yet: the middle of its community.
  const [communityCentre, setCommunityCentre] = useState<{ lat: number; lng: number } | null>(null);

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
    latitude: null as number | null,
    longitude: null as number | null,
    pickupAddress: '',
    pickupLandmark: '',
    pickupPhone: '',
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

    scheduleMode: '24_7' as ScheduleMode,
    fixedDailyOpen: '',
    fixedDailyClose: '',
    weekly: weekFromSaved(null, '', ''),

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
          // No pin is no pin: a made-up one would send riders to the wrong street.
          latitude: seller.latitude != null ? parseFloat(String(seller.latitude)) : null,
          longitude: seller.longitude != null ? parseFloat(String(seller.longitude)) : null,
          pickupAddress: seller.pickupAddress || '',
          pickupLandmark: seller.pickupLandmark || '',
          pickupPhone: seller.pickupPhone || '',
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

          // The server's default is always open; times are only shown when the kitchen saved some.
          scheduleMode: SCHEDULE_MODES.some((m) => m.value === seller.scheduleMode) ? seller.scheduleMode : '24_7',
          fixedDailyOpen: seller.operatingHours?.fixedDaily?.open || '',
          fixedDailyClose: seller.operatingHours?.fixedDaily?.close || '',
          weekly: weekFromSaved(
            seller.operatingHours?.weekly,
            seller.operatingHours?.fixedDaily?.open || '',
            seller.operatingHours?.fixedDaily?.close || ''
          ),

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
        if (loaded.latitude == null && seller.communityId) {
          apiClient
            .get('/communities')
            .then((res) => {
              const c = (res.data.data || []).find((x: { id: string }) => x.id === seller.communityId);
              if (c?.centerLatitude != null && c?.centerLongitude != null) setCommunityCentre({ lat: Number(c.centerLatitude), lng: Number(c.centerLongitude) });
            })
            .catch(() => undefined);
        }
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

  // Other pages link to a section, e.g. #payout-heading.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace('#', '').replace(/-heading$/, '');
      const match = TABS.find((x) => x.id === id);
      if (match) setTab(match.id);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast(t('accessDenied'), 'error');
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

  /** What is wrong with the hours, keyed by the field to mark: the times must make sense before customers are shown them. */
  const hoursProblems = () => {
    const problems: Record<string, string> = {};
    const { scheduleMode, fixedDailyOpen, fixedDailyClose, orderCutoffTime, weekly } = formData;
    if (scheduleMode === 'fixed_daily') {
      if (!fixedDailyOpen) problems['open-time'] = t('err.openTime');
      if (!fixedDailyClose) problems['close-time'] = t('err.closeTime');
      else if (fixedDailyOpen && fixedDailyOpen === fixedDailyClose) problems['close-time'] = t('err.sameTimes');
      if (!problems['open-time'] && !problems['close-time'] && orderCutoffTime && !insideHours(orderCutoffTime, fixedDailyOpen, fixedDailyClose)) {
        problems['cutoff-time'] = t('err.cutoffOutside');
      }
    }
    if (scheduleMode === 'per_day') {
      for (const { key } of WEEK_DAYS) {
        const day = weekly[key];
        if (day.closed) continue;
        if (!day.open || !day.close) problems[key] = t('err.dayTimes');
        else if (toMinutes(day.close) <= toMinutes(day.open)) problems[key] = t('err.dayOrder');
      }
      if (WEEK_DAYS.every(({ key }) => weekly[key].closed)) problems[WEEK_DAYS[0].key] = t('err.noDays');
      const openDays = WEEK_DAYS.map(({ key }) => weekly[key]).filter((d) => !d.closed && d.open && d.close);
      if (orderCutoffTime && openDays.length > 0 && !openDays.some((d) => insideHours(orderCutoffTime, d.open, d.close))) {
        problems['cutoff-time'] = t('err.cutoffOutside');
      }
    }
    return problems;
  };

  const clearHoursError = (field: string) =>
    setHoursErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const setDay = (key: WeekDay, change: Partial<DayHours>) => {
    setFormData((prev) => ({ ...prev, weekly: { ...prev.weekly, [key]: { ...prev.weekly[key], ...change } } }));
    clearHoursError(key);
  };

  const chooseScheduleMode = (mode: ScheduleMode) => {
    setFormData((prev) => {
      // Moving to per-day hours from the same-every-day ones starts each unset day from those times.
      if (mode !== 'per_day' || !prev.fixedDailyOpen || !prev.fixedDailyClose) return { ...prev, scheduleMode: mode };
      const weekly = { ...prev.weekly };
      for (const { key } of WEEK_DAYS) {
        if (!weekly[key].closed && !weekly[key].open && !weekly[key].close) weekly[key] = { ...weekly[key], open: prev.fixedDailyOpen, close: prev.fixedDailyClose };
      }
      return { ...prev, scheduleMode: mode, weekly };
    });
    setHoursErrors({});
  };

  const pin = useMemo(
    () => (formData.latitude != null && formData.longitude != null ? { lat: formData.latitude, lng: formData.longitude } : null),
    [formData.latitude, formData.longitude]
  );
  const mapCentre = useMemo(() => pin ?? communityCentre ?? { lat: 31.5204, lng: 74.3587 }, [pin, communityCentre]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsRead) return;

    const problems: Record<string, string> = {};
    const numberChanged = (field: keyof typeof heldNumbers) => formData[field].trim() !== heldNumbers[field];
    if (numberChanged('jazzcashNumber') && walletNumberIsWrong(formData.jazzcashNumber)) problems.jazzcashNumber = t('walletProblem');
    if (numberChanged('easypaisaNumber') && walletNumberIsWrong(formData.easypaisaNumber)) problems.easypaisaNumber = t('walletProblem');
    if (numberChanged('bankAccountNumber') && bankAccountIsWrong(formData.bankAccountNumber)) problems.bankAccountNumber = t('bankProblem');
    setPayoutErrors(problems);

    const hourProblems = hoursProblems();
    setHoursErrors(hourProblems);
    const firstHourProblem = Object.keys(hourProblems)[0];
    if (firstHourProblem) {
      showToast(t('err.hoursToast'), 'error');
      setTab('hours');
      focusSoon(firstHourProblem.endsWith('-time') ? firstHourProblem : `day-${firstHourProblem}-open`);
      return;
    }
    if (Object.keys(problems).length > 0) {
      showToast(t('err.accountsToast'), 'error');
      setTab('payout');
      return;
    }
    // Nuray's riders collect from the pin, so a kitchen they deliver for cannot be saved without one.
    if (deliveryModel === 'model_a' && !pin) {
      showToast(t('needPin'), 'error');
      setTab('location');
      return;
    }

    setLoading(true);

    try {
      const {
        freeDeliveryAreas,
        freeDeliveryRadiusKm,
        latitude,
        longitude,
        pickupAddress,
        pickupLandmark,
        pickupPhone,
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
        weekly,
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

      // Always open leaves the saved hours alone, so switching back to them later finds them again.
      const operatingHours =
        scheduleMode === 'fixed_daily'
          ? { fixedDaily: { open: fixedDailyOpen, close: fixedDailyClose } }
          : scheduleMode === 'per_day'
            ? {
                ...(fixedDailyOpen && fixedDailyClose ? { fixedDaily: { open: fixedDailyOpen, close: fixedDailyClose } } : {}),
                weekly: Object.fromEntries(
                  WEEK_DAYS.map(({ key }) => {
                    const day = weekly[key];
                    return [
                      key,
                      day.closed
                        ? { closed: true, sessions: [] }
                        : { closed: false, sessions: [{ name: 'Open', open: day.open, close: day.close }, ...day.more] },
                    ];
                  })
                ),
              }
            : undefined;

      let deliveryPayload: Record<string, unknown> = {
        deliveryModes: deliveryModes && deliveryModes.length ? deliveryModes : ['delivery'],
        deliveryProvider: deliveryModel === 'model_b' ? 'self' : 'platform',
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        pickupAddress: pickupAddress.trim() || null,
        pickupLandmark: pickupLandmark.trim() || null,
        pickupPhone: pickupPhone.trim() || null,
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
        showToast(t('err.name'), 'error');
        setTab('kitchen');
        focusSoon('business-name');
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
        (wrongBefore) =>
          askDialog({
            title: t('pw.title'),
            message: wrongBefore
              ? t('pw.wrong')
              : t('pw.message'),
            type: 'password',
            confirmText: t('pw.confirm'),
          })
      );
      if (!saved) {
        showToast(t('notSaved'), 'info');
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
      showToast(t('saved'), 'success');
    } catch (error) {
      const firstIssue = (apiErrorDetails(error) as Array<{ message?: string }> | undefined)?.[0]?.message;
      showToast(firstIssue || apiErrorMessage(error, t('saveFailed')), 'error');
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
  const sectionClass = 'pt-6';
  const headingClass = 'sr-only';

  // No form until the kitchen's own settings were read: the boxes would hold blanks, and saving them would replace the real ones.
  if (!settingsRead) {
    return (
      <DashboardLayout
        title={t('title')}
        subtitle={t('subtitle')}
        sidebarItems={SELLER_SIDEBAR_ITEMS}
        userType="seller"
      >
        <div className="max-w-3xl pb-16">
          {loadError ? (
            <LoadError error={loadError} onRetry={loadSettings} title={t('loadFailed')} />
          ) : (
            <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
              <span className="h-5 w-5 rounded-full border-2 border-line-strong border-t-brand-600 motion-safe:animate-spin" aria-hidden="true" />
              {t('loading')}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={t('title')}
      subtitle={t('subtitle')}
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <form onSubmit={handleSubmit} className="max-w-3xl pb-16">
        <div role="tablist" aria-label={t('jumpTo')} className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-5 overflow-x-auto border-b border-line [scrollbar-width:none]">
          {TABS.map(({ id, label }) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${id}-tab`}
                aria-selected={selected}
                aria-controls={`${id}-panel`}
                onClick={() => setTab(id)}
                className={`relative -mb-px min-h-11 pb-1 text-[15px] whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
                  selected ? 'border-brand-600 text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {t(label)}
              </button>
            );
          })}
        </div>
        <section id="hours-panel" role="tabpanel" aria-labelledby="hours-tab" hidden={tab !== 'hours'} className={sectionClass}>
          <h2 id="hours-heading" className={headingClass}>{t('hours')}</h2>
          <p className="text-sm text-muted mt-1">{t('hoursHint')}</p>

          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="availability-override" className={labelClass}>{t('rightNow')}</label>
                <select
                  id="availability-override"
                  value={formData.availabilityOverride}
                  onChange={(e) => setFormData({ ...formData, availabilityOverride: e.target.value })}
                  className={fieldClass}
                >
                  {AVAILABILITY_OVERRIDES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.label)}
                    </option>
                  ))}
                </select>
              </div>

              {formData.availabilityOverride && (
                <div>
                  <label htmlFor="availability-override-until" className={labelClass}>{t('until')}</label>
                  <DatePicker
                    id="availability-override-until"
                    value={formData.availabilityOverrideUntil}
                    onChange={(date) => setFormData({ ...formData, availabilityOverrideUntil: date })}
                    min={new Date().toISOString().split('T')[0]}
                    placeholder={t('pickDate')}
                  />
                </div>
              )}
            </div>

            <fieldset>
              <legend className={labelClass}>{t('whenOpen')}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {SCHEDULE_MODES.map((m) => {
                  const on = formData.scheduleMode === m.value;
                  return (
                    <label
                      key={m.value}
                      className={`flex min-h-11 cursor-pointer gap-3 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand/40 ${
                        on ? 'border-brand-600 bg-brand-soft' : 'border-line-strong bg-surface hover:bg-raised'
                      }`}
                    >
                      <input
                        type="radio"
                        name="schedule-mode"
                        value={m.value}
                        checked={on}
                        onChange={() => chooseScheduleMode(m.value)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-700"
                      />
                      <span>
                        <span className={`block text-sm font-medium ${on ? 'text-brand-soft-ink' : 'text-ink'}`}>{t(m.label)}</span>
                        <span className="block text-sm text-muted">{t(m.hint)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {formData.scheduleMode === 'fixed_daily' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {([
                  ['open-time', t('opensAt'), 'fixedDailyOpen'],
                  ['close-time', t('closesAt'), 'fixedDailyClose'],
                ] as const).map(([id, label, field]) => (
                  <div key={id}>
                    <label htmlFor={id} className={labelClass}>{label}</label>
                    <input
                      id={id}
                      type="time"
                      value={formData[field]}
                      onChange={(e) => {
                        setFormData({ ...formData, [field]: e.target.value });
                        clearHoursError(id);
                      }}
                      aria-invalid={Boolean(hoursErrors[id])}
                      aria-describedby={hoursErrors[id] ? `${id}-error` : undefined}
                      className={`${fieldClass} ${hoursErrors[id] ? 'border-red-700' : ''}`}
                    />
                    {hoursErrors[id] && <p id={`${id}-error`} role="alert" className="text-sm text-red-700 mt-1.5">{hoursErrors[id]}</p>}
                  </div>
                ))}
                {formData.fixedDailyOpen && formData.fixedDailyClose && toMinutes(formData.fixedDailyClose) < toMinutes(formData.fixedDailyOpen) && (
                  <p className="sm:col-span-2 -mt-2 text-sm text-muted">{t('pastMidnight')}</p>
                )}
              </div>
            )}

            {formData.scheduleMode === 'per_day' && (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {WEEK_DAYS.map(({ key, label }) => {
                  const day = formData.weekly[key];
                  const problem = hoursErrors[key];
                  return (
                    <li key={key} className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span id={`day-${key}-label`} className="w-24 text-sm font-medium text-ink">{t(label)}</span>
                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={!day.closed}
                            onChange={(e) => setDay(key, { closed: !e.target.checked })}
                            className="h-4 w-4 accent-brand-700"
                          />
                          {day.closed ? t('dayClosed') : t('dayOpen')}
                        </label>
                        {!day.closed && (
                          <div className="flex flex-1 items-center gap-2 min-w-[14rem]">
                            <input
                              id={`day-${key}-open`}
                              type="time"
                              aria-label={t('dayOpensAt', { day: t(label) })}
                              value={day.open}
                              onChange={(e) => setDay(key, { open: e.target.value })}
                              aria-invalid={Boolean(problem)}
                              aria-describedby={problem ? `day-${key}-error` : undefined}
                              className={`${fieldClass} flex-1 min-w-0 ${problem ? 'border-red-700' : ''}`}
                            />
                            <span className="text-sm text-muted">{t('to')}</span>
                            <input
                              id={`day-${key}-close`}
                              type="time"
                              aria-label={t('dayClosesAt', { day: t(label) })}
                              value={day.close}
                              onChange={(e) => setDay(key, { close: e.target.value })}
                              aria-invalid={Boolean(problem)}
                              aria-describedby={problem ? `day-${key}-error` : undefined}
                              className={`${fieldClass} flex-1 min-w-0 ${problem ? 'border-red-700' : ''}`}
                            />
                          </div>
                        )}
                      </div>
                      {problem && <p id={`day-${key}-error`} role="alert" className="text-sm text-red-700 mt-1.5">{problem}</p>}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="cutoff-time" className={labelClass}>{t('lastOrder')}</label>
                <input
                  id="cutoff-time"
                  type="time"
                  value={formData.orderCutoffTime}
                  onChange={(e) => {
                    setFormData({ ...formData, orderCutoffTime: e.target.value });
                    clearHoursError('cutoff-time');
                  }}
                  aria-invalid={Boolean(hoursErrors['cutoff-time'])}
                  aria-describedby={hoursErrors['cutoff-time'] ? 'cutoff-time-error' : 'cutoff-time-hint'}
                  className={`${fieldClass} ${hoursErrors['cutoff-time'] ? 'border-red-700' : ''}`}
                />
                {hoursErrors['cutoff-time'] ? (
                  <p id="cutoff-time-error" role="alert" className="text-sm text-red-700 mt-1.5">{hoursErrors['cutoff-time']}</p>
                ) : (
                  <p id="cutoff-time-hint" className="text-sm text-muted mt-1.5">{t('lastOrderHint')}</p>
                )}
              </div>
              <div>
                <label htmlFor="max-orders" className={labelClass}>{t('maxOrders')}</label>
                <input
                  id="max-orders"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder={t('noLimit')}
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

        <section id="kitchen-panel" role="tabpanel" aria-labelledby="kitchen-tab" hidden={tab !== 'kitchen'} className={sectionClass}>
          <h2 id="kitchen-heading" className={headingClass}>{t('kitchen')}</h2>
          <p className="text-sm text-muted mt-1">{t('kitchenHint')}</p>

          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="business-name" className={labelClass}>{t('kitchenName')}</label>
                <input
                  id="business-name"
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="business-name-urdu" className={labelClass}>{t('kitchenNameUrdu')}</label>
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
              <label htmlFor="description" className={labelClass}>{t('about')}</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder={t('aboutPh')}
                className={`${fieldClass} py-2.5`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="business-type" className={labelClass}>{t('kind')}</label>
                <select
                  id="business-type"
                  value={formData.businessType}
                  onChange={(e) => setFormData({ ...formData, businessType: e.target.value })}
                  className={fieldClass}
                >
                  {BUSINESS_TYPES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {t(b.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="store-notice" className={labelClass}>{t('notice')}</label>
                <input
                  id="store-notice"
                  type="text"
                  value={formData.storeNotice}
                  onChange={(e) => setFormData({ ...formData, storeNotice: e.target.value })}
                  placeholder={t('noticePh')}
                  className={fieldClass}
                />
              </div>
            </div>

            <fieldset>
              <legend className={labelClass}>{t('meals')}</legend>
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
                      {t(c.label)}
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
                      aria-label={t('remove', { name: cat })}
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

        <section id="location-panel" role="tabpanel" aria-labelledby="location-tab" hidden={tab !== 'location'} className={sectionClass}>
          <h2 id="location-heading" className={headingClass}>{t('location')}</h2>
          <p className="text-sm text-muted mt-1">
            {t('locationHint')}
          </p>
          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor="pickup-address" className={labelClass}>{t('pickupAddress')}</label>
              <input
                id="pickup-address"
                type="text"
                maxLength={300}
                autoComplete="street-address"
                value={formData.pickupAddress}
                onChange={(e) => setFormData({ ...formData, pickupAddress: e.target.value })}
                placeholder={t('pickupAddressPh')}
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="pickup-landmark" className={labelClass}>{t('pickupLandmark')}</label>
                <input
                  id="pickup-landmark"
                  type="text"
                  maxLength={200}
                  value={formData.pickupLandmark}
                  onChange={(e) => setFormData({ ...formData, pickupLandmark: e.target.value })}
                  placeholder={t('pickupLandmarkPh')}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="pickup-phone" className={labelClass}>{t('pickupPhone')}</label>
                <input
                  id="pickup-phone"
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  maxLength={20}
                  value={formData.pickupPhone}
                  onChange={(e) => setFormData({ ...formData, pickupPhone: e.target.value })}
                  placeholder={t('pickupPhonePh')}
                  aria-describedby="pickup-phone-hint"
                  className={fieldClass}
                />
                <p id="pickup-phone-hint" className="text-sm text-muted mt-1.5">{t('pickupPhoneHint')}</p>
              </div>
            </div>
            <div>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-sm font-medium text-ink">{t('onMap')}</span>
              <span className="text-sm text-muted tabular-nums" data-ltr>
                {pin ? `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : t('noPin')}
              </span>
            </div>
            <div className={`rounded-xl overflow-hidden ${pin ? '' : 'ring-2 ring-accent'}`}>
              {tab === 'location' && <LocationMap
                center={mapCentre}
                markerPosition={pin}
                height="280px"
                onLocationSelect={(coords) =>
                  setFormData((prev) => ({
                    ...prev,
                    latitude: Number(coords.lat.toFixed(6)),
                    longitude: Number(coords.lng.toFixed(6)),
                  }))
                }
              />}
            </div>
            <p className={`text-sm mt-1.5 ${pin ? 'text-muted' : 'text-accent-soft-ink'}`}>
              {pin ? t('movePin') : t('needPin')}
            </p>
            </div>
          </div>
        </section>

        <section id="delivery-panel" role="tabpanel" aria-labelledby="delivery-tab" hidden={tab !== 'delivery'} className={sectionClass}>
          <h2 id="delivery-heading" className={headingClass}>{t('delivery')}</h2>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
            <p className="text-sm text-muted">
              {deliveryModel === 'model_a' ? t('nurayDelivers') : t('selfDelivers')}
            </p>
            <Link
              href="/sellers/delivery"
              className="inline-flex items-center min-h-11 text-sm font-medium text-brand-ink hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 rounded"
            >
              {t('change')}
            </Link>
          </div>

          {deliveryModel === 'model_b' && (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="delivery-fee" className={labelClass}>{t('deliveryFee')}</label>
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
                  <label htmlFor="free-radius" className={labelClass}>{t('freeWithin')}</label>
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
                <label htmlFor="free-area" className={labelClass}>{t('freeAreas')}</label>
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
                    {t('add')}
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
                          aria-label={t('remove', { name: area })}
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

        <section id="payout-panel" role="tabpanel" aria-labelledby="payout-tab" hidden={tab !== 'payout'} className={sectionClass}>
          <h2 id="payout-heading" className={headingClass}>{t('accounts')}</h2>
          <p className="text-sm text-muted mt-1">
            {t('accountsHint')}
          </p>

          <div className="mt-6 space-y-7">
            <fieldset className="space-y-4">
              <legend className="text-sm font-medium text-ink mb-3">JazzCash</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="jazzcash-number" className={labelClass}>{t('mobileNumber')}</label>
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
                  <label htmlFor="jazzcash-title" className={labelClass}>{t('accountName')}</label>
                  <input
                    id="jazzcash-title"
                    type="text"
                    placeholder={t('accountNamePh')}
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
                  <label htmlFor="easypaisa-number" className={labelClass}>{t('mobileNumber')}</label>
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
                  <label htmlFor="easypaisa-title" className={labelClass}>{t('accountName')}</label>
                  <input
                    id="easypaisa-title"
                    type="text"
                    placeholder={t('accountNamePh')}
                    value={formData.easypaisaAccountTitle}
                    onChange={(e) => setFormData({ ...formData, easypaisaAccountTitle: e.target.value })}
                    className={fieldClass}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="text-sm font-medium text-ink mb-3">{t('bankTransfer')}</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="bank-name" className={labelClass}>{t('bank')}</label>
                  <input
                    id="bank-name"
                    type="text"
                    placeholder={t('bankPh')}
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="bank-title" className={labelClass}>{t('accountName')}</label>
                  <input
                    id="bank-title"
                    type="text"
                    placeholder={t('accountNamePh')}
                    value={formData.bankAccountName}
                    onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="bank-number" className={labelClass}>{t('iban')}</label>
                  <input
                    id="bank-number"
                    type="text"
                    dir="ltr"
                    placeholder={t('ibanPh')}
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

        <section id="stock-panel" role="tabpanel" aria-labelledby="stock-tab" hidden={tab !== 'stock'} className={sectionClass}>
          <h2 id="stock-heading" className={headingClass}>{t('runningLow')}</h2>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor="low-stock" className="text-[15px] text-ink">{t('lowStockLabel')}</label>
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

        <div data-bottom-bar className="sticky bottom-[var(--tabbar-offset)] z-10 mt-8 flex justify-end border-t border-line bg-page/95 py-4 pb-[calc(1rem+var(--safe-bottom,0px))] backdrop-blur">
          <Button type="submit" disabled={loading || !changed} className="min-h-11 w-full px-6 sm:w-auto disabled:bg-raised disabled:text-muted disabled:opacity-100">
            {loading ? t('saving') : t('saveChanges')}
          </Button>
        </div>
      </form>
    </DashboardLayout>
  );
}
