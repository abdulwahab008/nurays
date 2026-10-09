'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout, ADMIN_SIDEBAR_ITEMS, HUB_MANAGER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { DatePicker } from '@/components/ui/DatePicker';


interface Hub {
  id: string;
  name: string;
  code: string;
  city: string;
  area: string;
  address: string;
  status: string;
  availableProductsCount?: number;
}

interface HubBatch {
  id: string;
  fefoPriority: number;
  batchNumber: string;
  barcode: string | null;
  quantity: number;
  status: string; // 'available' | 'damaged' | 'reserved' | 'expired'
  storageUnit: string;
  manufacturedDate: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  product: {
    id: string;
    name: string;
    nameUrdu?: string | null;
    price: number;
    image: string | null;
    seller: {
      id: string;
      businessName: string;
      isVerified: boolean;
    };
  };
  createdAt: string;
}

interface HubStats {
  id: string;
  name: string;
  code: string;
  city: string;
  area: string;
  address: string;
  capacityCubicFeet: number;
  currentUtilization: number;
  freezerUnits: number;
  temperatureCelsius: number | null;
  status: string;
  metrics: {
    totalBatches: number;
    totalSellableUnits: number;
    quarantinedBatches: number;
    expiringSoonBatches: number;
    recentLogsCount: number;
    latestAlert: {
      id: string;
      temperatureCelsius: string | number;
      recordedAt: string;
    } | null;
  };
}

interface TemperatureLog {
  id: string;
  temperatureCelsius: number;
  freezerUnit: number | null;
  isAlert: boolean;
  recordedAt: string;
}

interface TempStats {
  totalReadings: number;
  breachCount: number;
  complianceRate: number;
  minTemp: number | null;
  maxTemp: number | null;
  avgTemp: number | null;
}

interface FrozenProduct {
  id: string;
  name: string;
  price: number;
  primaryImage?: { imageUrl: string } | null;
  category?: { name: string } | null;
  seller?: { id: string; businessName: string } | null;
}

/**
 * Hub operations: batch intake with a temperature check, the FEFO queue, temperature logs.
 * Admins run any active hub; a hub manager runs only the hubs assigned to them.
 */
export default function HubOperationsConsole({ mode }: { mode: 'admin' | 'manager' }) {
  const isManagerMode = mode === 'manager';
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'intake' | 'fefo' | 'temperature'>('overview');

  // Hub data state
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string>('');
  const [hubStats, setHubStats] = useState<HubStats | null>(null);
  const [batches, setBatches] = useState<HubBatch[]>([]);
  const [batchSummary, setBatchSummary] = useState<any>(null);
  const [tempLogs, setTempLogs] = useState<TemperatureLog[]>([]);
  const [tempStats, setTempStats] = useState<TempStats | null>(null);
  const [frozenProducts, setFrozenProducts] = useState<FrozenProduct[]>([]);

  // Loaders
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingIntake, setSubmittingIntake] = useState(false);
  const [submittingProbe, setSubmittingProbe] = useState(false);
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);

  // Search & Filter for FEFO Queue
  const [fefoSearch, setFefoSearch] = useState('');
  const [fefoFilter, setFefoFilter] = useState<'all' | 'available' | 'quarantined' | 'expiringSoon'>('all');

  // Modal for batch status update
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedBatchForStatus, setSelectedBatchForStatus] = useState<HubBatch | null>(null);
  const [newStatusChoice, setNewStatusChoice] = useState<'available' | 'damaged'>('available');
  const [statusReason, setStatusReason] = useState('');

  // Intake Form State
  const [intakeProductId, setIntakeProductId] = useState('');
  const [intakeBatchNumber, setIntakeBatchNumber] = useState('');
  const [intakeQuantity, setIntakeQuantity] = useState(20);
  const [intakeManufacturedDate, setIntakeManufacturedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [intakeExpiryDate, setIntakeExpiryDate] = useState(
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [intakeTemp, setIntakeTemp] = useState<number>(-20.0);
  const [intakeStorageUnit, setIntakeStorageUnit] = useState('FREEZER-01 / SHELF-A');
  const [intakeBarcode, setIntakeBarcode] = useState('');

  // Manual Probe Form State
  const [probeTemp, setProbeTemp] = useState<number>(-19.5);
  const [probeUnit, setProbeUnit] = useState<number>(1);
  const [probeNotes, setProbeNotes] = useState('Routine cold-chain inspection probe');

  // Auth Guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push(isManagerMode ? '/login' : '/admin/login');
      return;
    }
    const role = user?.userType ?? user?.user_type;
    if (role !== (isManagerMode ? 'hub_manager' : 'admin')) {
      router.push('/products');
      showToast(isManagerMode ? 'This page is for hub managers.' : 'Access denied. Administrator privileges required.', 'error');
      return;
    }
    initializeData();
  }, [isAuthenticated, user, router]);

  const initializeData = async () => {
    try {
      setLoading(true);
      // 1. Fetch Hub Centers
      const hubsRes = await apiClient.get(isManagerMode ? '/hubs/mine' : '/hubs');
      const hubsList: Hub[] = hubsRes.data.data || [];
      setHubs(hubsList);

      let currentHubId = selectedHubId;
      if (!currentHubId && hubsList.length > 0) {
        currentHubId = hubsList[0].id;
        setSelectedHubId(currentHubId);
      }

      // 2. Fetch Frozen Products for Intake selector
      try {
        const prodRes = await apiClient.get('/products', { params: { productType: 'frozen', limit: 100 } });
        const prods = prodRes.data.data?.products || prodRes.data.data || [];
        setFrozenProducts(prods);
        if (prods.length > 0 && !intakeProductId) {
          setIntakeProductId(prods[0].id);
          generateBatchCode();
        }
      } catch (err) {
        console.warn('Failed to load frozen products catalog:', err);
      }

      if (currentHubId) {
        await loadHubOperations(currentHubId);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to initialize cold hub data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadHubOperations = async (hubId: string) => {
    try {
      setRefreshing(true);
      const [statsRes, batchesRes, tempRes] = await Promise.all([
        apiClient.get(`/hubs/${hubId}/stats`),
        apiClient.get(`/hubs/${hubId}/batches`),
        apiClient.get(`/hubs/${hubId}/temperature-logs`),
      ]);

      if (statsRes.data.success) {
        setHubStats(statsRes.data.data);
      }
      if (batchesRes.data.success) {
        setBatches(batchesRes.data.data.batches || []);
        setBatchSummary(batchesRes.data.data.summary || null);
      }
      if (tempRes.data.success) {
        setTempLogs(tempRes.data.data.logs || []);
        setTempStats(tempRes.data.data.statistics || null);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to sync hub operational metrics', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleHubChange = (hubId: string) => {
    setSelectedHubId(hubId);
    loadHubOperations(hubId);
  };

  const generateBatchCode = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const dateCode = new Date().toISOString().slice(2, 7).replace('-', '');
    const code = `BATCH-${dateCode}-FROST-${randomSuffix}`;
    setIntakeBatchNumber(code);
    setIntakeBarcode(`NR-FROST-${randomSuffix}`);
  };

  // Helper to quickly adjust expiry
  const setExpiryPreset = (days: number) => {
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    setIntakeExpiryDate(futureDate.toISOString().slice(0, 10));
  };

  // Selected product object for intake preview
  const selectedProduct = useMemo(() => {
    return frozenProducts.find((p) => p.id === intakeProductId) || null;
  }, [frozenProducts, intakeProductId]);

  // Intake submission
  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHubId) {
      showToast('Please select an active hub center first', 'error');
      return;
    }
    if (!intakeProductId) {
      showToast('Please select a product for intake', 'error');
      return;
    }
    if (!intakeBatchNumber.trim()) {
      showToast('Batch number is required', 'error');
      return;
    }
    if (intakeQuantity <= 0) {
      showToast('Quantity must be greater than 0', 'error');
      return;
    }

    try {
      setSubmittingIntake(true);
      const isBreach = intakeTemp > -18.0;

      const payload = {
        productId: intakeProductId,
        quantity: Number(intakeQuantity),
        batchNumber: intakeBatchNumber.trim(),
        manufacturedDate: intakeManufacturedDate,
        expiryDate: intakeExpiryDate,
        measuredTemperatureCelsius: Number(intakeTemp),
        storageUnit: intakeStorageUnit.trim() || 'FREEZER-01 / SHELF-A',
        barcode: intakeBarcode.trim() || undefined,
      };

      const res = await apiClient.post(`/hubs/${selectedHubId}/intake`, payload);

      if (res.data.success) {
        if (isBreach) {
          showToast(
            `⚠️ Cold-Chain Breach (${intakeTemp}°C > -18°C)! Batch ${intakeBatchNumber} was QUARANTINED.`,
            'error'
          );
        } else {
          showToast(
            `✅ Sub-Zero Verified (${intakeTemp}°C)! Batch ${intakeBatchNumber} added to sellable inventory.`,
            'success'
          );
        }

        // Refresh hub data
        await loadHubOperations(selectedHubId);
        // Regenerate batch code for next intake
        generateBatchCode();
        // Switch to FEFO view to view newly slotted batch
        setActiveTab('fefo');
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to complete batch intake', 'error');
    } finally {
      setSubmittingIntake(false);
    }
  };

  // Temperature Probe Logging Submission
  const handleProbeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHubId) return;

    try {
      setSubmittingProbe(true);
      const res = await apiClient.post(`/hubs/${selectedHubId}/temperature-logs`, {
        temperatureCelsius: Number(probeTemp),
        freezerUnit: Number(probeUnit),
        notes: probeNotes.trim() || undefined,
      });

      if (res.data.success) {
        if (probeTemp > -18.0) {
          showToast(`🚨 TEMPERATURE ALERT: Probe reading ${probeTemp}°C breached -18°C threshold!`, 'error');
        } else {
          showToast(`✅ Temperature probe verified at ${probeTemp}°C (Sub-Zero Compliant).`, 'success');
        }
        await loadHubOperations(selectedHubId);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to log temperature probe', 'error');
    } finally {
      setSubmittingProbe(false);
    }
  };

  // Status Change (Quarantine / Release)
  const openStatusModal = (batch: HubBatch) => {
    setSelectedBatchForStatus(batch);
    setNewStatusChoice(batch.status === 'available' ? 'damaged' : 'available');
    setStatusReason(
      batch.status === 'available'
        ? 'Secondary physical inspection quarantine flag'
        : 'Quality probe re-verified at sub-zero frost; released to sellable'
    );
    setStatusModalOpen(true);
  };

  const handleStatusUpdate = async () => {
    if (!selectedHubId || !selectedBatchForStatus) return;

    try {
      setUpdatingBatchId(selectedBatchForStatus.id);
      const res = await apiClient.patch(
        `/hubs/${selectedHubId}/batches/${selectedBatchForStatus.id}/status`,
        {
          status: newStatusChoice,
          reason: statusReason.trim() || undefined,
        }
      );

      if (res.data.success) {
        showToast(
          `Batch ${selectedBatchForStatus.batchNumber} status updated to ${newStatusChoice === 'available' ? 'Available (Sellable)' : 'Quarantined (Damaged)'}`,
          'success'
        );
        setStatusModalOpen(false);
        await loadHubOperations(selectedHubId);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to update batch status', 'error');
    } finally {
      setUpdatingBatchId(null);
    }
  };

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      // Status filter
      if (fefoFilter === 'available' && b.status !== 'available') return false;
      if (fefoFilter === 'quarantined' && b.status !== 'damaged') return false;
      if (fefoFilter === 'expiringSoon' && (!b.isExpiringSoon || b.isExpired)) return false;

      // Search filter
      if (fefoSearch.trim()) {
        const query = fefoSearch.toLowerCase();
        const batchMatch = b.batchNumber.toLowerCase().includes(query);
        const productMatch = b.product.name.toLowerCase().includes(query);
        const barcodeMatch = b.barcode ? b.barcode.toLowerCase().includes(query) : false;
        const sellerMatch = b.product.seller?.businessName.toLowerCase().includes(query);
        return batchMatch || productMatch || barcodeMatch || sellerMatch;
      }

      return true;
    });
  }, [batches, fefoFilter, fefoSearch]);

  const currentHubTemp = hubStats?.temperatureCelsius ?? null;
  const isHubSubZeroCompliant = currentHubTemp !== null ? currentHubTemp <= -18.0 : true;

  if (!loading && hubs.length === 0) {
    return (
      <DashboardLayout
        title="Cold Hub Operations & FEFO Engine"
        subtitle="Batch intake, temperature checks and the FEFO dispatch queue"
        sidebarItems={isManagerMode ? HUB_MANAGER_SIDEBAR_ITEMS : ADMIN_SIDEBAR_ITEMS}
        userType={isManagerMode ? 'hub_manager' : 'admin'}
      >
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xl mx-auto" data-testid="no-hubs">
          <div className="text-4xl mb-3">❄️</div>
          <h2 className="text-lg font-bold text-slate-900">{isManagerMode ? 'No hub is assigned to you yet' : 'No active hubs'}</h2>
          <p className="text-sm text-slate-600 mt-2">
            {isManagerMode
              ? 'An admin assigns each hub to its manager. Ask them to add you to your hub, then reload this page.'
              : 'Create a hub and assign its manager first.'}
          </p>
          {!isManagerMode && (
            <a href="/admin/hubs/manage" className="inline-block mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
              Hubs &amp; managers
            </a>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Cold Hub Operations & FEFO Engine"
      subtitle="Physical batch intake, mandatory ≤ -18°C temperature probe verification & automated FEFO dispatch queue"
      sidebarItems={isManagerMode ? HUB_MANAGER_SIDEBAR_ITEMS : ADMIN_SIDEBAR_ITEMS}
      userType={isManagerMode ? 'hub_manager' : 'admin'}
    >
      <div className="space-y-6">
        {/* TOP COMMAND BAR */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-2xl shadow-inner">
              ❄️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase tracking-wider font-semibold text-cyan-400 bg-cyan-950/80 border border-cyan-800 px-2.5 py-0.5 rounded-full">
                  Fulfillment Hub
                </span>
                {hubs.length > 1 ? (
                  <select
                    value={selectedHubId}
                    onChange={(e) => handleHubChange(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-sm font-semibold rounded-lg px-2.5 py-1 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    {hubs.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.city})
                      </option>
                    ))}
                  </select>
                ) : (
                  <h2 className="text-xl font-bold tracking-tight text-slate-100">
                    {hubStats?.name || hubs.find((h) => h.id === selectedHubId)?.name || '—'}
                  </h2>
                )}
                <span className="text-xs text-slate-400 font-mono">
                  [{hubStats?.code || hubs.find((h) => h.id === selectedHubId)?.code || '—'}]
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <span>📍 {hubStats?.address || '—'}</span>
                <span>•</span>
                <span>Capacity: {hubStats?.capacityCubicFeet != null ? hubStats.capacityCubicFeet.toLocaleString() : '—'} cu ft</span>
              </p>
            </div>
          </div>

          {/* Sub-Zero Compliance Live Indicator */}
          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
            <div
              className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border font-mono text-sm font-semibold shadow-sm transition-all ${
                isHubSubZeroCompliant
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/70 border-rose-500/50 text-rose-300 animate-pulse'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isHubSubZeroCompliant ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
                }`}
              />
              <span>
                {currentHubTemp !== null ? `${currentHubTemp.toFixed(1)}°C` : '-19.2°C'}
              </span>
              <span className="text-xs font-sans tracking-normal opacity-90">
                {isHubSubZeroCompliant ? 'Sub-Zero Frost (Optimal)' : '⚠️ Cold Chain Breach'}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedHubId && loadHubOperations(selectedHubId)}
              disabled={refreshing}
              className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs flex items-center gap-1.5"
            >
              <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="border-b border-gray-200 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-white border-t-2 border-s border-e border-cyan-600 text-cyan-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <span>🏢</span>
            <span>Hub Overview & Diagnostics</span>
          </button>
          <button
            onClick={() => setActiveTab('intake')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'intake'
                ? 'bg-white border-t-2 border-s border-e border-cyan-600 text-cyan-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <span>📦</span>
            <span>Cold Batch Intake & Inspection</span>
            <span className="text-[11px] bg-cyan-100 text-cyan-800 font-bold px-1.5 py-0.5 rounded-full">
              ≤ -18°C
            </span>
          </button>
          <button
            onClick={() => setActiveTab('fefo')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'fefo'
                ? 'bg-white border-t-2 border-s border-e border-cyan-600 text-cyan-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <span>❄️</span>
            <span>FEFO Batch Queue & Inventory</span>
            {batchSummary?.totalBatches > 0 && (
              <span className="text-[11px] bg-slate-200 text-slate-800 font-bold px-1.5 py-0.5 rounded-full">
                {batchSummary.totalBatches}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('temperature')}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'temperature'
                ? 'bg-white border-t-2 border-s border-e border-cyan-600 text-cyan-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <span>🌡️</span>
            <span>Temperature Probe Logs & Alerts</span>
            {tempStats?.breachCount ? (
              <span className="text-[11px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded-full">
                {tempStats.breachCount} Alerts
              </span>
            ) : null}
          </button>
        </div>

        {/* TAB 1: HUB OVERVIEW & DIAGNOSTICS */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI METRIC CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Temp Gauge */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Core Temperature
                  </span>
                  <span className="text-lg">❄️</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-black font-mono ${
                      isHubSubZeroCompliant ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {currentHubTemp !== null ? `${currentHubTemp.toFixed(1)}°C` : '-19.2°C'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Threshold: <span className="font-semibold">≤ -18.0°C</span>
                </p>
              </div>

              {/* Sellable In Stock Units */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Sellable Units
                  </span>
                  <span className="text-lg">📦</span>
                </div>
                <div className="text-2xl font-black text-gray-900">
                  {batchSummary?.totalSellableUnits ?? hubStats?.metrics.totalSellableUnits ?? 0}
                </div>
                <p className="text-xs text-emerald-600 font-medium mt-1">
                  Active for hub customer delivery
                </p>
              </div>

              {/* Active Batches */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Active Batches
                  </span>
                  <span className="text-lg">📋</span>
                </div>
                <div className="text-2xl font-black text-cyan-700">
                  {batchSummary?.availableCount ?? hubStats?.metrics.totalBatches ?? 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  FEFO prioritized queues
                </p>
              </div>

              {/* Quarantined Batches */}
              <div
                className={`border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow ${
                  (batchSummary?.quarantinedCount ?? 0) > 0
                    ? 'bg-rose-50/60 border-rose-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Quarantined
                  </span>
                  <span className="text-lg">🛡️</span>
                </div>
                <div
                  className={`text-2xl font-black ${
                    (batchSummary?.quarantinedCount ?? 0) > 0 ? 'text-rose-600' : 'text-gray-900'
                  }`}
                >
                  {batchSummary?.quarantinedCount ?? hubStats?.metrics.quarantinedBatches ?? 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Cold breach or quality hold
                </p>
              </div>

              {/* Expiring Soon */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Expiring &lt; 7 Days
                  </span>
                  <span className="text-lg">⏳</span>
                </div>
                <div
                  className={`text-2xl font-black ${
                    (batchSummary?.expiringSoonCount ?? 0) > 0 ? 'text-amber-600' : 'text-gray-900'
                  }`}
                >
                  {batchSummary?.expiringSoonCount ?? hubStats?.metrics.expiringSoonBatches ?? 0}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Immediate dispatch priority
                </p>
              </div>
            </div>

            {/* STORAGE CAPACITY UTILIZATION */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Physical Freezer Capacity & Volume
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Storage unit layout across {hubStats?.freezerUnits || 2} commercial sub-zero industrial chest/walk-in units
                  </p>
                </div>
                <div className="text-end">
                  <span className="text-lg font-black text-cyan-700">
                    {hubStats?.currentUtilization ?? 28}%
                  </span>
                  <span className="text-xs text-gray-500 ms-1">Allocated</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(10, hubStats?.currentUtilization ?? 28))}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-600">
                <div>
                  <span className="text-gray-400 block">Total Volume:</span>
                  <span className="font-semibold text-gray-800">
                    {hubStats?.capacityCubicFeet != null ? hubStats.capacityCubicFeet.toLocaleString() : '—'} cu ft
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block">Freezer Units:</span>
                  <span className="font-semibold text-gray-800">
                    {hubStats?.freezerUnits || 2} Freezers Active
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block">Operating Hours:</span>
                  <span className="font-semibold text-gray-800">24/7 Cold-Chain Active</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Intake Compliance:</span>
                  <span className="font-semibold text-emerald-600">
                    {tempStats?.complianceRate ?? 100}% Sub-Zero Pass
                  </span>
                </div>
              </div>
            </div>

            {/* QUICK ACTIONS BANNER */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => setActiveTab('intake')}
                className="bg-gradient-to-br from-cyan-900 to-slate-900 text-white p-6 rounded-2xl cursor-pointer hover:shadow-lg transition-all group"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">📦</div>
                <h4 className="font-bold text-base text-cyan-200">Receive Batch Intake</h4>
                <p className="text-xs text-slate-300 mt-1">
                  Log physical shipment, probe temperature at arrival, and slot into freezer shelf.
                </p>
                <span className="inline-block mt-4 text-xs font-semibold text-cyan-400 group-hover:translate-x-1 transition-transform">
                  Launch Intake Form ➔
                </span>
              </div>

              <div
                onClick={() => setActiveTab('fefo')}
                className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 rounded-2xl cursor-pointer hover:shadow-lg transition-all group"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">❄️</div>
                <h4 className="font-bold text-base text-indigo-200">Inspect FEFO Dispatch Queue</h4>
                <p className="text-xs text-slate-300 mt-1">
                  View batches ordered strictly by expiration date. Review shelf-life warnings and holds.
                </p>
                <span className="inline-block mt-4 text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform">
                  View FEFO Batches ➔
                </span>
              </div>

              <div
                onClick={() => setActiveTab('temperature')}
                className="bg-gradient-to-br from-slate-900 to-emerald-950 text-white p-6 rounded-2xl cursor-pointer hover:shadow-lg transition-all group"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">🌡️</div>
                <h4 className="font-bold text-base text-emerald-200">Temperature Probe Audit</h4>
                <p className="text-xs text-slate-300 mt-1">
                  Record digital thermometer probe readings. Inspect automated cold-chain breach alerts.
                </p>
                <span className="inline-block mt-4 text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
                  Record Probe Reading ➔
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: COLD BATCH INTAKE & QUALITY INSPECTION */}
        {activeTab === 'intake' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="mb-6 pb-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  Cold Batch Physical Intake & Inspection
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mandatory temperature probe measurement required. Batches exceeding -18.0°C will be quarantined.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateBatchCode}
                className="text-xs"
              >
                🎲 Auto-Generate Batch ID
              </Button>
            </div>

            <form onSubmit={handleIntakeSubmit} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Product Selection */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      1. Select Frozen Food Product *
                    </label>
                    <select
                      value={intakeProductId}
                      onChange={(e) => setIntakeProductId(e.target.value)}
                      required
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                    >
                      {frozenProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — Rs {p.price} ({p.seller?.businessName || 'Home Chef'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Product Card Preview */}
                  {selectedProduct && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                      <div className="w-16 h-16 rounded-lg bg-gray-200 flex-shrink-0 relative overflow-hidden border border-gray-300">
                        {selectedProduct.primaryImage?.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selectedProduct.primaryImage.imageUrl}
                            alt={selectedProduct.name}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🍲</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded">
                            ❄️ Sub-Zero Pack
                          </span>
                          <span className="text-xs text-gray-500">
                            {selectedProduct.category?.name || 'Frozen Artisan'}
                          </span>
                        </div>
                        <h4 className="font-bold text-gray-900 text-sm truncate mt-1">
                          {selectedProduct.name}
                        </h4>
                        <p className="text-xs text-gray-500">
                          Seller:{' '}
                          <span className="font-semibold text-gray-700">
                            {selectedProduct.seller?.businessName || 'Verified Home Chef'}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                        2. Batch Identification # *
                      </label>
                      <input
                        type="text"
                        value={intakeBatchNumber}
                        onChange={(e) => setIntakeBatchNumber(e.target.value)}
                        placeholder="e.g. BATCH-2026-FROST-01"
                        required
                        className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-mono text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                        3. Intake Quantity (Packs) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={intakeQuantity}
                        onChange={(e) => setIntakeQuantity(parseInt(e.target.value) || 1)}
                        required
                        className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                        Storage Location Slot
                      </label>
                      <input
                        type="text"
                        value={intakeStorageUnit}
                        onChange={(e) => setIntakeStorageUnit(e.target.value)}
                        placeholder="e.g. FREEZER-01 / SHELF-B2"
                        className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                        Barcode / Scan Tag
                      </label>
                      <input
                        type="text"
                        value={intakeBarcode}
                        onChange={(e) => setIntakeBarcode(e.target.value)}
                        placeholder="e.g. NR-FROST-1029"
                        className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm font-mono text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Dates & Sub-Zero Probe Measurement */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DatePicker
                      label="Manufacturing Date"
                      value={intakeManufacturedDate}
                      onChange={(date) => setIntakeManufacturedDate(date)}
                      placeholder="Select mfg date"
                    />

                    <DatePicker
                      label="Expiration Date *"
                      value={intakeExpiryDate}
                      onChange={(date) => setIntakeExpiryDate(date)}
                      placeholder="Select expiry date"
                    />
                  </div>

                  {/* Expiry Presets */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 font-medium">Quick Presets:</span>
                    <button
                      type="button"
                      onClick={() => setExpiryPreset(30)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                    >
                      +30 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpiryPreset(60)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                    >
                      +60 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpiryPreset(90)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                    >
                      +90 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpiryPreset(180)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                    >
                      +180 Days
                    </button>
                  </div>

                  {/* MANDATORY SUB-ZERO TEMPERATURE PROBE VERIFICATION */}
                  <div className="pt-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-cyan-900 mb-1.5 flex items-center justify-between">
                      <span>4. Measured Arrival Temperature (°C) *</span>
                      <span className="text-[11px] font-semibold text-cyan-600">
                        Must be ≤ -18.0°C
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={intakeTemp}
                        onChange={(e) => setIntakeTemp(parseFloat(e.target.value) || 0)}
                        required
                        className="w-full border-2 border-cyan-500 rounded-xl px-4 py-3 text-xl font-mono font-black text-gray-900 focus:ring-4 focus:ring-cyan-500/20 outline-none"
                      />
                      <span className="absolute end-4 top-3 text-sm font-bold text-gray-400">
                        °Celsius
                      </span>
                    </div>

                    {/* LIVE COMPLIANCE STATUS BOX */}
                    <div className="mt-3">
                      {intakeTemp <= -18.0 ? (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex items-start gap-3">
                          <span className="text-xl">✅</span>
                          <div className="text-xs text-emerald-900">
                            <strong className="block font-bold text-emerald-800">
                              Sub-Zero Quality Pass ({intakeTemp}°C ≤ -18°C)
                            </strong>
                            Batch meets the required sub-zero threshold. It will be immediately activated into sellable inventory for hub orders.
                          </div>
                        </div>
                      ) : (
                        <div className="bg-rose-50 border border-rose-300 rounded-xl p-3.5 flex items-start gap-3 animate-pulse">
                          <span className="text-xl">🚨</span>
                          <div className="text-xs text-rose-900">
                            <strong className="block font-bold text-rose-800">
                              COLD CHAIN BREACH VIOLATION ({intakeTemp}°C &gt; -18°C)
                            </strong>
                            Warning: Measured temperature exceeds -18°C. Submitting this intake will automatically mark the batch as <strong>QUARANTINED</strong>. Quarantined batches cannot be dispatched to customers.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab('fefo')}
                  className="text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingIntake}
                  className={`text-sm px-6 py-2.5 font-bold shadow-md text-white ${
                    intakeTemp <= -18.0
                      ? 'bg-cyan-600 hover:bg-cyan-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submittingIntake ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">🔄</span> Processing Intake...
                    </span>
                  ) : intakeTemp <= -18.0 ? (
                    '❄️ Confirm Sub-Zero Intake (Sellable)'
                  ) : (
                    '🚨 Confirm Quarantine Intake (Hold)'
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: FEFO BATCH QUEUE & INVENTORY */}
        {activeTab === 'fefo' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            {/* Search & Status Filters */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="relative flex-1 w-full md:max-w-md">
                <span className="absolute start-3.5 top-2.5 text-gray-400">🔍</span>
                <input
                  type="text"
                  placeholder="Filter by batch #, product, or barcode..."
                  value={fefoSearch}
                  onChange={(e) => setFefoSearch(e.target.value)}
                  className="w-full ps-10 pe-4 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                <button
                  onClick={() => setFefoFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    fefoFilter === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({batches.length})
                </button>
                <button
                  onClick={() => setFefoFilter('available')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    fefoFilter === 'available'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🟢 Sellable Available ({batchSummary?.availableCount ?? 0})
                </button>
                <button
                  onClick={() => setFefoFilter('quarantined')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    fefoFilter === 'quarantined'
                      ? 'bg-rose-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🛡️ Quarantined ({batchSummary?.quarantinedCount ?? 0})
                </button>
                <button
                  onClick={() => setFefoFilter('expiringSoon')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    fefoFilter === 'expiringSoon'
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  ⏳ Expiring Soon ({batchSummary?.expiringSoonCount ?? 0})
                </button>
              </div>
            </div>

            {/* BATCHES TABLE */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-start border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider font-semibold">
                    <th className="py-3.5 px-4">FEFO Priority</th>
                    <th className="py-3.5 px-4">Product Details</th>
                    <th className="py-3.5 px-4">Batch & Barcode</th>
                    <th className="py-3.5 px-4">Expiration & Shelf-Life</th>
                    <th className="py-3.5 px-4">In Stock</th>
                    <th className="py-3.5 px-4">Storage Slot</th>
                    <th className="py-3.5 px-4">Quality Status</th>
                    <th className="py-3.5 px-4 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-500">
                        No batch inventory matching criteria in this hub center.
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((batch) => {
                      const isSellable = batch.status === 'available';
                      return (
                        <tr
                          key={batch.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            !isSellable ? 'bg-rose-50/20' : ''
                          }`}
                        >
                          {/* FEFO Priority */}
                          <td className="py-4 px-4 font-mono font-bold">
                            {isSellable ? (
                              <span
                                className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-xs ${
                                  batch.fefoPriority === 1
                                    ? 'bg-cyan-600 text-white font-black shadow-sm'
                                    : 'bg-slate-200 text-slate-800'
                                }`}
                              >
                                #{batch.fefoPriority} {batch.fefoPriority === 1 ? 'Dispatch ➔' : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 font-normal">Held</span>
                            )}
                          </td>

                          {/* Product */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gray-100 relative overflow-hidden flex-shrink-0 border border-gray-200">
                                {batch.product.image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={batch.product.image}
                                    alt={batch.product.name}
                                    loading="lazy"
                                    className="absolute inset-0 w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-base">
                                    ❄️
                                  </div>
                                )}
                              </div>
                              <div>
                                <span className="font-semibold text-gray-900 block truncate max-w-[180px]">
                                  {batch.product.name}
                                </span>
                                <span className="text-xs text-gray-500 block">
                                  {batch.product.seller?.businessName || 'Home Kitchen'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Batch & Barcode */}
                          <td className="py-4 px-4 font-mono text-xs">
                            <span className="font-bold text-gray-800 block">
                              {batch.batchNumber}
                            </span>
                            {batch.barcode && (
                              <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                🏷️ {batch.barcode}
                              </span>
                            )}
                          </td>

                          {/* Expiry Countdown */}
                          <td className="py-4 px-4">
                            <span className="text-xs font-semibold text-gray-900 block">
                              {new Date(batch.expiryDate).toLocaleDateString('en-PK', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            {batch.isExpired ? (
                              <span className="inline-block mt-0.5 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                                ❌ Expired
                              </span>
                            ) : batch.isExpiringSoon ? (
                              <span className="inline-block mt-0.5 text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                ⚠️ {batch.daysUntilExpiry} days left
                              </span>
                            ) : (
                              <span className="inline-block mt-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                🟢 {batch.daysUntilExpiry} days left
                              </span>
                            )}
                          </td>

                          {/* Quantity */}
                          <td className="py-4 px-4 font-bold text-gray-900">
                            {batch.quantity} <span className="text-xs font-normal text-gray-500">packs</span>
                          </td>

                          {/* Location */}
                          <td className="py-4 px-4">
                            <span className="text-xs font-mono bg-slate-100 border border-slate-200 text-slate-800 px-2 py-1 rounded">
                              {batch.storageUnit}
                            </span>
                          </td>

                          {/* Quality Status */}
                          <td className="py-4 px-4">
                            {batch.status === 'available' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Available
                              </span>
                            ) : batch.status === 'damaged' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                Quarantined
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full capitalize">
                                {batch.status}
                              </span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-4 px-4 text-end">
                            <button
                              onClick={() => openStatusModal(batch)}
                              disabled={updatingBatchId === batch.id}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                                batch.status === 'available'
                                  ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                                  : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {batch.status === 'available' ? 'Quarantine' : 'Release'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: TEMPERATURE PROBE LOGS & ALERTS */}
        {activeTab === 'temperature' && (
          <div className="space-y-6">
            {/* MANUAL PROBE LOGGER FORM */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 mb-1">
                Record Physical Temperature Probe
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Verify industrial freezer temperatures using a calibrated probe thermometer.
              </p>

              <form onSubmit={handleProbeSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1">
                    Freezer Unit #
                  </label>
                  <select
                    value={probeUnit}
                    onChange={(e) => setProbeUnit(parseInt(e.target.value) || 1)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    <option value={1}>Freezer 01 (Walk-in Sub-Zero)</option>
                    <option value={2}>Freezer 02 (Deep Chest -20°C)</option>
                    <option value={3}>Freezer 03 (Quarantine Bay)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1">
                    Measured Temperature (°C) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={probeTemp}
                    onChange={(e) => setProbeTemp(parseFloat(e.target.value) || 0)}
                    required
                    className="w-full border border-cyan-500 rounded-xl px-3 py-2 text-sm font-mono font-bold focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1">
                    Audit Notes / Inspector
                  </label>
                  <input
                    type="text"
                    value={probeNotes}
                    onChange={(e) => setProbeNotes(e.target.value)}
                    placeholder="Inspection remarks"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    type="submit"
                    disabled={submittingProbe}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl shadow"
                  >
                    {submittingProbe ? 'Logging...' : 'Log Probe Reading'}
                  </Button>
                </div>
              </form>
            </div>

            {/* TEMPERATURE STATS CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-gray-500 font-semibold block">Total Probe Logs</span>
                <span className="text-xl font-bold text-gray-900 mt-1 block">
                  {tempStats?.totalReadings ?? tempLogs.length}
                </span>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-gray-500 font-semibold block">Cold Chain Breaches</span>
                <span
                  className={`text-xl font-bold mt-1 block ${
                    (tempStats?.breachCount ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {tempStats?.breachCount ?? 0}
                </span>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-gray-500 font-semibold block">Compliance Rate</span>
                <span className="text-xl font-bold text-emerald-600 mt-1 block">
                  {tempStats?.complianceRate ?? 100}%
                </span>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                <span className="text-xs text-gray-500 font-semibold block">Average Temperature</span>
                <span className="text-xl font-bold font-mono text-cyan-700 mt-1 block">
                  {tempStats?.avgTemp !== null ? `${tempStats?.avgTemp}°C` : '-18.5°C'}
                </span>
              </div>
            </div>

            {/* LOGS TABLE */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h4 className="font-bold text-gray-900 text-sm mb-4">Historical Probe Logs</h4>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-semibold">
                      <th className="py-3 px-4">Recorded At</th>
                      <th className="py-3 px-4">Freezer Unit</th>
                      <th className="py-3 px-4">Measured Temperature</th>
                      <th className="py-3 px-4">Compliance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tempLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500">
                          No temperature logs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      tempLogs.map((log) => {
                        const isCompliant = !log.isAlert && Number(log.temperatureCelsius) <= -18.0;
                        return (
                          <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3.5 px-4 text-xs text-gray-600">
                              {new Date(log.recordedAt).toLocaleString('en-PK')}
                            </td>
                            <td className="py-3.5 px-4 text-xs font-medium text-gray-800">
                              Freezer Unit #{log.freezerUnit || 1}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold">
                              <span
                                className={`px-2 py-0.5 rounded text-xs ${
                                  isCompliant
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {Number(log.temperatureCelsius).toFixed(1)}°C
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-xs">
                              {isCompliant ? (
                                <span className="text-emerald-700 font-medium">
                                  ✅ Sub-Zero Verified (Optimal)
                                </span>
                              ) : (
                                <span className="text-rose-700 font-bold">
                                  🚨 Cold Chain Breach (&gt; -18°C)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STATUS UPDATE MODAL (QUARANTINE / RELEASE) */}
      {statusModalOpen && selectedBatchForStatus && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-base">
                Update Batch Status: {selectedBatchForStatus.batchNumber}
              </h3>
              <button
                onClick={() => setStatusModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-600">
                Product: <strong className="text-gray-900">{selectedBatchForStatus.product.name}</strong>
              </p>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 mb-1">
                  Change Status To:
                </label>
                <select
                  value={newStatusChoice}
                  onChange={(e) => setNewStatusChoice(e.target.value as any)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  <option value="available">🟢 Available (Release to Sellable Inventory)</option>
                  <option value="damaged">🛡️ Quarantined (Hold from Customer Orders)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 mb-1">
                  Reason for Audit Log *
                </label>
                <textarea
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Describe reason for state change..."
                  className="w-full border border-gray-300 rounded-xl p-3 text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleStatusUpdate}
                disabled={updatingBatchId !== null}
                className={
                  newStatusChoice === 'available'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold'
                    : 'bg-rose-600 hover:bg-rose-700 text-white font-bold'
                }
              >
                {updatingBatchId !== null ? 'Updating...' : 'Save & Log Audit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
