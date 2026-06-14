'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { riderService, AvailableDelivery, MyDelivery } from '@/lib/services/rider.service';
import { formatPrice } from '@/lib/utils';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Bike, MapPin, Package, Navigation, CheckCircle2, Radio, LogOut } from 'lucide-react';

const LOCATION_INTERVAL_MS = 15000; // low-frequency → keeps bandwidth/cost negligible

export default function RiderPage() {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { showToast } = useToast();
  const [available, setAvailable] = useState<AvailableDelivery[]>([]);
  const [mine, setMine] = useState<MyDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [sharingOrderId, setSharingOrderId] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);

  const load = async () => {
    try {
      const [a, m] = await Promise.all([riderService.available(), riderService.mine()]);
      setAvailable(a);
      setMine(m);
    } catch (e: unknown) {
      if ((e as { response?: { status?: number } })?.response?.status === 403) setForbidden(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    load();
    return () => stopSharing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const accept = async (orderId: string) => {
    try {
      await riderService.accept(orderId);
      showToast('Delivery accepted', 'success');
      load();
    } catch {
      showToast('Could not accept (maybe already taken)', 'error');
      load();
    }
  };

  const setStatus = async (orderId: string, status: 'picked_up' | 'on_the_way' | 'delivered') => {
    try {
      await riderService.updateStatus(orderId, status);
      if (status === 'delivered') {
        if (sharingOrderId === orderId) stopSharing();
        showToast('Delivered! Nice work.', 'success');
      }
      load();
    } catch {
      showToast('Could not update status', 'error');
    }
  };

  const stopSharing = () => {
    if (watchRef.current != null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
    setSharingOrderId(null);
  };

  const startSharing = (orderId: string) => {
    if (!('geolocation' in navigator)) {
      showToast('Location not supported on this device', 'error');
      return;
    }
    if (sharingOrderId) stopSharing();
    lastSentRef.current = 0;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentRef.current < LOCATION_INTERVAL_MS) return; // throttle
        lastSentRef.current = now;
        riderService
          .pushLocation(orderId, pos.coords.latitude, pos.coords.longitude)
          .catch(() => {});
      },
      () => showToast('Could not get your location', 'error'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    setSharingOrderId(orderId);
    showToast('Sharing live location with the customer', 'success');
  };

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-page)' }}>
      <header className="nuray-nav">
        <div className="flex items-center justify-between h-16 px-4 sm:px-6 max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="brand-mark w-9 h-9 text-lg"><span>N</span></span>
            <div className="leading-tight">
              <p className="font-display text-lg text-ink-900">nuray</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-500">Rider</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => { logout(); router.push('/login'); }}
              aria-label="Log out"
              className="w-10 h-10 rounded-full flex items-center justify-center text-ink-600 hover:bg-cream-100"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        <div className="flex items-center gap-2">
          <Bike className="w-6 h-6 text-forest-500" />
          <h1 className="text-2xl font-bold text-ink-900">Hi{user?.profile?.fullName ? `, ${user.profile.fullName.split(' ')[0]}` : ''} — ready to ride?</h1>
        </div>

        {forbidden ? (
          <div className="bg-card rounded-2xl border border-ink-100 p-8 text-center">
            <p className="text-ink-700 font-semibold">This area is for riders.</p>
            <p className="text-ink-500 text-sm mt-1">Your account isn&apos;t a rider account.</p>
          </div>
        ) : (
          <>
            {/* Active deliveries */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500 mb-3">My deliveries</h2>
              {mine.length === 0 ? (
                <p className="text-ink-500 text-sm">No active deliveries. Accept one below.</p>
              ) : (
                <div className="space-y-3">
                  {mine.map((d) => (
                    <div key={d.orderId} className="bg-card rounded-2xl border border-ink-100 shadow-sm p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900">#{d.orderNumber}</p>
                          <p className="text-sm text-ink-500 flex items-center gap-1 mt-0.5">
                            <Package className="w-3.5 h-3.5" /> {d.itemCount} item{d.itemCount > 1 ? 's' : ''} · {d.seller}
                          </p>
                          <p className="text-sm text-ink-600 flex items-start gap-1 mt-1">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-forest-500" />
                            {[d.deliveryAddress?.addressLine1, d.deliveryAddress?.area, d.deliveryAddress?.city].filter(Boolean).join(', ')}
                          </p>
                        </div>
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-forest-50 text-forest-700 capitalize shrink-0">
                          {d.deliveryStatus.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4">
                        {d.deliveryStatus === 'assigned' && (
                          <button onClick={() => setStatus(d.orderId, 'picked_up')} className="h-10 px-4 rounded-full bg-ink-900 text-cream-50 text-sm font-semibold inline-flex items-center gap-1.5">
                            <Package className="w-4 h-4" /> Picked up
                          </button>
                        )}
                        {(d.deliveryStatus === 'picked_up' || d.deliveryStatus === 'assigned') && (
                          <button onClick={() => setStatus(d.orderId, 'on_the_way')} className="h-10 px-4 rounded-full bg-ink-900 text-cream-50 text-sm font-semibold inline-flex items-center gap-1.5">
                            <Navigation className="w-4 h-4" /> On the way
                          </button>
                        )}
                        <button onClick={() => setStatus(d.orderId, 'delivered')} className="h-10 px-4 rounded-full bg-forest-500 text-cream-50 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-forest-600">
                          <CheckCircle2 className="w-4 h-4" /> Delivered
                        </button>
                        <button
                          onClick={() => (sharingOrderId === d.orderId ? stopSharing() : startSharing(d.orderId))}
                          className={`h-10 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-1.5 border ${
                            sharingOrderId === d.orderId
                              ? 'bg-anar-500 text-cream-50 border-anar-500'
                              : 'bg-card text-ink-700 border-ink-200 hover:border-forest-300'
                          }`}
                        >
                          <Radio className="w-4 h-4" /> {sharingOrderId === d.orderId ? 'Stop sharing' : 'Share location'}
                        </button>
                      </div>
                      {sharingOrderId === d.orderId && (
                        <p className="text-xs text-forest-600 mt-2 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-anar-500 animate-pulse" /> Live — the customer can see you on the map
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Available */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500 mb-3">Available nearby</h2>
              {loading ? (
                <p className="text-ink-500 text-sm">Loading…</p>
              ) : available.length === 0 ? (
                <p className="text-ink-500 text-sm">No deliveries waiting right now. Check back soon.</p>
              ) : (
                <div className="space-y-3">
                  {available.map((a) => (
                    <div key={a.orderId} className="bg-card rounded-2xl border border-ink-100 shadow-sm p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink-900">#{a.orderNumber} · <span className="text-ink-500 font-normal">{a.seller}</span></p>
                        <p className="text-sm text-ink-600 flex items-start gap-1 mt-1">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-forest-500" /> {a.deliveryAddress}
                        </p>
                        <p className="text-xs text-ink-400 mt-1">{a.itemCount} item{a.itemCount > 1 ? 's' : ''} · {formatPrice(a.total)}</p>
                      </div>
                      <button onClick={() => accept(a.orderId)} className="h-10 px-5 rounded-full bg-forest-500 text-cream-50 text-sm font-semibold hover:bg-forest-600 shrink-0">
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
