'use client';

/**
 * Hub operations: batch intake with a temperature check, the FEFO queue, temperature logs.
 * Admins run any active hub; a hub manager runs only the hubs assigned to them.
 * Each tab is in ./console/; the rules (the -18°C line, the queue filter) are in lib/hub-console.ts.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { DashboardLayout, ADMIN_SIDEBAR_ITEMS, HUB_MANAGER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { loginUrlHere } from '@/lib/auth-redirect';
import type { BatchSummary, ConsoleTab, FrozenProduct, Hub, HubBatch, HubStats, TemperatureLog, TempStats } from '@/lib/hub-console';
import CommandBar from './console/CommandBar';
import OverviewTab from './console/OverviewTab';
import IntakeTab from './console/IntakeTab';
import FefoTab from './console/FefoTab';
import TemperatureTab from './console/TemperatureTab';
import BatchStatusModal from './console/BatchStatusModal';

export default function HubOperationsConsole({ mode }: { mode: 'admin' | 'manager' }) {
  const isManagerMode = mode === 'manager';
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ConsoleTab>('overview');

  // Hub data state
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [selectedHubId, setSelectedHubId] = useState<string>('');
  const [hubStats, setHubStats] = useState<HubStats | null>(null);
  const [batches, setBatches] = useState<HubBatch[]>([]);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [tempLogs, setTempLogs] = useState<TemperatureLog[]>([]);
  const [tempStats, setTempStats] = useState<TempStats | null>(null);
  const [frozenProducts, setFrozenProducts] = useState<FrozenProduct[]>([]);
  // The batch being quarantined or released, while its window is open.
  const [statusBatch, setStatusBatch] = useState<HubBatch | null>(null);

  // Loaders
  const [loading, setLoading] = useState(true);
  // Why the hubs could not be read (shown instead of "No hub is assigned to you yet", which would be untrue), and why the
  // selected hub's figures could not (shown above them, so zeros and empty lists are not taken for the real thing).
  const [initError, setInitError] = useState<unknown>(null);
  const [opsError, setOpsError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadHubOperations = async (hubId: string) => {
    try {
      setRefreshing(true);
      setOpsError(null);
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
    } catch (err: unknown) {
      setOpsError(err);
    } finally {
      setRefreshing(false);
    }
  };

  const initializeData = async () => {
    try {
      setLoading(true);
      setInitError(null);
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
        setFrozenProducts(prodRes.data.data?.products || prodRes.data.data || []);
      } catch (err) {
        console.warn('Failed to load frozen products catalog:', err);
      }

      if (currentHubId) {
        await loadHubOperations(currentHubId);
      }
    } catch (err: unknown) {
      setInitError(err);
    } finally {
      setLoading(false);
    }
  };

  // Auth Guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push(loginUrlHere(isManagerMode ? '/login' : '/admin/login'));
      return;
    }
    const role = user?.userType ?? user?.user_type;
    if (role !== (isManagerMode ? 'hub_manager' : 'admin')) {
      router.push('/products');
      showToast(isManagerMode ? 'This page is for hub managers.' : 'Access denied. Administrator privileges required.', 'error');
      return;
    }
    initializeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per signed-in user
  }, [isAuthenticated, user, router]);

  const handleHubChange = (hubId: string) => {
    setSelectedHubId(hubId);
    loadHubOperations(hubId);
  };

  const reloadHub = () => loadHubOperations(selectedHubId);

  if (!loading && initError && hubs.length === 0) {
    return (
      <DashboardLayout
        title="Cold Hub Operations & FEFO Engine"
        subtitle="Batch intake, temperature checks and the FEFO dispatch queue"
        sidebarItems={isManagerMode ? HUB_MANAGER_SIDEBAR_ITEMS : ADMIN_SIDEBAR_ITEMS}
        userType={isManagerMode ? 'hub_manager' : 'admin'}
      >
        <div className="max-w-xl mx-auto my-12">
          <LoadError error={initError} onRetry={initializeData} title="We couldn't load your hubs" />
        </div>
      </DashboardLayout>
    );
  }

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
        {Boolean(opsError) && <LoadError compact error={opsError} onRetry={reloadHub} title="We couldn't load this hub's figures" />}
        <CommandBar
          hubs={hubs}
          selectedHubId={selectedHubId}
          onHubChange={handleHubChange}
          hubStats={hubStats}
          batchSummary={batchSummary}
          tempStats={tempStats}
          refreshing={refreshing}
          onSync={() => selectedHubId && reloadHub()}
          activeTab={activeTab}
          onTab={setActiveTab}
        />

        {activeTab === 'overview' && (
          <OverviewTab hubStats={hubStats} batchSummary={batchSummary} tempStats={tempStats} onOpenTab={setActiveTab} />
        )}
        {activeTab === 'intake' && (
          <IntakeTab
            hubId={selectedHubId}
            products={frozenProducts}
            onSaved={async () => {
              await reloadHub();
              // Show the queue, where the new batch is now slotted.
              setActiveTab('fefo');
            }}
            onCancel={() => setActiveTab('fefo')}
          />
        )}
        {activeTab === 'fefo' && <FefoTab batches={batches} batchSummary={batchSummary} onChangeStatus={setStatusBatch} />}
        {activeTab === 'temperature' && (
          <TemperatureTab hubId={selectedHubId} tempLogs={tempLogs} tempStats={tempStats} onSaved={reloadHub} />
        )}
      </div>

      {statusBatch && (
        <BatchStatusModal
          key={statusBatch.id}
          hubId={selectedHubId}
          batch={statusBatch}
          onClose={() => setStatusBatch(null)}
          onSaved={reloadHub}
        />
      )}
    </DashboardLayout>
  );
}
