'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, RIDER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { riderService, Delivery, RiderProfile } from '@/lib/services/rider.service';
import { formatPrice, displayRating } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { useRiderLocation, LocationSharing } from '@/lib/hooks/use-rider-location';
import Link from 'next/link';
import RiderApplicationForm from '@/components/riders/RiderApplicationForm';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { riderMessages, riderKeyFor, type RiderMessageKey } from '@/lib/i18n/messages/rider';

const ROAD_STEPS: { id: string; labelKey: RiderMessageKey; icon: string }[] = [
  { id: 'assigned', labelKey: 'step.assigned', icon: '📋' },
  { id: 'arrived_at_pickup', labelKey: 'step.arrived_at_pickup', icon: '🍳' },
  { id: 'picked_up', labelKey: 'step.picked_up', icon: '❄️' },
  { id: 'in_transit', labelKey: 'step.in_transit', icon: '🛵' },
  { id: 'arrived_at_customer', labelKey: 'step.arrived_at_customer', icon: '📍' },
  { id: 'delivered', labelKey: 'step.delivered', icon: '✅' },
];

const SHARING_BADGE: Record<LocationSharing, { labelKey: RiderMessageKey; tone: string; dot: string }> = {
  sharing: { labelKey: 'loc.sharing', tone: 'text-emerald-400', dot: 'bg-emerald-400 animate-ping' },
  waiting: { labelKey: 'loc.waiting', tone: 'text-slate-300', dot: 'bg-slate-400 animate-pulse' },
  denied: { labelKey: 'loc.denied', tone: 'text-amber-300', dot: 'bg-amber-400' },
  unavailable: { labelKey: 'loc.unavailable', tone: 'text-amber-300', dot: 'bg-amber-400' },
  off: { labelKey: 'loc.off', tone: 'text-slate-400', dot: 'bg-slate-500' },
};

const TABS = ['active', 'available', 'history'] as const;

// A job that is over: delivered, reported failed, or called off (order cancelled).
const FINISHED_STATUSES = ['delivered', 'delivery_failed', 'cancelled'];

const STEP_ORDER: Record<string, number> = {
  assigned: 0,
  arrived_at_pickup: 1,
  picked_up: 2,
  in_transit: 3,
  arrived_at_customer: 4,
  delivered: 5,
};

export default function RiderDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const t = useT(riderMessages);
  const tc = useT(commonMessages);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'available' | 'history'>('active');
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [available, setAvailable] = useState<Delivery[]>([]);
  const [mine, setMine] = useState<Delivery[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [togglingDuty, setTogglingDuty] = useState(false);

  // Doorstep PIN Handshake Modal state
  const [pinModalDelivery, setPinModalDelivery] = useState<Delivery | null>(null);
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
  const [reportReason, setReportReason] = useState('Customer unreachable');
  const [reportNotes, setReportNotes] = useState('');
  const [reporting, setReporting] = useState(false);

  // title is a message key; message is the server's words (or null for our default text).
  const [blockedReason, setBlockedReason] = useState<{ title: RiderMessageKey; message: string | null; code: string } | null>(null);

  const loadAll = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setBlockedReason(null);

      const [availableRes, mineRes, profileRes] = await Promise.all([
        riderService.getAvailableDeliveries(),
        riderService.getMyDeliveries(),
        riderService.getRiderProfile().catch(() => null),
      ]);

      const availableList = availableRes.data || [];
      const myList = mineRes.data || [];

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
    } catch (error: any) {
      const code = error.response?.data?.error?.code;
      if (code && (code === 'RIDER_NOT_APPROVED' || code === 'RIDER_REJECTED' || code === 'RIDER_SUSPENDED')) {
        setBlockedReason({
          title: code === 'RIDER_NOT_APPROVED' ? 'blockedUnderReview' : 'blockedInactive',
          message: error.response?.data?.error?.message || null,
          code,
        });
      } else if (!silent) {
        showToast(error.response?.data?.error?.message || t('loadFailed'), 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast, activeTab, t]);

  const isRider = user?.user_type === 'rider' || user?.userType === 'rider';

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

  // Auth guard and initial load. The saved session can load a moment after the first
  // render, so a stored token means "wait for it", not "send to login".
  useEffect(() => {
    if (!isAuthenticated && !apiClient.getAccessToken()) {
      router.push('/login');
      return;
    }
    if (!user) return;
    if (!isRider) {
      router.push('/products');
      showToast(t('accessDenied'), 'error');
      return;
    }
    loadAll();
    // loadAll changes with the active tab; reloading on every tab switch isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user, isRider, router, showToast]);

  // New jobs, jobs taken by other riders or cancelled, and status changes on this rider's
  // orders (e.g. the kitchen marking food ready) arrive as live events.
  useLiveRefresh(() => loadAll(true), {
    events: ['delivery:new', 'delivery:removed', 'delivery:cancelled', 'delivery:assigned', 'order:status:update'],
    enabled: isAuthenticated && isRider && !blockedReason,
    intervalMs: 30_000,
  });

  const activeDeliveries = mine.filter(
    (d) => !FINISHED_STATUSES.includes(d.status)
  );
  const completedDeliveries = mine.filter((d) => d.status === 'delivered');

  // The phone's position goes to each job in progress (and nowhere when there is none).
  const locationSharing = useRiderLocation(
    activeDeliveries.map((d) => d.id),
    () => loadAll(true)
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
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('toggleDutyFailed'), 'error');
    } finally {
      setTogglingDuty(false);
    }
  };

  // Claim delivery from pool (with optional inDrive askFee)
  const handleClaim = async (deliveryId: string, askFee?: number) => {
    try {
      setBusyId(deliveryId);
      await riderService.claimDelivery(deliveryId, askFee);
      showToast(
        askFee
          ? t('claimedCustom', { fee: askFee })
          : t('claimed'),
        'success'
      );
      setActiveTab('active');
      loadAll(true);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('claimFailed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  // Advance delivery along the real fulfillment lifecycle
  const handleAdvanceStatus = async (delivery: Delivery) => {
    try {
      setBusyId(delivery.id);
      if (delivery.status === 'assigned') {
        await riderService.updateDeliveryStatus(delivery.id, 'arrived_at_pickup');
        showToast(t('toastArrivedKitchen'), 'info');
      } else if (delivery.status === 'arrived_at_pickup') {
        await riderService.updateDeliveryStatus(delivery.id, 'picked_up');
        showToast(t('toastPickedUp'), 'success');
      } else if (delivery.status === 'picked_up') {
        await riderService.updateDeliveryStatus(delivery.id, 'in_transit');
        showToast(t('toastDeparted'), 'info');
      } else if (delivery.status === 'in_transit') {
        await riderService.updateDeliveryStatus(delivery.id, 'arrived_at_customer');
        showToast(t('toastArrivedDoor'), 'info');
        setPinModalDelivery(delivery);
        setPinDigits(['', '', '', '']);
        setTimeout(() => pinInputRefs[0].current?.focus(), 150);
      } else if (delivery.status === 'arrived_at_customer') {
        setPinModalDelivery(delivery);
        setPinDigits(['', '', '', '']);
        setTimeout(() => pinInputRefs[0].current?.focus(), 150);
      }
      loadAll(true);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('statusUpdateFailed'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  // PIN modal digit input
  const handlePinDigitChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const char = val.slice(-1);
    const updated = [...pinDigits];
    updated[index] = char;
    setPinDigits(updated);

    if (char && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  // Submit Handshake PIN
  const handleVerifyPinSubmit = async () => {
    const fullPin = pinDigits.join('');
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
      setActiveTab('history');
      loadAll(true);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('pinInvalid'), 'error');
    } finally {
      setVerifyingPin(false);
    }
  };

  // Submit Failure Report
  const handleReportFailureSubmit = async () => {
    if (!reportModalDelivery) return;
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
      setReportNotes('');
      loadAll(true);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('issueReportFailed'), 'error');
    } finally {
      setReporting(false);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'rider' && user?.userType !== 'rider')) {
    return null;
  }

  const cashInHand = profile?.cashInHand ?? 0;
  const floatingLimit = profile?.floatingLimit ?? 10000;
  const cashPercent = floatingLimit > 0 ? Math.min(100, Math.round((cashInHand / floatingLimit) * 100)) : cashInHand > 0 ? 100 : 0;

  // The profile API returns null for details the rider hasn't provided and a 0 rating
  // until they are rated: show "Not set" / "New" rather than made-up values.
  const riderRating = displayRating(profile?.ratingAverage);
  const vehicleLabel =
    [profile?.vehicleType, profile?.vehicleNumber ? `(${profile.vehicleNumber})` : null]
      .filter(Boolean)
      .join(' ') || t('notSet');

  return (
    <DashboardLayout
      title={t('title')}
      subtitle={t('subtitle')}
      sidebarItems={RIDER_SIDEBAR_ITEMS}
      userType="rider"
    >
      <div className="max-w-7xl mx-auto space-y-6">

        {/* 1. COMPACT COMMAND & TELEMETRY BAR */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-2xl flex-shrink-0 shadow-md">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-lg text-white">
                  {profile?.name || (user as any)?.profile?.fullName || t('nameNotSet')}
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ⭐ {riderRating ? t('fleetScore', { rating: riderRating }) : t('newRider')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('vehicleLabel')} <strong className="text-slate-200">{vehicleLabel}</strong> • {t('cityLabel')} <strong className="text-slate-200">{profile?.city || t('notSet')}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap w-full md:w-auto justify-between md:justify-end">
            {/* Location sharing, only while on a job */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs" data-testid="location-sharing">
              <span className={`w-2 h-2 rounded-full ${SHARING_BADGE[locationSharing].dot}`} />
              <span className={`font-semibold ${SHARING_BADGE[locationSharing].tone}`}>{t(SHARING_BADGE[locationSharing].labelKey)}</span>
            </div>

            {/* Capacity Limit Indicator */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                activeDeliveries.length >= 2
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700'
              }`}
            >
              <span>🛵</span>
              <span>{t('capacity', { count: activeDeliveries.length })}</span>
            </div>

            {/* Duty Status Switch */}
            <button
              onClick={handleToggleDuty}
              disabled={togglingDuty}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs tracking-wider transition-all duration-200 flex items-center gap-2 border shadow-sm ${
                profile?.isAvailable !== false
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  profile?.isAvailable !== false ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              {profile?.isAvailable !== false ? t('onDuty') : t('offDuty')}
            </button>
          </div>
        </div>

        {/* 2. UNIFIED 2-COLUMN MISSION CONTROL COCKPIT */}
        {loading && !profile && mine.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center shadow-sm border border-slate-200">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-800">{t('connecting')}</h3>
          </div>
        ) : blockedReason && (blockedReason.code === 'RIDER_NOT_APPROVED' || blockedReason.code === 'RIDER_REJECTED') ? (
          <RiderApplicationForm />
        ) : blockedReason ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ⏳
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">{t(blockedReason.title)}</h2>
            <p className="text-slate-600 max-w-md mx-auto">{blockedReason.message ?? t('blockedContactSupport')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* MAIN OPERATIONAL WORKSPACE (LEFT 8 COLS) */}
            <div className="lg:col-span-8 space-y-4">

              {/* SEGMENTED OPERATIONAL TABS */}
              <div className="bg-white rounded-2xl p-1.5 shadow-sm border border-slate-200 flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('active')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black tracking-wide transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'active'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{t('tabActive')}</span>
                  {activeDeliveries.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white animate-pulse">
                      {activeDeliveries.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('available')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black tracking-wide transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'available'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{t('tabAvailable')}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    activeTab === 'available' ? 'bg-amber-400 text-slate-900' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {available.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black tracking-wide transition-all flex items-center justify-center gap-2 ${
                    activeTab === 'history'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>{t('tabHistory')}</span>
                  <span className="text-[11px] text-slate-400 font-bold">
                    ({completedDeliveries.length})
                  </span>
                </button>
              </div>

              {/* TAB 1: ACTIVE RUN CONSOLE */}
              {activeTab === 'active' && (
                <div>
                  {activeDeliveries.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-3xl">
                        🛵
                      </div>
                      <h3 className="font-bold text-slate-800 text-base">{t('noActiveTitle')}</h3>
                      <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1 mb-5">
                        {t('noActiveBody')}
                      </p>
                      <div className="flex justify-center gap-3">
                        <Button
                          onClick={() => setActiveTab('available')}
                          className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                        >
                          {t('viewAvailable', { count: available.length })}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {activeDeliveries.map((delivery) => {
                        const currentStepIdx = STEP_ORDER[delivery.status] ?? 0;
                        const isAtPickup = delivery.status === 'assigned' || delivery.status === 'arrived_at_pickup';
                        const isInTransit = delivery.status === 'picked_up' || delivery.status === 'in_transit';
                        const isAtDoorstep = delivery.status === 'arrived_at_customer';

                        return (
                          <div
                            key={delivery.id}
                            data-testid={`run-${delivery.orderNumber ?? delivery.id}`}
                            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
                          >
                            {/* Card Header & Order Badge */}
                            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-base tracking-wide text-white">
                                    {t('orderNo', { number: delivery.orderNumber || delivery.orderId.slice(0, 8) })}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                                    {(() => {
                                      const k = riderKeyFor('dstatus', delivery.status);
                                      return k ? t(k) : delivery.status.replace(/_/g, ' ');
                                    })()}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-[11px] font-bold text-slate-400">
                                  {delivery.paymentMethod === 'cod' ? t('collect') : t('prepaid')}{' '}
                                  <span className="text-sm font-black text-emerald-400">{formatPrice(delivery.totalAmount || 0)}</span>
                                </span>
                                {delivery.riderFee != null && (
                                  <span className="text-[11px] font-bold text-slate-400">
                                    {t('youEarn')}{' '}
                                    <span className="text-sm font-black text-white">{formatPrice(delivery.riderFee + (delivery.riderBonus ?? 0))}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* COMPACT 5-STEP JOURNEY ROADMAP */}
                            <div className="bg-slate-50/70 border-b border-slate-200 px-5 py-3.5">
                              <div className="relative">
                                <div className="absolute top-3.5 start-4 end-4 h-1 bg-slate-200 -z-0 rounded-full" />
                                <div
                                  className="absolute top-3.5 start-4 h-1 bg-emerald-500 -z-0 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(100, (currentStepIdx / 4) * 100)}%`,
                                  }}
                                />

                                <div className="relative z-10 flex justify-between items-center">
                                  {ROAD_STEPS.slice(0, 5).map((step, idx) => {
                                    const isDone = idx < currentStepIdx;
                                    const isCurrent = idx === currentStepIdx;

                                    return (
                                      <div key={step.id} className="flex flex-col items-center">
                                        <div
                                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                            isDone
                                              ? 'bg-emerald-500 text-white'
                                              : isCurrent
                                              ? 'bg-slate-900 text-white ring-2 ring-emerald-400 ring-offset-1 scale-110'
                                              : 'bg-white border border-slate-300 text-slate-400'
                                          }`}
                                        >
                                          {isDone ? '✓' : step.icon}
                                        </div>
                                        <span
                                          className={`text-[10px] mt-1 ${
                                            isCurrent
                                              ? 'text-slate-900 font-bold'
                                              : isDone
                                              ? 'text-emerald-700 font-medium'
                                              : 'text-slate-400'
                                          }`}
                                        >
                                          {t(step.labelKey)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* ROUTE NODES (PICKUP & DROPOFF) */}
                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 flex items-start justify-between gap-2.5">
                                <div className="flex items-start gap-2.5">
                                  <span className="text-xl">🏪</span>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-blue-900 block">{t('pickupKitchen')}</span>
                                    <p className="text-xs font-bold text-slate-800 mt-0.5">{delivery.pickupAddress}</p>
                                    <span className="inline-block text-[10px] text-blue-700 mt-1 font-medium bg-blue-100/70 px-2 py-0.5 rounded">
                                      {t('prepVerify')}
                                    </span>
                                  </div>
                                </div>
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.pickupAddress)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-xs whitespace-nowrap transition-all flex items-center gap-1"
                                >
                                  {t('maps')}
                                </a>
                              </div>

                              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-start justify-between gap-2.5">
                                <div className="flex items-start gap-2.5">
                                  <span className="text-xl">📍</span>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-emerald-900 block">{t('dropoffCustomer')}</span>
                                    <p className="text-xs font-bold text-slate-800 mt-0.5">{delivery.deliveryAddress}</p>
                                    <span className="inline-block text-[10px] text-emerald-700 mt-1 font-medium bg-emerald-100/70 px-2 py-0.5 rounded">
                                      {t('doorstepPin')}
                                    </span>
                                  </div>
                                </div>
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.deliveryAddress)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs whitespace-nowrap transition-all flex items-center gap-1"
                                >
                                  {t('maps')}
                                </a>
                              </div>
                            </div>

                            {/* STREAMLINED OPERATIONAL ACTIONS */}
                            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setReportModalDelivery(delivery)}
                                disabled={busyId === delivery.id}
                                className="border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold"
                              >
                                {t('reportIssue')}
                              </Button>

                              <Button
                                onClick={() => handleAdvanceStatus(delivery)}
                                disabled={busyId === delivery.id}
                                className={`font-black text-xs px-5 py-2 rounded-xl transition-all shadow-md ${
                                  delivery.status === 'assigned'
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                                    : delivery.status === 'arrived_at_pickup'
                                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-500/20'
                                    : delivery.status === 'picked_up'
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20'
                                    : delivery.status === 'in_transit'
                                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                                }`}
                              >
                                {busyId === delivery.id ? (
                                  t('processing')
                                ) : delivery.status === 'assigned' ? (
                                  t('actArrivedKitchen')
                                ) : delivery.status === 'arrived_at_pickup' ? (
                                  t('actPickUp')
                                ) : delivery.status === 'picked_up' ? (
                                  t('actDepart')
                                ) : delivery.status === 'in_transit' ? (
                                  t('actArrivedDoor')
                                ) : (
                                  t('actVerifyPin')
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: AVAILABLE RUNS POOL */}
              {activeTab === 'available' && (
                <div className="space-y-4">
                  {/* Concurrency Limit & Smart Batching Banner */}
                  {activeDeliveries.length >= 2 ? (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🔒</span>
                        <div>
                          <h4 className="text-xs font-black text-amber-900 uppercase tracking-wide">
                            {t('capFullTitle')}
                          </h4>
                          <p className="text-xs text-amber-800/80 mt-0.5">
                            {t('capFullBody')}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-amber-600 text-white whitespace-nowrap shadow-xs">
                        {t('capFullBadge')}
                      </span>
                    </div>
                  ) : activeDeliveries.length === 1 ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">⚡</span>
                        <div>
                          <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wide">
                            {t('routeMatchTitle')}
                          </h4>
                          <p className="text-xs text-emerald-800/80 mt-0.5">
                            {t('routeMatchBody1')}<strong>{t('routeMatchBonus')}</strong>{t('routeMatchBody2')}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-emerald-700 text-white whitespace-nowrap shadow-xs">
                        {t('slotAvailable')}
                      </span>
                    </div>
                  ) : null}

                  {available.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                      <div className="relative w-14 h-14 mx-auto mb-3">
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
                        <div className="relative w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-2xl">
                          📡
                        </div>
                      </div>
                      <h3 className="font-bold text-slate-800 text-base">{t('scanningTitle')}</h3>
                      <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1 mb-2">
                        {t('scanningBody')}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {available.map((d) => (
                        <div
                          key={d.id}
                          data-testid={`job-${d.orderNumber ?? d.id}`}
                          className={`bg-white rounded-2xl border p-4 transition-all flex flex-col justify-between shadow-xs ${
                            d.isRouteMatch
                              ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2 gap-1.5">
                              <span className="font-black text-slate-900 text-sm">
                                {t('orderNo', { number: d.orderNumber || d.orderId.slice(0, 8) })}
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {d.isRouteMatch && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white shadow-xs animate-pulse">
                                    {t('routeMatch', { bonus: d.batchBonus })}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  {tc('status.ready')}
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-slate-600 mb-2.5">
                              <p className="flex items-start gap-1.5">
                                <span className="font-bold text-slate-800">{t('pickupLabel')}</span>
                                <span className="truncate">{d.pickupAddress}</span>
                              </p>
                              <p className="flex items-start gap-1.5">
                                <span className="font-bold text-slate-800">{t('deliverLabel')}</span>
                                <span className="truncate">{d.deliveryAddress}</span>
                              </p>
                              {d.totalAmount && (
                                <p className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-800">{t('orderValue')}</span>
                                  <span className="font-black text-emerald-700">{formatPrice(d.totalAmount)}</span>
                                  <span className="text-slate-400 text-[11px]">({d.paymentMethod?.toUpperCase() || 'COD'})</span>
                                </p>
                              )}
                            </div>

                            {/* Bounded inDrive-Style Price Corridor Badge */}
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 mb-3 text-[11px] space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600 font-semibold">{t('standardPayout')}</span>
                                <span className="font-black text-emerald-700">
                                  Rs {d.standardFee}
                                  {d.isRouteMatch && (
                                    <span className="text-[10px] text-emerald-600 font-bold ms-1">
                                      {t('bonusSuffix', { bonus: d.batchBonus })}
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>{t('corridor')}</span>
                                <span className="font-medium text-slate-700">
                                  {t('corridorRange', { min: d.minAskFee, max: d.maxAskFee })}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Claim / Counter-Offer Buttons */}
                          {activeDeliveries.length >= 2 ? (
                            <Button
                              disabled
                              className="w-full bg-slate-200 text-slate-400 font-bold text-xs py-2 rounded-xl"
                            >
                              {t('atCapacity')}
                            </Button>
                          ) : d.exceedsCashLimit ? (
                            <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900" data-testid="cash-limit-blocked">
                              <strong>{t('cashLimitTitle')}</strong> {t('cashLimitBody', { limit: formatPrice(floatingLimit) })}
                            </div>
                          ) : (
                            <div className="flex gap-2 items-center">
                              <Button
                                onClick={() => handleClaim(d.id)}
                                disabled={busyId === d.id}
                                className="flex-1 bg-slate-900 hover:bg-emerald-600 text-white font-bold text-xs py-2 rounded-xl transition-colors shadow-xs"
                              >
                                {busyId === d.id
                                  ? t('claiming')
                                  : d.isRouteMatch
                                  ? t('claimBatched', { bonus: d.batchBonus })
                                  : t('claim', { fee: d.standardFee })}
                              </Button>
                              {(d.maxAskFee ?? 0) > (d.standardFee ?? 0) && (
                                <Button
                                  variant="outline"
                                  onClick={() => handleClaim(d.id, d.maxAskFee)}
                                  disabled={busyId === d.id}
                                  className="border-cyan-300 text-cyan-800 hover:bg-cyan-50 font-bold text-[11px] py-2 px-2.5 rounded-xl whitespace-nowrap"
                                  title={t('askMaxTitle')}
                                >
                                  {t('askFee', { fee: d.maxAskFee })}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: COMPLETED RUNS HISTORY */}
              {activeTab === 'history' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-black text-sm text-slate-900">{t('deliveredOrders')}</h3>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      {t('successfulCount', { count: completedDeliveries.length })}
                    </span>
                  </div>

                  {completedDeliveries.length === 0 ? (
                    <div className="p-10 text-center text-slate-500 text-xs">
                      {t('noCompleted')}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {completedDeliveries.map((d) => (
                        <div
                          key={d.id}
                          className="px-5 py-3.5 flex items-center justify-between text-xs text-slate-600 hover:bg-slate-50/50"
                        >
                          <div>
                            <span className="font-bold text-slate-900 text-sm">
                              {t('orderNo', { number: d.orderNumber || d.orderId.slice(0, 8) })}
                            </span>
                            <p className="text-slate-500 mt-0.5">{d.deliveryAddress}</p>
                          </div>
                          <div className="text-end">
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] border border-emerald-200">
                              {t('pinVerified')}
                            </span>
                            {d.riderFee != null && (
                              <p className="font-bold text-slate-900 mt-1">{t('youEarned', { amount: formatPrice(d.riderFee + (d.riderBonus ?? 0)) })}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* DIAGNOSTICS & FLOAT SETTLEMENT SIDEBAR (RIGHT 4 COLS) */}
            <div className="lg:col-span-4 space-y-4">

              {/* COD CASH IN HAND & SETTLEMENT */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200" id="cash" data-testid="rider-cash-card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-sm text-slate-900">{t('cashInHand')}</h3>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      cashPercent >= 100
                        ? 'text-red-700 bg-red-50 border-red-200'
                        : cashPercent > 80
                        ? 'text-amber-700 bg-amber-50 border-amber-200'
                        : 'text-emerald-600 bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    {cashPercent >= 100 ? t('limitReached') : cashPercent > 80 ? t('nearLimit') : t('withinLimit')}
                  </span>
                </div>

                <div className="my-3">
                  <span className="text-2xl font-black text-slate-900">{formatPrice(cashInHand)}</span>
                  <span className="text-xs text-slate-400 ms-2">{t('limitSuffix', { limit: formatPrice(floatingLimit) })}</span>
                </div>

                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all duration-500 ${
                      cashPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${cashPercent}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-500">
                  {t('cashExplain')}
                </p>
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {(profile?.balance ?? 0) >= 0 ? t('nurayOwesYou') : t('youOweNuray')}{' '}
                    <strong className="text-slate-900">{formatPrice(Math.abs(profile?.balance ?? 0))}</strong>
                  </span>
                  <Link href="/riders/earnings" className="font-bold text-emerald-700 hover:underline">
                    {t('earningsLink')}
                  </Link>
                </div>
              </div>

              {/* FLEET DIAGNOSTICS */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
                <h3 className="font-black text-sm text-slate-900">{t('shiftDiagnostics')}</h3>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">{t('runsDelivered')}</span>
                    <span className="text-base font-black text-slate-800">{completedDeliveries.length}</span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">{t('activeNow')}</span>
                    <span className="text-base font-black text-slate-800">{activeDeliveries.length}</span>
                  </div>
                </div>
              </div>

              {/* COLD-CHAIN PROTOCOL & FLEET SUPPORT */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm border border-slate-700 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">❄️</span>
                  <h3 className="font-black text-sm text-white">{t('coldChain')}</h3>
                </div>
                <ul className="text-xs text-slate-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>{t('coldChain1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{t('coldChain2')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>{t('coldChain3')}</span>
                  </li>
                </ul>
                <div className="pt-2 border-t border-slate-700/80">
                  <a
                    href="/support"
                    className="block text-center py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors border border-slate-600"
                  >
                    {t('sos')}
                  </a>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>

      {/* 3. IN-APP DOORSTEP PIN HANDSHAKE MODAL */}
      {pinModalDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">
                    🤝
                  </span>
                  <div>
                    <h3 className="font-black text-lg">{t('pinTitle')}</h3>
                    <p className="text-xs text-emerald-100">{t('pinSubtitle')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setPinModalDelivery(null)}
                  className="text-white/80 hover:text-white text-xl font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="text-center">
                <p className="text-sm text-slate-600">
                  {t('pinAsk1')}<strong>{t('pinAskBold')}</strong>{t('pinAsk2')}
                </p>
              </div>

              {/* 4 Digit Boxes */}
              <div className="flex justify-center gap-3" dir="ltr">
                {pinDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={pinInputRefs[idx]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(idx, e)}
                    className="w-14 h-16 text-center text-2xl font-black text-slate-900 border-2 border-slate-200 rounded-2xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none transition-all"
                  />
                ))}
              </div>

              {/* COD Reminder Banner */}
              {pinModalDelivery.paymentMethod === 'cod' && !!pinModalDelivery.totalAmount && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-900">
                    {t('codReminder')}
                  </span>
                  <span className="text-base font-black text-amber-700">
                    {formatPrice(pinModalDelivery.totalAmount)}
                  </span>
                </div>
              )}

              {/* Submit / Cancel Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleVerifyPinSubmit}
                  disabled={verifyingPin || pinDigits.some((d) => !d)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20"
                >
                  {verifyingPin ? t('verifyingPin') : t('confirmHandover')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPinModalDelivery(null)}
                  className="rounded-xl border-slate-200 text-slate-600"
                >
                  {tc('cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. REPORT ISSUE / FAILED DELIVERY MODAL */}
      {reportModalDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-red-600 px-6 py-4 text-white">
              <h3 className="font-bold text-lg">{t('reportTitle')}</h3>
              <p className="text-xs text-red-100">{t('orderNo', { number: reportModalDelivery.orderNumber })}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">{t('reason')}</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="Customer unreachable">{t('reason.unreachable')}</option>
                  <option value="Incorrect address">{t('reason.address')}</option>
                  <option value="Customer refused package">{t('reason.refused')}</option>
                  <option value="Cold-chain temperature issue">{t('reason.coldChain')}</option>
                  <option value="Road accident / emergency">{t('reason.accident')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t('additionalNotes')}</label>
                <textarea
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  rows={3}
                  placeholder={t('notesPlaceholder')}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="destructive"
                  onClick={handleReportFailureSubmit}
                  disabled={reporting}
                  className="flex-1 rounded-xl font-bold"
                >
                  {reporting ? t('reporting') : t('submitIssue')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setReportModalDelivery(null)}
                  className="rounded-xl"
                >
                  {tc('cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
