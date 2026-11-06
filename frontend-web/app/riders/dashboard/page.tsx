'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout, RIDER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { riderService, Delivery, RiderProfile } from '@/lib/services/rider.service';
import { formatPrice, formatTime, displayRating } from '@/lib/utils';
import { apiErrorMessage, apiErrorCode, apiErrorStatus } from '@/lib/api-client';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { useRiderLocation, LocationSharing } from '@/lib/hooks/use-rider-location';
import { BackgroundLocationNotice } from '@/components/riders/BackgroundLocationNotice';
import { BACKGROUND_LOCATION_CHOICE, backgroundLocationChoice, nativePlugins, type BackgroundLocationChoice, type NativeWindow } from '@/lib/native-shell';
import { alternativeMapsLink, canNavigateTo, googleMapsDirectionsUrl, mobilePlatform, NavDestination } from '@/lib/navigation-links';
import Link from 'next/link';
import { Banknote, Bike, Check, ChevronDown, LifeBuoy, Navigation, Phone, Snowflake, TriangleAlert, Undo2, X } from 'lucide-react';
import RiderApplicationForm from '@/components/riders/RiderApplicationForm';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { riderMessages, riderKeyFor, type RiderMessageKey } from '@/lib/i18n/messages/rider';
import { ExternalLink } from '@/components/ExternalLink';
import { reserveExternal } from '@/lib/open-external';
import { useShallow } from 'zustand/react/shallow';

const SHARING_BADGE: Record<LocationSharing, { labelKey: RiderMessageKey; tone: string; dot: string }> = {
  sharing: { labelKey: 'loc.sharing', tone: 'text-brand-ink', dot: 'bg-brand-600 motion-safe:animate-pulse' },
  waiting: { labelKey: 'loc.waiting', tone: 'text-muted', dot: 'bg-line-strong motion-safe:animate-pulse' },
  denied: { labelKey: 'loc.denied', tone: 'text-accent-soft-ink', dot: 'bg-accent-500' },
  unavailable: { labelKey: 'loc.unavailable', tone: 'text-accent-soft-ink', dot: 'bg-accent-500' },
  off: { labelKey: 'loc.off', tone: 'text-muted', dot: 'bg-line-strong' },
};

const TABS = ['active', 'available', 'history'] as const;

// A job that is over: delivered, reported failed, or called off (order cancelled).
const FINISHED_STATUSES = ['delivered', 'delivery_failed', 'cancelled'];

// Four steps the rider sees: to the kitchen, at the kitchen, on the way, at the door. Picked up and on the way are one
// step: "I've picked up the food" moves the job through both.
const STEP_ORDER: Record<string, number> = {
  assigned: 0,
  arrived_at_pickup: 1,
  picked_up: 2,
  in_transit: 2,
  arrived_at_customer: 3,
  delivered: 4,
};
const STEP_COUNT = 4;

// Order statuses from which the food has left, or may leave, the kitchen (as the server checks before a pickup).
const KITCHEN_READY_STATUSES = ['ready', 'dispatched', 'in_transit'];
const foodReady = (d: Delivery) => KITCHEN_READY_STATUSES.includes(d.orderStatus ?? '');

// The reason is sent in English for the support team; the rider reads it in their own language.
const REPORT_REASONS: [string, RiderMessageKey][] = [
  ['Customer unreachable', 'reason.unreachable'],
  ['Incorrect address', 'reason.address'],
  ['Customer refused package', 'reason.refused'],
  ['Cold-chain temperature issue', 'reason.coldChain'],
  ['Road accident / emergency', 'reason.accident'],
];

// A reported problem stays on the Current tab this long, with what to do with the food.
const FAILED_NOTICE_MS = 24 * 3600 * 1000;

const lastDigits = (d: Delivery) => (d.orderNumber || d.orderId).slice(-4);

const isToday = (iso: string | null | undefined) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString();
};

const dateLocale = () => (typeof document !== 'undefined' && document.documentElement.lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK');
const shortDate = (iso: string) => new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short' }).format(new Date(iso));

export default function RiderDashboardPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const t = useT(riderMessages);
  const tc = useT(commonMessages);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'available' | 'history'>('active');
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [available, setAvailable] = useState<Delivery[]>([]);
  const [mine, setMine] = useState<Delivery[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [togglingDuty, setTogglingDuty] = useState(false);
  // The job list carries the latest finished jobs only; "show older" asks for the most the server will send.
  const [olderShown, setOlderShown] = useState(false);
  const historyRef = useRef<number | undefined>(undefined);
  const profileLoadedRef = useRef(false);

  // Doorstep PIN Handshake Modal state
  const [pinModalDelivery, setPinModalDelivery] = useState<Delivery | null>(null);
  const [pinLocked, setPinLocked] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Report Issue Modal state
  const [reportModalDelivery, setReportModalDelivery] = useState<Delivery | null>(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [reporting, setReporting] = useState(false);

  // title is a message key; message is the server's words (or null for our default text).
  const [blockedReason, setBlockedReason] = useState<{ title: RiderMessageKey; message: string | null; code: string } | null>(null);
  // Why the jobs could not be read. A rider whose jobs could not be read must not be told "no active runs" (the food they
  // are carrying is one) or "no jobs in the pool".
  const [loadError, setLoadError] = useState<unknown>(null);

  const loadAll = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setBlockedReason(null);

      // The first read asks for the profile alone: an applicant or a paused account is told so by it, and the
      // job lists (refused for the same reason) are not asked for at all. Later reloads read everything at once.
      let firstProfile: Awaited<ReturnType<typeof riderService.getRiderProfile>> | null = null;
      if (!profileLoadedRef.current) {
        try {
          firstProfile = await riderService.getRiderProfile();
        } catch (error) {
          const code = apiErrorCode(error);
          if (code === 'RIDER_NOT_APPROVED' || code === 'RIDER_REJECTED' || code === 'RIDER_SUSPENDED') throw error;
        }
      }
      const [availableRes, mineRes, profileRes] = await Promise.all([
        riderService.getAvailableDeliveries(),
        riderService.getMyDeliveries({ history: historyRef.current }),
        firstProfile ?? riderService.getRiderProfile().catch(() => null),
      ]);

      const availableList = (availableRes.data || []);
      const myList = (mineRes.data || []);
      if (profileRes?.data) profileLoadedRef.current = true;

      setAvailable(availableList);
      setMine(myList);
      if (profileRes?.data) setProfile(profileRes.data);

      // Auto-switch to active tab if there is an active run
      const activeRuns = myList.filter(
        (d) => !FINISHED_STATUSES.includes(d.status)
      );
      if (activeRuns.length > 0 && activeTab === 'available' && availableList.length === 0) {
        setActiveTab('active');
      }
      setLoadError(null);
    } catch (error) {
      const code = apiErrorCode(error);
      if (code && (code === 'RIDER_NOT_APPROVED' || code === 'RIDER_REJECTED' || code === 'RIDER_SUSPENDED')) {
        setBlockedReason({
          title: code === 'RIDER_NOT_APPROVED' ? 'blockedUnderReview' : 'blockedInactive',
          message: apiErrorMessage(error, '') || null,
          code,
        });
      } else {
        setLoadError(error);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeTab]);

  // The open pool alone: a job was posted or taken, so nothing but the list of available jobs can have changed.
  const loadAvailable = useCallback(async () => {
    try {
      const res = await riderService.getAvailableDeliveries();
      setAvailable((res.data || []));
    } catch {
      // The next full reload reports what is wrong (an account that cannot take jobs, a lost connection).
    }
  }, []);

  const isRider = user?.user_type === 'rider' || user?.userType === 'rider';
  const userId = user?.id;

  // The sidebar links to #active / #available / #history.
  useEffect(() => {
    const fromHash = () => {
      const tab = window.location.hash.replace('#', '') as (typeof TABS)[number];
      if (TABS.includes(tab)) setActiveTab(tab);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  // Initial load. app/riders/layout.tsx sends signed-out people to sign in and other accounts to their own home.
  useEffect(() => {
    if (!userId || !isRider) return;
    loadAll();
    // loadAll changes with the active tab; reloading on every tab switch isn't wanted. Keyed on who is signed in, not on
    // the user object: a refreshed copy of the same account must not read everything twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isRider]);

  // Jobs given to this rider or cancelled, and status changes on this rider's orders (e.g. the kitchen
  // marking food ready), arrive as live events and reload everything.
  useLiveRefresh(() => loadAll(true), {
    events: ['delivery:cancelled', 'delivery:assigned', 'order:status:update'],
    enabled: isAuthenticated && isRider && !blockedReason,
    intervalMs: 30_000,
  });

  // Jobs posted to the pool or taken from it (sent only to riders on duty) change nothing but the pool list.
  useLiveRefresh(loadAvailable, {
    events: ['delivery:new', 'delivery:removed'],
    enabled: isAuthenticated && isRider && !blockedReason,
    eventsOnly: true,
  });

  const activeDeliveries = mine.filter(
    (d) => !FINISHED_STATUSES.includes(d.status)
  );
  // With two jobs on the go one card shows at a time; the food already on the bike comes first.
  const [focusId, setFocusId] = useState<string | null>(null);
  const jobsByStep = [...activeDeliveries].sort((a, b) => (STEP_ORDER[b.status] ?? 0) - (STEP_ORDER[a.status] ?? 0));
  const focused = jobsByStep.find((d) => d.id === focusId) ?? jobsByStep[0] ?? null;
  // Focus moved by keyboard must not land under the next-step bar fixed at the bottom of a phone screen.
  const actionBarShown = activeTab === 'active' && focused !== null;
  useEffect(() => {
    if (!actionBarShown) return;
    const root = document.documentElement;
    root.style.scrollPaddingBottom = 'calc(8rem + var(--safe-bottom))';
    return () => {
      root.style.scrollPaddingBottom = '';
    };
  }, [actionBarShown]);
  // Done: delivered jobs and the ones reported as not delivered.
  const completedDeliveries = mine.filter((d) => d.status === 'delivered' || d.status === 'delivery_failed');
  const deliveredToday = mine.filter((d) => d.status === 'delivered' && isToday(d.deliveryTime));
  const earnedToday = deliveredToday.reduce((sum, d) => sum + (d.riderFee ?? 0) + (d.riderBonus ?? 0), 0);
  // Reported in the last day: the rider still has the food and needs to know what to do with it.
  const recentlyFailed = mine.filter((d) => d.status === 'delivery_failed' && Date.now() - new Date(d.createdAt).getTime() < FAILED_NOTICE_MS);
  // Every delivery the rider has made, from their profile: the list below only holds the latest ones.
  const deliveredTotal = profile?.totalDeliveries ?? mine.filter((d) => d.status === 'delivered').length;

  const showOlderDeliveries = () => {
    historyRef.current = 200;
    setOlderShown(true);
    void loadAll(true);
  };

  // In the store app the rider is asked once whether the position may go on being shared with the app closed.
  const [inApp, setInApp] = useState(false);
  const [bgChoice, setBgChoice] = useState<BackgroundLocationChoice>(null);
  useEffect(() => {
    setInApp(!!nativePlugins(window as unknown as NativeWindow)?.BackgroundGeolocation);
    setBgChoice(backgroundLocationChoice(typeof localStorage === 'undefined' ? null : localStorage));
  }, []);
  const chooseBackground = (allow: boolean | null) => {
    const choice: BackgroundLocationChoice = allow === null ? null : allow ? 'yes' : 'no';
    setBgChoice(choice);
    try {
      if (choice) localStorage.setItem(BACKGROUND_LOCATION_CHOICE, choice);
      else localStorage.removeItem(BACKGROUND_LOCATION_CHOICE);
    } catch {
      // Private storage: asked again next time.
    }
  };

  // The phone's position goes to each job in progress (and nowhere when there is none).
  const locationSharing = useRiderLocation(
    activeDeliveries.map((d) => d.id),
    () => loadAll(true),
    { background: inApp && bgChoice === 'yes', notice: { title: t('bgloc.noticeTitle'), message: t('bgloc.noticeMessage') } }
  );

  // Toggle on-duty / off-duty
  const handleToggleDuty = async () => {
    try {
      setTogglingDuty(true);
      const res = await riderService.toggleDutyStatus(!profile?.isAvailable);
      if (profile) {
        setProfile({ ...profile, isAvailable: res.data.isAvailable });
      }
      showToast(
        res.data.isAvailable ? t('nowOnDuty') : t('nowOffDuty'),
        'success'
      );
      // Pool events reach only riders on duty, so the list may have moved on while they were off.
      if (res.data.isAvailable) void loadAvailable();
    } catch (error) {
      showToast(apiErrorMessage(error, t('toggleDutyFailed')), 'error');
    } finally {
      setTogglingDuty(false);
    }
  };

  // Take a job from New jobs at its standard fee.
  const handleClaim = async (deliveryId: string) => {
    // Accepting a job starts the trip to the kitchen: open Google Maps (window opened inside the tap, see handleAdvanceStatus),
    // but only when the kitchen can be found on a map; otherwise the job card says to call the kitchen.
    const job = available.find((a) => a.id === deliveryId);
    const toKitchen = job ? { ...job, status: 'assigned' as const } : null;
    const nav = toKitchen && canNavigateTo(navDestinationFor(toKitchen)) ? reserveExternal() : null;
    try {
      setBusyId(deliveryId);
      await riderService.claimDelivery(deliveryId);
      if (nav && toKitchen) nav.open(navUrlFor(toKitchen));
      showToast(t('claimed'), 'success');
      setFocusId(deliveryId);
      setActiveTab('active');
      loadAll(true);
    } catch (error) {
      nav?.cancel();
      showToast(apiErrorMessage(error, t('claimFailed')), 'error');
    } finally {
      setBusyId(null);
    }
  };

  // Hand a job back to the pool before the food is picked up
  const handleRelease = async (delivery: Delivery) => {
    if (!(await confirmDialog({ title: t('handBackTitle'), message: t('handBackConfirm'), confirmText: t('handBack'), variant: 'danger', icon: 'warning' }))) return;
    try {
      setBusyId(delivery.id);
      await riderService.releaseDelivery(delivery.id);
      showToast(t('handedBack'), 'info');
      await loadAll(true);
      // The card the rider tapped from is gone; on a phone the page would stay scrolled to where it was.
      window.scrollTo(0, 0);
    } catch (error) {
      showToast(apiErrorMessage(error, t('claimFailed')), 'error');
    } finally {
      setBusyId(null);
    }
  };

  // The leg the rider is on: to the kitchen until the food is picked up, then to the customer.
  const headingToCustomer = (d: Delivery) => ['picked_up', 'in_transit', 'arrived_at_customer'].includes(d.status);
  // Where this leg goes: the saved map pin when there is one, otherwise the address text. A kitchen without a street
  // address has no text worth searching for (its name finds nothing on a map), so it has no destination.
  const navDestinationFor = (d: Delivery): NavDestination =>
    headingToCustomer(d)
      ? { latitude: d.deliveryLatitude ?? null, longitude: d.deliveryLongitude ?? null, text: d.deliveryAddress }
      : { latitude: d.pickupLatitude ?? null, longitude: d.pickupLongitude ?? null, text: d.pickup?.address ? d.pickupAddress : '' };
  const navUrlFor = (d: Delivery) =>
    (headingToCustomer(d) ? d.dropoffMapsUrl : d.pickupMapsUrl) ?? googleMapsDirectionsUrl(navDestinationFor(d));
  // Navigation is offered while the rider is travelling: to the kitchen, or with the food to the customer.
  const NAVIGABLE_STATUSES = ['assigned', 'picked_up', 'in_transit'];
  const canStartNavigation = (d: Delivery) => NAVIGABLE_STATUSES.includes(d.status) && canNavigateTo(navDestinationFor(d));
  const [navBusyId, setNavBusyId] = useState<string | null>(null);
  const platform = mobilePlatform();

  /**
   * Start navigation. The window is opened inside the tap (browsers block pop-ups opened after a
   * network call), then the job is re-read from the server: a job that was cancelled, reassigned or
   * finished since the screen last refreshed must not send the rider anywhere. Opening the maps app
   * changes nothing about the job: arriving and handing over are still the rider's own taps.
   */
  const handleStartNavigation = async (delivery: Delivery, event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (navBusyId) return; // a second tap while the first is still checking
    setNavBusyId(delivery.id);
    const nav = reserveExternal();
    try {
      const fresh = ((await riderService.getMyDeliveries({ history: 0 })).data)?.find((d) => d.id === delivery.id);
      if (!fresh || !NAVIGABLE_STATUSES.includes(fresh.status)) {
        nav.cancel();
        showToast(t('navNotAvailable'), 'error');
        loadAll(true);
        return;
      }
      if (!canNavigateTo(navDestinationFor(fresh))) {
        nav.cancel();
        showToast(t('navNoDestination'), 'error');
        return;
      }
      nav.open(navUrlFor(fresh)); // a blocked pop-up leaves for the maps app itself: the rider comes back with the back button
    } catch {
      // Offline or the server did not answer: the last known destination is still better than none.
      nav.open(navUrlFor(delivery));
    } finally {
      setNavBusyId(null);
    }
  };

  // Advance delivery along the real fulfillment lifecycle
  const openPinSheet = (delivery: Delivery) => {
    setPinModalDelivery(delivery);
    setPinLocked(false);
    setPinError(null);
    setPinDigits(['', '', '', '']);
    setTimeout(() => pinInputRefs[0].current?.focus(), 150);
  };

  const handleAdvanceStatus = async (delivery: Delivery) => {
    // Leaving the kitchen with the food: open directions to the customer. The window is opened now,
    // inside the tap, because browsers block pop-ups opened after a network call.
    const toCustomer = { ...delivery, status: 'in_transit' as const };
    const leaving = delivery.status === 'arrived_at_pickup' || delivery.status === 'picked_up';
    let nav = leaving && canNavigateTo(navDestinationFor(toCustomer)) ? reserveExternal() : null;
    setFocusId(delivery.id);
    try {
      setBusyId(delivery.id);
      if (delivery.status === 'assigned') {
        await riderService.updateDeliveryStatus(delivery.id, 'arrived_at_pickup');
        showToast(t('toastArrivedKitchen'), 'info');
      } else if (leaving) {
        // Picked up, then on the way: two steps for the server (each with its own checks), one tap for the rider.
        if (delivery.status === 'arrived_at_pickup') await riderService.updateDeliveryStatus(delivery.id, 'picked_up');
        await riderService.updateDeliveryStatus(delivery.id, 'in_transit');
        showToast(t('toastDeparted'), 'info');
        nav?.open(navUrlFor(toCustomer));
        nav = null;
      } else if (delivery.status === 'in_transit') {
        await riderService.updateDeliveryStatus(delivery.id, 'arrived_at_customer');
        showToast(t('toastArrivedDoor'), 'info');
        openPinSheet(delivery);
      } else if (delivery.status === 'arrived_at_customer') {
        openPinSheet(delivery);
      }
      loadAll(true);
    } catch (error) {
      nav?.cancel();
      // A pickup that went through before the second step failed: the card must show where the job is now.
      if (leaving) loadAll(true);
      showToast(apiErrorMessage(error, t('statusUpdateFailed')), 'error');
    } finally {
      setBusyId(null);
    }
  };

  // PIN modal digit input
  const handlePinDigitChange = (index: number, val: string) => {
    const digits = val.replace(/\D/g, '');
    if (val && !digits) return;
    setPinError(null);
    const updated = [...pinDigits];
    if (digits.length > 1) {
      // A pasted or autofilled code fills the boxes from here on.
      digits.slice(0, 4 - index).split('').forEach((d, i) => (updated[index + i] = d));
    } else {
      updated[index] = digits;
    }
    setPinDigits(updated);

    const next = updated.findIndex((d) => !d);
    if (next === -1) {
      // The fourth digit sends the code: on a phone the keyboard covers the confirm button.
      pinInputRefs[Math.min(3, index + digits.length - 1)].current?.blur();
      void handleVerifyPinSubmit(updated);
    } else if (digits && next > index) {
      pinInputRefs[next].current?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  // Submit Handshake PIN
  const handleVerifyPinSubmit = async (digits: string[] = pinDigits) => {
    if (verifyingPin) return;
    const fullPin = digits.join('');
    if (fullPin.length !== 4) {
      showToast(t('pinIncomplete'), 'error');
      return;
    }
    if (!pinModalDelivery) return;

    try {
      setVerifyingPin(true);
      await riderService.updateDeliveryStatus(
        pinModalDelivery.id,
        'delivered',
        undefined,
        fullPin
      );
      showToast(t('handoverDone'), 'success');
      setPinModalDelivery(null);
      // Another job still on the go stays in front; with none left, the finished job is shown on Done.
      if (activeDeliveries.length <= 1) setActiveTab('history');
      setFocusId(null);
      loadAll(true);
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === 'HANDOVER_LOCKED') {
        setPinLocked(true);
      } else if (apiErrorStatus(error) === undefined) {
        // No answer from the server: the code was not checked, so it stays in the boxes for another try.
        setPinError(t('pinNoConnection'));
      } else {
        // Clear the boxes and start again from the first, with the reason under them where the rider is looking.
        setPinDigits(['', '', '', '']);
        setPinError(code === 'INVALID_DELIVERY_OTP' ? t('pinTryAgain') : apiErrorMessage(error, t('pinInvalid')));
        setTimeout(() => pinInputRefs[0].current?.focus(), 50);
      }
    } finally {
      setVerifyingPin(false);
    }
  };

  // Submit Failure Report
  const handleReportFailureSubmit = async () => {
    if (!reportModalDelivery || !reportReason) return;
    const combinedReason = `${reportReason}: ${reportNotes}`.trim();
    try {
      setReporting(true);
      await riderService.updateDeliveryStatus(
        reportModalDelivery.id,
        'delivery_failed',
        combinedReason
      );
      showToast(t('issueReported'), 'warning');
      setReportModalDelivery(null);
      setReportReason(null);
      setReportNotes('');
      loadAll(true);
    } catch (error) {
      showToast(apiErrorMessage(error, t('issueReportFailed')), 'error');
    } finally {
      setReporting(false);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'rider' && user?.userType !== 'rider')) {
    return null;
  }

  const cashInHand = profile?.cashInHand ?? 0;
  const floatingLimit = profile?.floatingLimit ?? 10000;
  // Cash orders past the rider's limit are listed but are not jobs they can take.
  const takeable = available.filter((d) => !d.exceedsCashLimit);
  const cashBlocked = available.length > 0 && takeable.length === 0;
  const cashLimited = available.filter((d) => d.exceedsCashLimit);
  const cashPercent = floatingLimit > 0 ? Math.min(100, Math.round((cashInHand / floatingLimit) * 100)) : cashInHand > 0 ? 100 : 0;

  // The profile API returns null for details the rider hasn't provided and a 0 rating
  // until they are rated: show "Not set" / "New" rather than made-up values.
  const riderRating = displayRating(profile?.ratingAverage);
  const vehicleKey = profile?.vehicleType ? riderKeyFor('vehicle', profile.vehicleType) : null;
  const vehicleLabel =
    [vehicleKey ? t(vehicleKey) : profile?.vehicleType, profile?.vehicleNumber ? `(${profile.vehicleNumber})` : null]
      .filter(Boolean)
      .join(' ') || t('notSet');

  // Nothing about the rider could be read: the bar would say "Vehicle: Not set", "0 / 2 Active" and "ON DUTY" about someone it knows nothing about.
  const couldNotRead = Boolean(loadError) && !loading && !blockedReason && !profile && mine.length === 0 && available.length === 0;

  // The card's headline is what to do next, not the job's status name.
  const nextStepLabel = (d: Delivery) => {
    const k = riderKeyFor('next', d.status);
    return k ? t(k, { customer: d.customer?.name || t('next.theCustomer') }) : d.status.replace(/_/g, ' ');
  };
  const sharingLabel: RiderMessageKey =
    inApp && locationSharing === 'denied' ? 'loc.deniedApp' : inApp && locationSharing === 'unavailable' ? 'loc.unavailableApp' : SHARING_BADGE[locationSharing].labelKey;
  const openLocationSettings = () => {
    void nativePlugins(window as unknown as NativeWindow)?.BackgroundGeolocation?.openSettings().catch(() => undefined);
  };
  const onDuty = profile?.isAvailable === true;
  // An applicant (or a paused account) is not a working rider yet: no duty switch, location or job counts.
  const showRiderStrip = !couldNotRead && !blockedReason && !(loading && !profile);
  const applying = blockedReason?.code === 'RIDER_NOT_APPROVED' || blockedReason?.code === 'RIDER_REJECTED';
  const riderName = profile?.name || user?.profile?.fullName || t('nameNotSet');
  const tabCounts: Record<(typeof TABS)[number], number> = {
    active: activeDeliveries.length,
    available: takeable.length,
    history: completedDeliveries.length,
  };
  const tabLabels: Record<(typeof TABS)[number], RiderMessageKey> = { active: 'tabActive', available: 'tabAvailable', history: 'tabHistory' };

  const jobCard = (d: Delivery) => {
    const ready = foodReady(d);
    return (
      <li
        key={d.id}
        data-testid={`job-${d.orderNumber ?? d.id}`}
        className={`rounded-2xl bg-surface border p-4 flex flex-col gap-4 ${d.isRouteMatch ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">{t('orderNo', { number: d.orderNumber || d.orderId.slice(0, 8) })}</p>
            <p className="text-lg font-semibold text-ink tabular-nums">
              {formatPrice(d.standardFee)}
              {d.isRouteMatch && <span className="text-sm font-medium text-brand-ink ms-1.5">{t('bonusSuffix', { bonus: d.batchBonus })}</span>}
            </p>
          </div>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${ready ? 'bg-brand-soft text-brand-soft-ink' : 'bg-raised text-muted'}`}>
            {ready ? tc('status.ready') : t('stillPreparing')}
          </span>
        </div>

        {d.isRouteMatch && <p className="-mt-2 text-sm font-medium text-brand-ink">{t('routeMatch', { bonus: d.batchBonus })}</p>}
      {d.handedBackByYou && <p className="-mt-2 text-sm text-muted" data-testid="handed-back-by-you">{t('youHandedBack')}</p>}

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted">{t('pickupLabel')}</dt>
          <dd className="text-ink leading-snug">
            {d.pickupAddress}
            {d.pickupDistanceKm != null && <span className="text-muted">, {t('kmAway', { km: d.pickupDistanceKm })}</span>}
          </dd>
          <dt className="text-muted">{t('deliverLabel')}</dt>
          <dd className="text-ink leading-snug">{d.deliveryAddress}</dd>
          {d.distanceKm != null && (
            <>
              <dt className="text-muted">{t('tripLabel')}</dt>
              <dd className="text-ink tabular-nums">{t('tripKm', { km: d.distanceKm })}</dd>
            </>
          )}
          {d.totalAmount ? (
            <>
              <dt className="text-muted">{t('orderValue')}</dt>
              <dd className="text-ink tabular-nums">
                {formatPrice(d.totalAmount)}{' '}
                <span className="text-muted">({d.paymentMethod === 'cod' || !d.paymentMethod ? t('collect') : t('prepaid')})</span>
              </dd>
            </>
          ) : null}
        </dl>

        {activeDeliveries.length < 2 && (
          <div className="mt-auto">
            {d.exceedsCashLimit ? (
              <p className="rounded-xl bg-accent-soft text-accent-soft-ink p-3 text-sm" data-testid="cash-limit-blocked">
                <strong>{t('cashLimitTitle')}</strong> {t('cashLimitBody', { limit: formatPrice(floatingLimit) })}
              </p>
            ) : (
              <Button onClick={() => handleClaim(d.id)} disabled={busyId === d.id} className="w-full min-h-11">
                {busyId === d.id
                  ? t('claiming')
                  : d.isRouteMatch
                  ? t('claimBatched', { bonus: d.batchBonus })
                  : t('claim', { fee: formatPrice(d.standardFee) })}
              </Button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <DashboardLayout
      title={applying ? t('app.pageTitle') : t('title')}
      sidebarItems={RIDER_SIDEBAR_ITEMS}
      userType="rider"
    >
      <div className="max-w-6xl mx-auto">

        {/* Who is riding, whether they take new jobs, and whether their position is reaching the customer */}
        {showRiderStrip && (
          <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-3 mb-4 sm:pb-5 sm:mb-6 border-b border-line">
            {/* Who is riding: on a phone the job comes first, so this is in the menu and on Earnings instead. */}
            <div className="hidden sm:flex items-center gap-3 min-w-0">
              <span aria-hidden="true" className="w-11 h-11 rounded-full bg-brand-soft text-brand-soft-ink flex items-center justify-center text-base font-semibold shrink-0">
                {riderName.trim().charAt(0).toUpperCase() || <Bike className="w-5 h-5" />}
              </span>
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-ink leading-tight truncate">{riderName}</p>
                <p className="text-sm text-muted mt-0.5">
                  {vehicleLabel}, {profile?.city || t('notSet')}
                  <span className="mx-2 text-line-strong" aria-hidden="true">|</span>
                  {riderRating ? t('fleetScore', { rating: riderRating }) : t('newRider')}
                </p>
              </div>
            </div>

            <div className="flex flex-1 sm:flex-none flex-wrap items-center justify-between gap-x-5 gap-y-2 min-w-0">
              <div className="flex flex-1 sm:flex-none items-center gap-2 text-sm min-w-0" data-testid="location-sharing">
                <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${SHARING_BADGE[locationSharing].dot}`} />
                <span className={`font-medium leading-snug ${SHARING_BADGE[locationSharing].tone}`}>{t(sharingLabel)}</span>
                {inApp && locationSharing === 'denied' && (
                  <button type="button" onClick={openLocationSettings} className="font-semibold text-brand-ink underline underline-offset-2">
                    {t('openSettings')}
                  </button>
                )}
                {inApp && bgChoice === 'no' && (
                  <button type="button" onClick={() => chooseBackground(null)} className="font-semibold text-brand-ink underline underline-offset-2" data-testid="background-location-ask">
                    {t('bgloc.change')}
                  </button>
                )}
              </div>
              {inApp && bgChoice === null && activeDeliveries.length > 0 && <BackgroundLocationNotice onChoice={chooseBackground} />}

              <button
                type="button"
                role="switch"
                aria-checked={onDuty}
                onClick={handleToggleDuty}
                disabled={togglingDuty}
                className="flex items-center gap-3 min-h-11 ps-1 pe-1 rounded-full shrink-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
              >
                <span className={`text-sm font-semibold ${onDuty ? 'text-ink' : 'text-muted'}`}>{onDuty ? t('onDuty') : t('offDuty')}</span>
                <span aria-hidden="true" className={`relative w-12 h-7 rounded-full transition-colors ${onDuty ? 'bg-brand-600' : 'bg-line-strong'}`}>
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] ${onDuty ? 'start-6' : 'start-1'}`} />
                </span>
              </button>
            </div>
          </section>
        )}

        {Boolean(loadError) && !blockedReason && (profile || mine.length > 0 || available.length > 0) && (
          <LoadError compact error={loadError} onRetry={() => void loadAll()} title={t('loadFailed')} className="mb-4" />
        )}
        {loading && !profile && mine.length === 0 ? (
          <div className="py-24 text-center" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
            <p className="text-sm text-muted">{t('connecting')}</p>
          </div>
        ) : blockedReason && (blockedReason.code === 'RIDER_NOT_APPROVED' || blockedReason.code === 'RIDER_REJECTED') ? (
          <RiderApplicationForm />
        ) : blockedReason ? (
          <div className="max-w-md mx-auto py-16 text-center">
            <h2 className="text-xl font-semibold text-ink mb-2">{t(blockedReason.title)}</h2>
            <p className="text-muted">{blockedReason.message ?? t('blockedContactSupport')}</p>
          </div>
        ) : loadError && !profile && mine.length === 0 && available.length === 0 ? (
          <LoadError error={loadError} onRetry={() => void loadAll()} title={t('loadFailed')} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-x-10 gap-y-8">

            <div className="min-w-0">
              <div role="tablist" aria-label={t('title')} className="flex gap-6 border-b border-line mb-5 overflow-x-auto [scrollbar-width:none]">
                {TABS.map((tab) => {
                  const selected = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveTab(tab)}
                      className={`relative -mb-px flex items-center gap-2 min-h-11 pb-1 text-[15px] whitespace-nowrap border-b-2 transition-colors ${
                        selected ? 'border-brand-600 text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
                      }`}
                    >
                      {t(tabLabels[tab])}
                      {tabCounts[tab] > 0 && (
                        <span className={`min-w-6 px-1.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                          tab === 'active' ? 'bg-brand-600 text-white' : 'bg-raised text-muted'
                        }`}>
                          {tabCounts[tab]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* The job the rider is on: where to go next and the one thing to do there */}
              {activeTab === 'active' && (
                !focused ? (
                  <div className="py-2" data-testid="no-active-job">
                    {!onDuty && profile ? (
                      <>
                        <p className="text-sm text-muted">{t('offDutyBody')}</p>
                        <Button onClick={handleToggleDuty} disabled={togglingDuty} className="mt-4 min-h-11">
                          {t('goOnDuty')}
                        </Button>
                      </>
                    ) : takeable.length > 0 ? (
                      <>
                        <p className="text-sm text-muted">{t('noActiveBody')}</p>
                        <Button onClick={() => setActiveTab('available')} className="mt-4 min-h-11">
                          {t('viewAvailable', { count: takeable.length })}
                        </Button>
                      </>
                    ) : cashBlocked ? (
                      <div data-testid="no-active-cash-limit">
                        <p className="text-[15px] font-semibold text-ink">{t('cashBlockedTitle')}</p>
                        <p className="mt-1 text-sm text-muted leading-relaxed">
                          {t('cashBlockedBody', { held: formatPrice(cashInHand), limit: formatPrice(floatingLimit) })}
                        </p>
                        <Link href="/riders/earnings" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">
                          {t('earningsLink')}
                        </Link>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">{t('scanningBody')}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {jobsByStep.length > 1 && (
                      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('yourJobs')}>
                        {jobsByStep.map((d) => {
                          const selected = d.id === focused.id;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setFocusId(d.id)}
                              data-testid={`job-switch-${d.orderNumber ?? d.id}`}
                              className={`min-h-14 rounded-xl border px-3 py-2 text-start transition-colors ${
                                selected ? 'border-brand-600 bg-brand-soft text-brand-soft-ink' : 'border-line bg-surface text-ink hover:bg-raised'
                              }`}
                            >
                              <span className="block text-xs text-muted tabular-nums">{t('orderShort', { last: lastDigits(d) })}</span>
                              <span className="block text-sm font-semibold line-clamp-2">{nextStepLabel(d)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {(() => {
                      const delivery = focused;
                      const step = STEP_ORDER[delivery.status] ?? 0;
                      const toCustomer = headingToCustomer(delivery);
                      const busy = busyId === delivery.id;
                      const ready = foodReady(delivery);
                      // At the kitchen with the food still cooking: nothing to pick up yet.
                      const waitingForFood = delivery.status === 'arrived_at_pickup' && !ready;
                      const beforePickup = delivery.status === 'assigned' || delivery.status === 'arrived_at_pickup';
                      const kitchen = delivery.pickup;
                      const kitchenName = kitchen?.name || t('pickupKitchen');
                      const kitchenLine =
                        kitchen?.address && kitchen.area && kitchen.address.toLowerCase().includes(kitchen.area.toLowerCase())
                          ? kitchen.address
                          : [kitchen?.address, kitchen?.area].filter(Boolean).join(', ');
                      const customerName = delivery.customer?.name || t('dropoffCustomer');
                      const alt = NAVIGABLE_STATUSES.includes(delivery.status) ? alternativeMapsLink(navDestinationFor(delivery), platform) : null;
                      const phone = toCustomer ? delivery.customer?.phone : kitchen?.phone;
                      return (
                        <article
                          key={delivery.id}
                          data-testid={`run-${delivery.orderNumber ?? delivery.id}`}
                          className="rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)]"
                        >
                          <header className="px-5 pt-5 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm text-muted tabular-nums">{t('orderNo', { number: delivery.orderNumber || delivery.orderId.slice(0, 8) })}</p>
                              <h2 className="text-lg font-semibold text-ink leading-snug">{nextStepLabel(delivery)}</h2>
                            </div>
                            {delivery.riderFee != null && (
                              <div className="text-end shrink-0">
                                <p className="text-sm text-muted">{t('youEarn')}</p>
                                <p className="text-lg font-semibold text-ink tabular-nums">{formatPrice(delivery.riderFee + (delivery.riderBonus ?? 0))}</p>
                              </div>
                            )}
                          </header>

                          <div className="px-5 mt-3">
                            <div className="flex gap-1" aria-hidden="true">
                              {Array.from({ length: STEP_COUNT }, (_, idx) => (
                                <span key={idx} className={`h-1.5 flex-1 rounded-full ${idx < step ? 'bg-brand-600' : idx === step ? 'bg-brand-300' : 'bg-raised'}`} />
                              ))}
                            </div>
                            <p className="text-xs text-muted mt-1.5">
                              {t('stepOf', { step: Math.min(step + 1, STEP_COUNT), total: STEP_COUNT })}
                              {delivery.assignmentMode === 'auto' && step === 0 && `, ${t('autoAssigned').toLowerCase()}`}
                            </p>
                          </div>

                          {delivery.paymentMethod === 'cod' && !!delivery.totalAmount && (
                            <p className="mx-5 mt-4 flex items-center gap-2 rounded-xl bg-accent-soft text-accent-soft-ink px-3.5 py-2.5 text-sm">
                              <Banknote className="w-4 h-4 shrink-0" aria-hidden="true" />
                              <span>{t('collect')}</span>
                              <strong className="ms-auto text-base tabular-nums">{formatPrice(delivery.totalAmount)}</strong>
                            </p>
                          )}

                          {/* The stop the rider is heading to now, in full; the other one in a line. */}
                          <section className="px-5 mt-5" data-testid={toCustomer ? 'leg-customer' : 'leg-kitchen'}>
                            {toCustomer && (
                              <p className="flex items-center gap-2 text-sm text-muted mb-4">
                                <Check className="w-4 h-4 text-brand-ink shrink-0" strokeWidth={3} aria-hidden="true" />
                                <span className="line-clamp-2">{t('pickedUpFrom', { kitchen: kitchenName })}</span>
                              </p>
                            )}
                            <p className="text-sm text-muted">{toCustomer ? t('legDropoff') : t('legPickup')}</p>
                            <p className="text-[17px] font-semibold text-ink leading-snug"><bdi>{toCustomer ? customerName : kitchenName}</bdi></p>
                            {toCustomer ? (
                              <>
                                <p className="text-[15px] text-ink leading-snug mt-0.5"><bdi>{delivery.deliveryAddress}</bdi></p>
                                {delivery.dropoffDetails && (delivery.dropoffDetails.houseNumber || delivery.dropoffDetails.addressLine2 || delivery.dropoffDetails.landmark) && (
                                  <dl className="mt-1.5 text-sm text-muted space-y-0.5">
                                    {delivery.dropoffDetails.houseNumber && <div><dt className="inline">{t('houseNo')}: </dt><dd className="inline text-ink">{delivery.dropoffDetails.houseNumber}</dd></div>}
                                    {delivery.dropoffDetails.addressLine2 && <dd>{delivery.dropoffDetails.addressLine2}</dd>}
                                    {delivery.dropoffDetails.landmark && <div><dt className="inline">{t('landmark')}: </dt><dd className="inline text-ink">{delivery.dropoffDetails.landmark}</dd></div>}
                                  </dl>
                                )}
                                {delivery.dropoffDetails?.instructions && (
                                  <p className="mt-2 rounded-lg bg-raised px-3 py-2 text-sm text-ink">
                                    <span className="text-muted">{t('customerNote')}: </span>{delivery.dropoffDetails.instructions}
                                  </p>
                                )}
                                {delivery.deliveryLatitude == null && (
                                  <p className="mt-2 text-sm text-accent-soft-ink" data-testid="no-map-pin">{t('noMapPin')}</p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-[15px] text-ink leading-snug mt-0.5"><bdi>{kitchen ? kitchenLine || kitchen.name : delivery.pickupAddress}</bdi></p>
                                {kitchen?.landmark && (
                                  <p className="mt-1 text-sm text-muted">{t('landmark')}: <span className="text-ink">{kitchen.landmark}</span></p>
                                )}
                                {kitchen && !kitchen.address && delivery.pickupLatitude == null ? (
                                  <p className="mt-2 text-sm text-accent-soft-ink" data-testid="no-kitchen-address">{t('noKitchenAddress')}</p>
                                ) : delivery.pickupLatitude == null ? (
                                  <p className="mt-2 text-sm text-accent-soft-ink" data-testid="no-kitchen-pin">{t('noKitchenPin')}</p>
                                ) : null}
                                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                  <span
                                    data-testid="food-status"
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${ready ? 'bg-brand-soft text-brand-soft-ink' : 'bg-accent-soft text-accent-soft-ink'}`}
                                  >
                                    {ready ? t('foodReady') : delivery.estimatedReadyAt && new Date(delivery.estimatedReadyAt).getTime() > Date.now() ? t('foodCookingUntil', { time: formatTime(delivery.estimatedReadyAt) }) : t('foodCooking')}
                                  </span>
                                  <span className="text-muted">{waitingForFood ? t('waitingForKitchenHelp') : ready ? t('prepVerify') : t('cookingHelp')}</span>
                                </p>
                              </>
                            )}

                            {(NAVIGABLE_STATUSES.includes(delivery.status) || phone) && (
                              <div className="mt-4 flex gap-2">
                                {NAVIGABLE_STATUSES.includes(delivery.status) && (
                                  <ExternalLink
                                    href={navUrlFor(delivery)}
                                    data-testid="start-navigation"
                                    aria-disabled={!canStartNavigation(delivery) || navBusyId === delivery.id}
                                    onClick={(e) => (canStartNavigation(delivery) ? handleStartNavigation(delivery, e) : e.preventDefault())}
                                    className={`flex-1 min-w-0 flex items-center justify-center gap-2 min-h-12 px-3 rounded-xl border text-[15px] font-semibold ${
                                      canStartNavigation(delivery) && navBusyId !== delivery.id
                                        ? 'border-brand-600 text-brand-ink hover:bg-brand-soft'
                                        : 'border-line text-muted cursor-not-allowed'
                                    }`}
                                  >
                                    <Navigation className="w-4 h-4 shrink-0" aria-hidden="true" />
                                    <span className="truncate">{navBusyId === delivery.id ? t('processing') : t('maps')}</span>
                                  </ExternalLink>
                                )}
                                {phone && (
                                  <a
                                    href={`tel:${phone}`}
                                    data-testid={toCustomer ? 'call-customer' : 'call-kitchen'}
                                    aria-label={`${toCustomer ? t('callCustomer') : t('callKitchen')} ${phone}`}
                                    className="flex-1 min-w-0 flex items-center justify-center gap-2.5 min-h-12 py-1.5 px-3 rounded-xl whitespace-nowrap bg-brand-soft text-brand-soft-ink text-[15px] font-semibold"
                                  >
                                    <Phone className="w-4 h-4 shrink-0" aria-hidden="true" />
                                    <span className="flex flex-col items-start leading-tight">
                                      <span>{t('call')}</span>
                                      <bdi dir="ltr" className="text-sm font-medium tabular-nums">{phone}</bdi>
                                    </span>
                                  </a>
                                )}
                              </div>
                            )}
                            {alt && (
                              <ExternalLink href={alt.url} data-testid="alt-navigation" className="inline-flex items-center min-h-11 text-sm text-brand-ink underline underline-offset-2">
                                {alt.kind === 'apple' ? t('openInAppleMaps') : t('openInOtherMaps')}
                              </ExternalLink>
                            )}
                            {toCustomer && <p className="text-sm text-muted mt-3">{t('doorstepPin')}</p>}

                            {!toCustomer && (
                              <div className="mt-5 pt-4 border-t border-line min-w-0">
                                <p className="text-sm text-muted">{t('thenDeliverTo')}</p>
                                {delivery.customer?.name && (
                                  <p className="text-[15px] font-medium text-ink line-clamp-2"><bdi>{delivery.customer.name}</bdi></p>
                                )}
                                <p className="text-[15px] text-ink line-clamp-2" data-testid="then-deliver-address"><bdi>{delivery.deliveryAddress}</bdi></p>
                              </div>
                            )}
                          </section>

                          {/* The one next step: at the bottom of the screen on a phone, under the thumb. */}
                          <div className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-30 max-sm:border-t max-sm:border-line max-sm:bg-surface max-sm:px-4 max-sm:pt-2 max-sm:pb-[calc(0.75rem+var(--safe-bottom))] sm:px-5 sm:pt-6">
                            {jobsByStep.length > 1 && (
                              <p className="sm:hidden mb-1.5 flex gap-1.5 text-sm text-muted min-w-0" data-testid="action-bar-job">
                                <span className="tabular-nums shrink-0">{t('orderShort', { last: lastDigits(delivery) })}</span>
                                {delivery.customer?.name && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <bdi className="truncate">{delivery.customer.name.trim().split(/\s+/)[0]}</bdi>
                                  </>
                                )}
                              </p>
                            )}
                            <Button
                              size="lg"
                              onClick={() => handleAdvanceStatus(delivery)}
                              disabled={busy || waitingForFood}
                              data-testid="advance-job"
                              className="w-full min-h-13 text-base"
                            >
                              {busy
                                ? t('processing')
                                : delivery.status === 'assigned'
                                ? t('actArrivedKitchen')
                                : waitingForFood
                                ? t('waitingForKitchen')
                                : delivery.status === 'arrived_at_pickup'
                                ? t('actPickUp')
                                : delivery.status === 'picked_up'
                                ? t('actDepart')
                                : delivery.status === 'in_transit'
                                ? t('actArrivedDoor')
                                : t('actVerifyPin')}
                            </Button>
                          </div>

                          {/* Kept apart from the next step, and quiet: undoing a job is never the usual tap. */}
                          {(beforePickup || delivery.status !== 'assigned') && (
                            <div className="mt-5 px-3 py-1 border-t border-line flex flex-wrap gap-x-2">
                              {beforePickup && (
                                <Button variant="ghost" onClick={() => handleRelease(delivery)} disabled={busy} className="min-h-11 gap-2 text-muted hover:text-ink hover:bg-raised">
                                  <Undo2 className="w-4 h-4" aria-hidden="true" />
                                  {t('handBack')}
                                </Button>
                              )}
                              {delivery.status !== 'assigned' && (
                                <Button variant="ghost" onClick={() => {
                                  setReportReason(null);
                                  setReportModalDelivery(delivery);
                                }} disabled={busy} className="min-h-11 gap-2 text-red-700 hover:bg-red-50">
                                  <TriangleAlert className="w-4 h-4" aria-hidden="true" />
                                  {t('reportIssue')}
                                </Button>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })()}
                  </div>
                )
              )}

              {/* A job reported as not delivered: the rider still has the food, so say what to do with it. */}
              {activeTab === 'active' && recentlyFailed.length > 0 && (
                <div className="space-y-3 mt-5">
                  {recentlyFailed.map((d) => (
                    <section key={d.id} data-testid={`failed-${d.orderNumber ?? d.id}`} className="rounded-xl bg-red-50 text-red-800 px-4 py-3.5">
                      <p className="text-sm font-semibold">{t('failedNoticeTitle', { number: d.orderNumber || d.orderId.slice(0, 8) })}</p>
                      <p className="text-sm mt-0.5">{t('failedNoticeBody', { kitchen: d.pickup?.name || t('failedNoticeKitchen') })}</p>
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        {canNavigateTo(navDestinationFor({ ...d, status: 'assigned' })) && (
                          <ExternalLink
                            href={navUrlFor({ ...d, status: 'assigned' })}
                            className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl bg-surface border border-line text-sm font-semibold text-ink"
                          >
                            <Navigation className="w-4 h-4" aria-hidden="true" />
                            {t('startNavKitchen')}
                          </ExternalLink>
                        )}
                        <Link href="/support" className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl bg-surface border border-line text-sm font-semibold text-ink">
                          <LifeBuoy className="w-4 h-4" aria-hidden="true" />
                          {t('sos')}
                        </Link>
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {/* Jobs the rider can take */}
              {activeTab === 'available' && (
                <div className="space-y-4">
                  {activeDeliveries.length >= 2 ? (
                    <div className="rounded-xl bg-accent-soft text-accent-soft-ink px-4 py-3">
                      <p className="text-sm font-semibold">{t('capFullTitle')}</p>
                      <p className="text-sm mt-0.5">{t('capFullBody')}</p>
                    </div>
                  ) : activeDeliveries.length === 1 && available.some((d) => d.isRouteMatch) ? (
                    <div className="rounded-xl bg-brand-soft text-brand-soft-ink px-4 py-3">
                      <p className="text-sm font-semibold">{t('routeMatchTitle')}</p>
                      <p className="text-sm mt-0.5">
                        {t('routeMatchBody1')}<strong>{t('routeMatchBonus')}</strong>{t('routeMatchBody2')}
                      </p>
                    </div>
                  ) : null}

                  {!onDuty && profile ? (
                    <div className="py-2" data-testid="off-duty-jobs">
                      <p className="text-sm text-muted">{t('offDutyBody')}</p>
                      <Button onClick={handleToggleDuty} disabled={togglingDuty} className="mt-4 min-h-11">
                        {t('goOnDuty')}
                      </Button>
                    </div>
                  ) : available.length === 0 ? (
                    <p className="py-2 text-sm text-muted">{t('scanningBody')}</p>
                  ) : (
                    <>
                      {takeable.length > 0 && <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">{takeable.map(jobCard)}</ul>}
                      {cashLimited.length > 0 && (
                        <section aria-labelledby="cash-limited-jobs" className={takeable.length > 0 ? 'pt-2' : undefined}>
                          <h3 id="cash-limited-jobs" className="text-sm font-semibold text-ink mb-3">{t('cashLimitedHeading')}</h3>
                          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">{cashLimited.map(jobCard)}</ul>
                        </section>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Finished deliveries */}
              {activeTab === 'history' && (
                <div>
                  <p className="text-sm text-muted mb-3">{t('successfulCount', { count: deliveredTotal })}</p>
                  {completedDeliveries.length === 0 ? (
                    <p className="py-2 text-sm text-muted">{t('noCompleted')}</p>
                  ) : (
                    <ul className="rounded-2xl bg-surface border border-line divide-y divide-line">
                      {completedDeliveries.map((d) => (
                        <li key={d.id} className="px-4 py-3.5 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[15px] font-medium text-ink">{t('orderNo', { number: d.orderNumber || d.orderId.slice(0, 8) })}</p>
                            <p className="text-sm text-muted line-clamp-2"><bdi>{d.deliveryAddress}</bdi></p>
                          </div>
                          <div className="text-end shrink-0">
                            {d.riderFee != null && d.status === 'delivered' && (
                              <p className="text-[15px] font-semibold text-ink tabular-nums">{formatPrice(d.riderFee + (d.riderBonus ?? 0))}</p>
                            )}
                            {d.status === 'delivery_failed' ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">{t('notDelivered')}</span>
                            ) : d.deliveryTime ? (
                              <p className="text-sm text-muted tabular-nums">
                                {isToday(d.deliveryTime) ? formatTime(d.deliveryTime) : shortDate(d.deliveryTime)}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                      {!olderShown && deliveredTotal > completedDeliveries.filter((d) => d.status === 'delivered').length && (
                        <li className="px-4 py-2 text-center">
                          <button type="button" onClick={showOlderDeliveries} className="min-h-11 text-sm font-semibold text-brand-ink hover:underline">
                            {t('showOlder')}
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Today, cash against the limit and handling rules, kept short: the full money story is on Earnings */}
            <aside className="space-y-6 lg:pt-1">
              <section>
                <h3 className="text-sm font-semibold text-ink">{t('shiftDiagnostics')}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted">{t('runsDelivered')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums" data-testid="delivered-today">{deliveredToday.length}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t('earnedToday')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(earnedToday)}</dd>
                  </div>
                </dl>
              </section>

              <section id="cash" data-testid="rider-cash-card" className="pt-6 border-t border-line">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">{t('cashInHand')}</h3>
                  <span className={`text-xs font-medium ${cashPercent >= 100 ? 'text-red-700' : cashPercent > 80 ? 'text-accent-soft-ink' : 'text-muted'}`}>
                    {cashPercent >= 100 ? t('limitReached') : cashPercent > 80 ? t('nearLimit') : t('withinLimit')}
                  </span>
                </div>
                <p className="mt-1.5">
                  <span className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(cashInHand)}</span>
                  <span className="text-sm text-muted ms-2">{t('limitSuffix', { limit: formatPrice(floatingLimit) })}</span>
                </p>
                <div className="mt-2.5 h-1.5 rounded-full bg-raised overflow-hidden" role="presentation">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${cashPercent >= 100 ? 'bg-red-600' : cashPercent > 80 ? 'bg-accent-500' : 'bg-brand-600'}`}
                    style={{ width: `${cashPercent}%` }}
                  />
                </div>
                {cashPercent > 80 && <p className="text-sm text-muted mt-3 leading-relaxed">{t('cashExplain')}</p>}
                <Link href="/riders/earnings" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink hover:underline">
                  {t('earningsLink')}
                </Link>
              </section>

              <details className="group pt-4 border-t border-line">
                <summary className="flex items-center justify-between gap-3 min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <span className="text-sm font-semibold text-ink flex items-center gap-2">
                    <Snowflake className="w-4 h-4 text-brand-700" aria-hidden="true" />
                    {t('coldChain')}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <ul className="mt-2 space-y-2.5 text-sm text-muted leading-relaxed list-disc ps-5 marker:text-line-strong">
                  <li>{t('coldChain1')}</li>
                  <li>{t('coldChain2')}</li>
                  <li>{t('coldChain3')}</li>
                </ul>
              </details>

              {!(activeTab === 'active' && recentlyFailed.length > 0) && (
                <Link href="/support" className="-mt-2 inline-flex items-center gap-2 min-h-11 text-sm font-semibold text-brand-ink hover:underline">
                  <LifeBuoy className="w-4 h-4" aria-hidden="true" />
                  {t('sos')}
                </Link>
              )}
            </aside>
          </div>
        )}
        {/* Room for the next-step bar fixed at the bottom of a phone screen. */}
        {activeTab === 'active' && focused && !blockedReason && <div aria-hidden="true" className={`${jobsByStep.length > 1 ? 'h-28' : 'h-20'} sm:hidden`} />}
      </div>

      {/* Handing over at the door: the customer's 4-digit code */}
      {pinModalDelivery && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="pin-title" className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] sm:pb-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="pin-title" className="text-xl font-semibold text-ink">{t('pinTitle')}</h3>
                <p className="text-sm text-muted mt-1">{t('pinSubtitle')}</p>
              </div>
              <button type="button" onClick={() => setPinModalDelivery(null)} aria-label={tc('cancel')} className="w-11 h-11 -me-2 -mt-2 rounded-full flex items-center justify-center text-muted hover:bg-raised">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {pinModalDelivery.paymentMethod === 'cod' && !!pinModalDelivery.totalAmount && (
              <p className="mt-5 flex items-center gap-2 rounded-xl bg-accent-soft text-accent-soft-ink px-3.5 py-3 text-sm">
                <Banknote className="w-4 h-4 shrink-0" aria-hidden="true" />
                {t('codReminder')}
                <strong className="ms-auto text-base tabular-nums">{formatPrice(pinModalDelivery.totalAmount)}</strong>
              </p>
            )}

            <p className="text-[15px] text-ink mt-5">
              {t('pinAsk1')}<strong>{t('pinAskBold')}</strong>{t('pinAsk2')}
            </p>

            <div className="flex justify-center gap-3 mt-5" dir="ltr">
              {pinDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={pinInputRefs[idx]}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label={`${t('pinAskBold')} ${idx + 1}`}
                  maxLength={idx === 0 ? 4 : 1}
                  value={digit}
                  disabled={verifyingPin || pinLocked}
                  aria-invalid={Boolean(pinError)}
                  aria-describedby={pinError ? 'pin-error' : undefined}
                  onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(idx, e)}
                  className="w-14 h-16 text-center text-2xl font-semibold text-ink tabular-nums bg-raised border border-line rounded-2xl focus:border-brand-600 focus:bg-surface focus:outline-none focus:ring-3 focus:ring-brand/30"
                />
              ))}
            </div>

            {pinError && !pinLocked && (
              <p id="pin-error" role="alert" className="mt-3 text-center text-sm text-red-700">{pinError}</p>
            )}

            {pinLocked && (
              <div className="mt-5 rounded-xl bg-red-50 text-red-800 p-3.5 text-sm space-y-1.5">
                <p>{t('pinLockedHelp')}</p>
                <Link href="/support" className="inline-block font-semibold underline">{t('pinLockedSupport')}</Link>
              </div>
            )}


            <Button
              size="lg"
              onClick={() => void handleVerifyPinSubmit()}
              disabled={verifyingPin || pinDigits.some((d) => !d)}
              className="w-full min-h-12 mt-6 text-[15px]"
            >
              {verifyingPin ? t('verifyingPin') : t('confirmHandover')}
            </Button>
          </div>
        </div>
      )}

      {/* Reporting a delivery that cannot be completed */}
      {reportModalDelivery && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-surface rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(1.5rem+var(--safe-bottom))] sm:pb-6 shadow-2xl">
            <h3 id="report-title" className="text-xl font-semibold text-ink">{t('reportTitle')}</h3>
            <p className="text-sm text-muted mt-1">{t('orderNo', { number: reportModalDelivery.orderNumber })}</p>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-ink mb-1.5">{t('reason')}</legend>
              <div className="rounded-xl border border-line divide-y divide-line">
                {REPORT_REASONS.map(([value, key]) => (
                  <label key={value} className="flex items-center gap-3 min-h-12 px-3.5 py-2 cursor-pointer text-[15px] text-ink has-[:checked]:bg-raised first:rounded-t-xl last:rounded-b-xl">
                    <input
                      type="radio"
                      name="report-reason"
                      value={value}
                      checked={reportReason === value}
                      onChange={() => setReportReason(value)}
                      className="w-5 h-5 shrink-0 accent-brand-700"
                    />
                    {t(key)}
                  </label>
                ))}
              </div>
            </fieldset>

            <label htmlFor="report-notes" className="block text-sm font-medium text-ink mt-4 mb-1.5">{t('additionalNotes')}</label>
            <textarea
              id="report-notes"
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              rows={2}
              placeholder={t('notesPlaceholder')}
              className="w-full bg-surface border border-line-strong rounded-xl px-3 py-2.5 text-[15px] text-ink focus:outline-none focus:ring-3 focus:ring-brand/30 focus:border-brand-600"
            />

            <p className="mt-4 rounded-xl bg-raised px-3.5 py-3 text-sm text-ink">{t('reportNext')}</p>

            {!reportReason && <p id="report-choose" className="mt-4 text-sm text-muted">{t('chooseReason')}</p>}
            <div className={`flex flex-col-reverse sm:flex-row gap-3 ${reportReason ? 'mt-6' : 'mt-2'}`}>
              <Button variant="outline" onClick={() => setReportModalDelivery(null)} className="min-h-11 sm:flex-none">
                {tc('cancel')}
              </Button>
              <Button variant="destructive" onClick={handleReportFailureSubmit} disabled={reporting || !reportReason} aria-describedby={reportReason ? undefined : 'report-choose'} className="flex-1 min-h-11">
                {reporting ? t('reporting') : t('submitIssue')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
