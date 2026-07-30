'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import dynamic from 'next/dynamic';

const LocationMap = dynamic(() => import('@/components/ui/LocationMap').then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-100 rounded-xl flex items-center justify-center" style={{ height: '280px' }}>
      <p className="text-gray-600">Loading map...</p>
    </div>
  ),
});

const sidebarItems = [
  { name: 'Dashboard', href: '/sellers/dashboard', icon: '' },
  { name: 'Orders', href: '/sellers/orders', icon: '' },
  { name: 'Products', href: '/sellers/products', icon: '' },
  { name: 'Inventory', href: '/sellers/products?view=inventory', icon: '' },
  { name: 'Promotions', href: '/sellers/promotions', icon: '' },
  { name: 'Delivery', href: '/sellers/settings#delivery', icon: '' },
  { name: 'Earnings', href: '/sellers/earnings', icon: '' },
  { name: 'Analytics', href: '/sellers/analytics', icon: '' },
  { name: 'Notifications', href: '/sellers/notifications', icon: '' },
  { name: 'Settings', href: '/sellers/settings', icon: '' },
];

export default function SellerSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    businessNameUrdu: '',
    description: '',
    kitchenVideoUrl: '',
    coverImageUrl: '',
    jazzcashNumber: '',
    easypaisaNumber: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankName: '',
    lowStockThreshold: 10,
    enableStockAlerts: true,
    freeDeliveryAreas: [] as string[],
    freeDeliveryRadiusKm: null as number | null,
    latitude: null as number | null,
    longitude: null as number | null,
    deliveryFeeType: '' as '' | 'fixed' | 'distance',
    deliveryFeeFixed: null as number | null,
    deliveryFeeBase: null as number | null,
    deliveryFeePerKm: null as number | null,
  });
  const [newAreaInput, setNewAreaInput] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [locationAutoFetched, setLocationAutoFetched] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }

    loadSettings();
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#delivery') {
      const el = document.getElementById('delivery');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await apiClient.get('/sellers/me');
      if (response.data.success) {
        const seller = response.data.data;
        setFormData({
          businessName: seller.businessName || '',
          businessNameUrdu: seller.businessNameUrdu || '',
          description: seller.description || '',
          kitchenVideoUrl: seller.kitchenVideoUrl || '',
          coverImageUrl: seller.coverImageUrl || '',
          jazzcashNumber: seller.jazzcashNumber || '',
          easypaisaNumber: seller.easypaisaNumber || '',
          bankAccountName: seller.bankAccountName || '',
          bankAccountNumber: seller.bankAccountNumber || '',
          bankName: seller.bankName || '',
          lowStockThreshold: seller.lowStockThreshold ?? 10,
          enableStockAlerts: seller.enableStockAlerts ?? true,
          freeDeliveryAreas: Array.isArray(seller.freeDeliveryAreas) ? seller.freeDeliveryAreas : [],
          freeDeliveryRadiusKm: seller.freeDeliveryRadiusKm ?? null,
          latitude: seller.latitude ?? null,
          longitude: seller.longitude ?? null,
          deliveryFeeType: (seller.deliveryFeeType as '' | 'fixed' | 'distance') || '',
          deliveryFeeFixed: seller.deliveryFeeFixed ?? null,
          deliveryFeeBase: seller.deliveryFeeBase ?? null,
          deliveryFeePerKm: seller.deliveryFeePerKm ?? null,
        });
      }
    } catch (error: any) {
      console.error('Failed to load settings:', error);
      const isNetworkError = error.message === 'Network Error' || error.code === 'ERR_NETWORK';
      const apiUrl = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1') : '';
      const message = isNetworkError
        ? `Cannot reach the API at ${apiUrl}. Start the backend with: cd backend && npm run dev`
        : (error.response?.data?.error?.message || error.message || 'Failed to load settings');
      setLoadError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { freeDeliveryAreas, freeDeliveryRadiusKm, latitude, longitude, deliveryFeeType, deliveryFeeFixed, deliveryFeeBase, deliveryFeePerKm, ...rest } = formData;
      await apiClient.patch('/sellers/me', {
        ...rest,
        freeDeliveryAreas,
        freeDeliveryRadiusKm: freeDeliveryRadiusKm ?? undefined,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        deliveryFeeType: deliveryFeeType || undefined,
        deliveryFeeFixed: deliveryFeeFixed ?? undefined,
        deliveryFeeBase: deliveryFeeBase ?? undefined,
        deliveryFeePerKm: deliveryFeePerKm ?? undefined,
      });
      showToast('Settings updated successfully', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addFreeDeliveryArea = () => {
    const area = newAreaInput.trim();
    if (!area) return;
    if (formData.freeDeliveryAreas.includes(area)) {
      showToast('This area is already added', 'info');
      return;
    }
    setFormData({
      ...formData,
      freeDeliveryAreas: [...formData.freeDeliveryAreas, area],
    });
    setNewAreaInput('');
  };

  const removeFreeDeliveryArea = (area: string) => {
    setFormData({
      ...formData,
      freeDeliveryAreas: formData.freeDeliveryAreas.filter((a) => a !== area),
    });
  };

  const setLocationFromGeolocation = (onSuccess?: () => void) => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        setFetchingLocation(false);
        onSuccess?.();
      },
      () => setFetchingLocation(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleUseCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }
    setLocationFromGeolocation(() => showToast('Location updated. Adjust the marker if needed.', 'success'));
  };

  // Auto-fetch current location once when no saved location (after settings loaded)
  useEffect(() => {
    if (loading || locationAutoFetched || !formData) return;
    const hasLocation = formData.latitude != null && formData.longitude != null;
    if (hasLocation) {
      setLocationAutoFetched(true);
      return;
    }
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationAutoFetched(true);
      return;
    }
    setLocationAutoFetched(true);
    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({ ...prev, latitude: position.coords.latitude, longitude: position.coords.longitude }));
        setFetchingLocation(false);
      },
      () => setFetchingLocation(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, [loading, locationAutoFetched]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="Settings"
      subtitle="Manage your seller account settings"
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-4xl mx-auto">
        {loadError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {loadError}
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => { setLoadError(null); loadSettings(); }}>
              Retry
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          {/* Business Information */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Business Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Name (English)
                </label>
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Name (Urdu)
                </label>
                <input
                  type="text"
                  value={formData.businessNameUrdu}
                  onChange={(e) => setFormData({ ...formData, businessNameUrdu: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Payment Information */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Payment Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  JazzCash Number
                </label>
                <input
                  type="text"
                  value={formData.jazzcashNumber}
                  onChange={(e) => setFormData({ ...formData, jazzcashNumber: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="03001234567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  EasyPaisa Number
                </label>
                <input
                  type="text"
                  value={formData.easypaisaNumber}
                  onChange={(e) => setFormData({ ...formData, easypaisaNumber: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="03001234567"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="e.g., HBL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bank Account Title
                  </label>
                  <input
                    type="text"
                    value={formData.bankAccountName}
                    onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Account holder name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bank Account Number / IBAN
                  </label>
                  <input
                    type="text"
                    value={formData.bankAccountNumber}
                    onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="PK00XXXX0000000000000000"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stock Alerts */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Stock Alerts</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="enableStockAlerts"
                  checked={formData.enableStockAlerts}
                  onChange={(e) => setFormData({ ...formData, enableStockAlerts: e.target.checked })}
                  className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                />
                <label htmlFor="enableStockAlerts" className="text-sm font-medium text-gray-700">
                  Notify me when a product's stock runs low
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Low stock threshold
                </label>
                <p className="text-xs text-gray-500 mb-2">You'll be alerted when a product's remaining stock falls at or below this number.</p>
                <input
                  type="number"
                  min={0}
                  value={formData.lowStockThreshold}
                  onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value, 10) || 0 })}
                  className="w-full md:w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  disabled={!formData.enableStockAlerts}
                />
              </div>
            </div>
          </div>

          {/* Delivery */}
          <div id="delivery">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Delivery</h2>
            <p className="text-sm text-gray-600 mb-4">
              Delivery is <strong>free</strong> for customers within your chosen radius of your business location. Outside that, charge a <strong>fixed fee</strong> or <strong>distance-based</strong> fee.
            </p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Free delivery within (km)</label>
                <p className="text-xs text-gray-500 mb-2">Everyone within this distance from your business location gets free delivery (e.g. 4 = free within 4 km).</p>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="e.g. 4"
                  value={formData.freeDeliveryRadiusKm ?? ''}
                  onChange={(e) => setFormData({ ...formData, freeDeliveryRadiusKm: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                />
                <span className="ml-2 text-sm text-gray-500">km from your location</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Also free in these areas (optional)</label>
                <p className="text-xs text-gray-500 mb-2">e.g. Askari, DHA — customers in these area names also get free delivery even if outside the radius.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAreaInput}
                    onChange={(e) => setNewAreaInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFreeDeliveryArea())}
                    placeholder="e.g. Askari, DHA, Clifton"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                  />
                  <Button type="button" variant="outline" onClick={addFreeDeliveryArea}>
                    Add area
                  </Button>
                </div>
                {formData.freeDeliveryAreas.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.freeDeliveryAreas.map((area) => (
                      <span
                        key={area}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-800 rounded-lg text-sm"
                      >
                        {area}
                        <button
                          type="button"
                          onClick={() => removeFreeDeliveryArea(area)}
                          className="text-gray-500 hover:text-red-600"
                          aria-label={`Remove ${area}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your business location (for distance-based fee)</label>
                <p className="text-xs text-gray-500 mb-2">We use your location for delivery estimates. The map is centered on your saved or current location—click or drag the marker to adjust.</p>
                <div className="rounded-xl overflow-hidden border border-gray-200 mb-3">
                  <LocationMap
                    center={
                      formData.latitude != null && formData.longitude != null
                        ? { lat: formData.latitude, lng: formData.longitude }
                        : { lat: 24.8607, lng: 67.0011 }
                    }
                    markerPosition={
                      formData.latitude != null && formData.longitude != null
                        ? { lat: formData.latitude, lng: formData.longitude }
                        : null
                    }
                    radiusKm={formData.freeDeliveryRadiusKm ?? undefined}
                    onLocationSelect={({ lat, lng }) =>
                      setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }))
                    }
                    height="280px"
                    draggable={true}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
                    <input
                      type="number"
                      step="any"
                      placeholder="Latitude"
                      value={formData.latitude ?? ''}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Longitude"
                      value={formData.longitude ?? ''}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value === '' ? null : parseFloat(e.target.value) })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={fetchingLocation}
                    className="text-sm text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
                  >
                    {fetchingLocation ? 'Getting location…' : 'Use my current location'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fee when address is outside free areas</label>
                <div className="flex gap-4 mb-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="deliveryFeeType"
                      checked={formData.deliveryFeeType === 'fixed'}
                      onChange={() => setFormData({ ...formData, deliveryFeeType: 'fixed' })}
                      className="rounded border-gray-300"
                    />
                    Fixed amount (e.g. Rs 200–300)
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="deliveryFeeType"
                      checked={formData.deliveryFeeType === 'distance'}
                      onChange={() => setFormData({ ...formData, deliveryFeeType: 'distance' })}
                      className="rounded border-gray-300"
                    />
                    Distance-based
                  </label>
                </div>
                {formData.deliveryFeeType === 'fixed' && (
                  <div>
                    <input
                      type="number"
                      min={0}
                      placeholder="Rs"
                      value={formData.deliveryFeeFixed ?? ''}
                      onChange={(e) => setFormData({ ...formData, deliveryFeeFixed: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                      className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                    />
                    <span className="ml-2 text-sm text-gray-500">per order outside free areas</span>
                  </div>
                )}
                {formData.deliveryFeeType === 'distance' && (
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <span className="text-sm text-gray-600 mr-2">Base fee (Rs)</span>
                      <input
                        type="number"
                        min={0}
                        value={formData.deliveryFeeBase ?? ''}
                        onChange={(e) => setFormData({ ...formData, deliveryFeeBase: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 mr-2">+ Rs per km</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={formData.deliveryFeePerKm ?? ''}
                        onChange={(e) => setFormData({ ...formData, deliveryFeePerKm: e.target.value === '' ? null : parseFloat(e.target.value) })}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Media */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Media</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cover Image URL
                </label>
                <input
                  type="url"
                  value={formData.coverImageUrl}
                  onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kitchen Video URL
                </label>
                <input
                  type="url"
                  value={formData.kitchenVideoUrl}
                  onChange={(e) => setFormData({ ...formData, kitchenVideoUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

