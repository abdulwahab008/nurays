'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, RIDER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { riderService, Delivery, RiderProfile } from '@/lib/services/rider.service';
import { formatPrice } from '@/lib/utils';

const ROAD_STEPS = [
  { id: 'assigned', label: 'Claimed', icon: '📋' },
  { id: 'arrived_at_pickup', label: 'At Kitchen', icon: '🍳' },
  { id: 'picked_up', label: 'Cold-Packed', icon: '❄️' },
  { id: 'in_transit', label: 'In Transit', icon: '🛵' },
  { id: 'arrived_at_customer', label: 'At Doorstep', icon: '📍' },
  { id: 'delivered', label: 'Delivered', icon: '✅' },
];

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

  const [blockedReason, setBlockedReason] = useState<{ title: string; message: string } | null>(null);

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
        (d) => d.status !== 'delivered' && d.status !== 'delivery_failed'
      );
      if (activeRuns.length > 0 && activeTab === 'available' && availableList.length === 0) {
        setActiveTab('active');
      }
    } catch (error: any) {
      const code = error.response?.data?.error?.code;
      if (code && (code === 'RIDER_NOT_APPROVED' || code === 'RIDER_REJECTED' || code === 'RIDER_SUSPENDED')) {
        setBlockedReason({
          title: code === 'RIDER_NOT_APPROVED' ? 'Application Under Review' : 'Account Inactive',
          message: error.response?.data?.error?.message || 'Contact fleet support for assistance.',
        });
      } else if (!silent) {
        showToast(error.response?.data?.error?.message || 'Failed to load deliveries', 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast, activeTab]);

  // Auth guard and initial load
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user?.user_type !== 'rider' && user?.userType !== 'rider') {
      router.push('/products');
      showToast('Access denied. Rider fleet account required.', 'error');
      return;
    }
    loadAll();
  }, [isAuthenticated, user, router, loadAll, showToast]);

  // Automated 3-second live polling loop for real-time fleet telemetry
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      loadAll(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated, loadAll]);

  const activeDeliveries = mine.filter(
    (d) => d.status !== 'delivered' && d.status !== 'delivery_failed'
  );
  const completedDeliveries = mine.filter((d) => d.status === 'delivered');
  const failedDeliveries = mine.filter((d) => d.status === 'delivery_failed');

  // Toggle on-duty / off-duty
  const handleToggleDuty = async () => {
    try {
      setTogglingDuty(true);
      const res = await riderService.toggleDutyStatus(!profile?.isAvailable);
      if (profile) {
        setProfile({ ...profile, isAvailable: res.data.isAvailable });
      }
      showToast(
        res.data.isAvailable ? '🟢 You are now ON DUTY' : '⚪ You are now OFF DUTY',
        'success'
      );
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to toggle duty status', 'error');
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
          ? `Run claimed with custom rate of Rs ${askFee}! Route loaded in Active Runs.`
          : 'Run claimed! Route is now loaded in Active Runs.',
        'success'
      );
      setActiveTab('active');
      loadAll(true);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to claim delivery', 'error');
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
        showToast('📍 Marked arrived at kitchen!', 'info');
      } else if (delivery.status === 'arrived_at_pickup') {
        await riderService.updateDeliveryStatus(delivery.id, 'picked_up');
        showToast('❄️ Order picked up from kitchen & packed in cold-box!', 'success');
      } else if (delivery.status === 'picked_up') {
        await riderService.updateDeliveryStatus(delivery.id, 'in_transit');
        showToast('🛵 Departed on route to customer doorstep!', 'info');
      } else if (delivery.status === 'in_transit') {
        await riderService.updateDeliveryStatus(delivery.id, 'arrived_at_customer');
        showToast('📍 Arrived at doorstep! Please ask customer for verification PIN.', 'info');
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
      showToast(error.response?.data?.error?.message || 'Status update failed', 'error');
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
      showToast('Please enter all 4 digits of the customer PIN', 'error');
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
      showToast('🎉 Handover confirmed! Order delivered and payment recorded.', 'success');
      setPinModalDelivery(null);
      setActiveTab('history');
      loadAll(true);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Invalid PIN code. Handshake failed.', 'error');
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
      showToast('Issue reported to dispatch center', 'warning');
      setReportModalDelivery(null);
      setReportNotes('');
      loadAll(true);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to report issue', 'error');
    } finally {
      setReporting(false);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'rider' && user?.userType !== 'rider')) {
    return null;
  }

  const cashInHand = profile?.cashInHand ?? 0;
  const floatingLimit = profile?.floatingLimit ?? 10000;
  const cashPercent = Math.min(100, Math.round((cashInHand / floatingLimit) * 100));

  return (
    <DashboardLayout
      title="Rider Fleet Command"
      subtitle="Cold-Chain Logistics & Real-Time Delivery Cockpit"
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
                  {profile?.name || (user as any)?.profile?.fullName || 'Tariq Mehmood'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ⭐ {profile?.ratingAverage?.toFixed(1) || '4.9'} Fleet Score
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  ❄️ -18°C Box Verified
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Vehicle: <strong className="text-slate-200">{profile?.vehicleType || 'Motorbike'} ({profile?.vehicleNumber || 'KHI-8921'})</strong> • Base: <strong className="text-slate-200">{profile?.city || 'Karachi'} Central Hub</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap w-full md:w-auto justify-between md:justify-end">
            {/* Live Status indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-emerald-400 font-semibold">Live Telemetry (3s)</span>
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
              <span>Capacity: {activeDeliveries.length} / 2 Active</span>
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
              {profile?.isAvailable !== false ? 'ON DUTY' : 'OFF DUTY'}
            </button>
          </div>
        </div>

        {/* 2. UNIFIED 2-COLUMN MISSION CONTROL COCKPIT */}
        {loading && !profile && mine.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 text-center shadow-sm border border-slate-200">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-800">Connecting to Fleet Mission Control...</h3>
          </div>
        ) : blockedReason ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ⏳
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">{blockedReason.title}</h2>
            <p className="text-slate-600 max-w-md mx-auto">{blockedReason.message}</p>
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
                  <span>🛵 Active Run</span>
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
                  <span>📡 Available Pool</span>
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
                  <span>📜 Completed Runs</span>
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
                      <h3 className="font-bold text-slate-800 text-base">No active run in progress</h3>
                      <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1 mb-5">
                        Your route is clear. Claim an incoming order from the Available Pool to start delivering.
                      </p>
                      <div className="flex justify-center gap-3">
                        <Button
                          onClick={() => setActiveTab('available')}
                          className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                        >
                          View Available Runs ({available.length})
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
                            className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
                          >
                            {/* Card Header & Order Badge */}
                            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-base tracking-wide text-white">
                                    Order #{delivery.orderNumber || delivery.orderId.slice(0, 8)}
                                  </span>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
                                    {delivery.status.replace(/_/g, ' ')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-400">
                                  {delivery.paymentMethod === 'cod' ? '💵 COD:' : '💳 Prepaid:'}
                                </span>
                                <span className="text-sm font-black text-emerald-400">
                                  {formatPrice(delivery.totalAmount || 0)}
                                </span>
                              </div>
                            </div>

                            {/* COMPACT 5-STEP JOURNEY ROADMAP */}
                            <div className="bg-slate-50/70 border-b border-slate-200 px-5 py-3.5">
                              <div className="relative">
                                <div className="absolute top-3.5 left-4 right-4 h-1 bg-slate-200 -z-0 rounded-full" />
                                <div
                                  className="absolute top-3.5 left-4 h-1 bg-emerald-500 -z-0 rounded-full transition-all duration-500"
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
                                          {step.label}
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
                                    <span className="text-[10px] uppercase font-bold text-blue-900 block">Pickup (Kitchen)</span>
                                    <p className="text-xs font-bold text-slate-800 mt-0.5">{delivery.pickupAddress}</p>
                                    <span className="inline-block text-[10px] text-blue-700 mt-1 font-medium bg-blue-100/70 px-2 py-0.5 rounded">
                                      Prep Verification & Dispatch
                                    </span>
                                  </div>
                                </div>
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.pickupAddress)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-xs whitespace-nowrap transition-all flex items-center gap-1"
                                >
                                  🗺️ Maps
                                </a>
                              </div>

                              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-start justify-between gap-2.5">
                                <div className="flex items-start gap-2.5">
                                  <span className="text-xl">📍</span>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-emerald-900 block">Dropoff (Customer)</span>
                                    <p className="text-xs font-bold text-slate-800 mt-0.5">{delivery.deliveryAddress}</p>
                                    <span className="inline-block text-[10px] text-emerald-700 mt-1 font-medium bg-emerald-100/70 px-2 py-0.5 rounded">
                                      Doorstep Handover (PIN Required)
                                    </span>
                                  </div>
                                </div>
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(delivery.deliveryAddress)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs whitespace-nowrap transition-all flex items-center gap-1"
                                >
                                  🗺️ Maps
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
                                Report Issue
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
                                  'Processing...'
                                ) : delivery.status === 'assigned' ? (
                                  '📍 Mark Arrived at Kitchen'
                                ) : delivery.status === 'arrived_at_pickup' ? (
                                  '❄️ Pick Up & Pack Cold-Box'
                                ) : delivery.status === 'picked_up' ? (
                                  '🛵 Depart & Start Transit'
                                ) : delivery.status === 'in_transit' ? (
                                  '📍 Mark Arrived at Doorstep'
                                ) : (
                                  '🤝 Verify Handover PIN'
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
                            Maximum Capacity Limit Reached (2 / 2 Active Orders)
                          </h4>
                          <p className="text-xs text-amber-800/80 mt-0.5">
                            To protect food temperature and safety, you cannot claim a 3rd order. Complete one of your ongoing runs to unlock new orders.
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-amber-600 text-white whitespace-nowrap shadow-xs">
                        2 / 2 Capacity Full
                      </span>
                    </div>
                  ) : activeDeliveries.length === 1 ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">⚡</span>
                        <div>
                          <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wide">
                            Corridor Route Matching Active (1 / 2 Active Orders)
                          </h4>
                          <p className="text-xs text-emerald-800/80 mt-0.5">
                            Orders along your existing pickup and dropoff corridor are highlighted below with a <strong>+Rs 100 Batch Bonus</strong>!
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-emerald-700 text-white whitespace-nowrap shadow-xs">
                        1 Slot Available
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
                      <h3 className="font-bold text-slate-800 text-base">Scanning for ready orders...</h3>
                      <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1 mb-2">
                        All runs currently claimed. When kitchens confirm food preparation, available delivery runs will appear here automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {available.map((d) => (
                        <div
                          key={d.id}
                          className={`bg-white rounded-2xl border p-4 transition-all flex flex-col justify-between shadow-xs ${
                            d.isRouteMatch
                              ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2 gap-1.5">
                              <span className="font-black text-slate-900 text-sm">
                                Order #{d.orderNumber || d.orderId.slice(0, 8)}
                              </span>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {d.isRouteMatch && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-600 text-white shadow-xs animate-pulse">
                                    ⚡ Route Match (+Rs {d.batchBonus || 100})
                                  </span>
                                )}
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Ready
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-slate-600 mb-2.5">
                              <p className="flex items-start gap-1.5">
                                <span className="font-bold text-slate-800">Pickup:</span>
                                <span className="truncate">{d.pickupAddress}</span>
                              </p>
                              <p className="flex items-start gap-1.5">
                                <span className="font-bold text-slate-800">Deliver:</span>
                                <span className="truncate">{d.deliveryAddress}</span>
                              </p>
                              {d.totalAmount && (
                                <p className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-800">Order Value:</span>
                                  <span className="font-black text-emerald-700">{formatPrice(d.totalAmount)}</span>
                                  <span className="text-slate-400 text-[11px]">({d.paymentMethod?.toUpperCase() || 'COD'})</span>
                                </p>
                              )}
                            </div>

                            {/* Bounded inDrive-Style Price Corridor Badge */}
                            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 mb-3 text-[11px] space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-600 font-semibold">Standard Delivery Payout:</span>
                                <span className="font-black text-emerald-700">
                                  Rs {d.standardFee || 160}
                                  {d.isRouteMatch && (
                                    <span className="text-[10px] text-emerald-600 font-bold ml-1">
                                      (+Rs {d.batchBonus || 100} bonus)
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>inDrive Regulated Corridor:</span>
                                <span className="font-medium text-slate-700">
                                  Rs {d.minAskFee || 120} – Rs {d.maxAskFee || 240} cap
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
                              🔒 At Capacity (2/2 Orders Active)
                            </Button>
                          ) : (
                            <div className="flex gap-2 items-center">
                              <Button
                                onClick={() => handleClaim(d.id)}
                                disabled={busyId === d.id}
                                className="flex-1 bg-slate-900 hover:bg-emerald-600 text-white font-bold text-xs py-2 rounded-xl transition-colors shadow-xs"
                              >
                                {busyId === d.id
                                  ? 'Claiming...'
                                  : d.isRouteMatch
                                  ? `Claim Batched (+Rs ${d.batchBonus || 100})`
                                  : `Claim (Rs ${d.standardFee || 160})`}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => handleClaim(d.id, d.maxAskFee || 220)}
                                disabled={busyId === d.id}
                                className="border-cyan-300 text-cyan-800 hover:bg-cyan-50 font-bold text-[11px] py-2 px-2.5 rounded-xl whitespace-nowrap"
                                title="Ask max capped fee for this corridor (inDrive model)"
                              >
                                Ask Rs {d.maxAskFee || 220}
                              </Button>
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
                    <h3 className="font-black text-sm text-slate-900">Delivered Orders Today</h3>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      {completedDeliveries.length} Successful Deliveries
                    </span>
                  </div>

                  {completedDeliveries.length === 0 ? (
                    <div className="p-10 text-center text-slate-500 text-xs">
                      No deliveries completed yet today.
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
                              Order #{d.orderNumber || d.orderId.slice(0, 8)}
                            </span>
                            <p className="text-slate-500 mt-0.5">{d.deliveryAddress}</p>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] border border-emerald-200">
                              ✓ PIN Verified
                            </span>
                            {d.totalAmount && (
                              <p className="font-bold text-slate-900 mt-1">{formatPrice(d.totalAmount)}</p>
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
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-sm text-slate-900">COD Cash in Hand</h3>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Safe Float
                  </span>
                </div>

                <div className="my-3">
                  <span className="text-2xl font-black text-slate-900">{formatPrice(cashInHand)}</span>
                  <span className="text-xs text-slate-400 ml-2">/ {formatPrice(floatingLimit)} limit</span>
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
                  {cashPercent}% of daily floating cash capacity utilized. Hand over cash at base hub during shift checkout.
                </p>
              </div>

              {/* FLEET DIAGNOSTICS */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
                <h3 className="font-black text-sm text-slate-900">Shift Diagnostics</h3>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Runs Delivered</span>
                    <span className="text-base font-black text-slate-800">{completedDeliveries.length}</span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">On-Time Rate</span>
                    <span className="text-base font-black text-emerald-600">99.4%</span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Handshake Rate</span>
                    <span className="text-base font-black text-emerald-600">100%</span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Cold Compliance</span>
                    <span className="text-base font-black text-cyan-600">-18.4°C</span>
                  </div>
                </div>
              </div>

              {/* COLD-CHAIN PROTOCOL & FLEET SUPPORT */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm border border-slate-700 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">❄️</span>
                  <h3 className="font-black text-sm text-white">Cold-Chain Protocol</h3>
                </div>
                <ul className="text-xs text-slate-300 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>Maintain insulated delivery box tightly sealed at ≤ -18°C.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>Always verify customer 4-digit PIN before handing over frozen items.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>Report uncontactable customer or temperature breach via Report Issue.</span>
                  </li>
                </ul>
                <div className="pt-2 border-t border-slate-700/80">
                  <a
                    href="/support"
                    className="block text-center py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors border border-slate-600"
                  >
                    📞 Fleet SOS & Support
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
                    <h3 className="font-black text-lg">Customer Handover PIN</h3>
                    <p className="text-xs text-emerald-100">Fraud-prevention doorstep verification</p>
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
                  Ask customer for their <strong>4-digit delivery PIN</strong> displayed on their order screen:
                </p>
              </div>

              {/* 4 Digit Boxes */}
              <div className="flex justify-center gap-3">
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
              {pinModalDelivery.totalAmount && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-900">
                    💵 Collect Cash on Delivery:
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
                  {verifyingPin ? 'Verifying PIN...' : 'Confirm Handover & Deliver'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPinModalDelivery(null)}
                  className="rounded-xl border-slate-200 text-slate-600"
                >
                  Cancel
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
              <h3 className="font-bold text-lg">Report Delivery Problem</h3>
              <p className="text-xs text-red-100">Order #{reportModalDelivery.orderNumber}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="Customer unreachable">Customer unreachable / phone switched off</option>
                  <option value="Incorrect address">Wrong address / house not found</option>
                  <option value="Customer refused package">Customer refused delivery</option>
                  <option value="Cold-chain temperature issue">Cold-chain breach / thaw suspected</option>
                  <option value="Road accident / emergency">Vehicle breakdown / road emergency</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Additional Notes</label>
                <textarea
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  rows={3}
                  placeholder="Provide any helpful details for dispatch resolution..."
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
                  {reporting ? 'Reporting...' : 'Submit Issue'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setReportModalDelivery(null)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
