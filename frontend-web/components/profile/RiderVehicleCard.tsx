'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bike, Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { VEHICLES } from '@/components/riders/RiderApplicationForm';
import { fieldClass as field, labelClass as label } from '@/components/sellers/product-form/fields';
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from '@/lib/api-client';
import { riderService, type RiderProfile } from '@/lib/services/rider.service';
import { useT } from '@/lib/i18n';
import { riderMessages } from '@/lib/i18n/messages/rider';
import { commonMessages } from '@/lib/i18n/messages/common';

/**
 * The rider's vehicle on their settings page. An approved rider changes the type and number plate here; the licence
 * number was checked against their licence photo at approval, so it is shown but changes only through support.
 * A rider who isn't approved (or is suspended) gets nothing here: GET /riders/me refuses them and their application
 * form is where they change their details.
 */
export function RiderVehicleCard() {
  const t = useT(riderMessages);
  const tc = useT(commonMessages);
  const { showToast } = useToast();
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hidden, setHidden] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vehicleType, setVehicleType] = useState<string>('motorcycle');
  const [vehicleNumber, setVehicleNumber] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await riderService.getRiderProfile();
      setRider(res.data ?? null);
      setError(null);
    } catch (err) {
      const status = apiErrorStatus(err);
      if (status === 403 || status === 404) setHidden(true);
      else setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden) return null;

  const startEditing = () => {
    setVehicleType(rider?.vehicleType ?? 'motorcycle');
    setVehicleNumber(rider?.vehicleNumber ?? '');
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = await riderService.updateVehicle({ vehicleType, vehicleNumber: vehicleNumber.trim() });
      setRider((r) => (r ? { ...r, ...saved } : r));
      setEditing(false);
      showToast(t('vehicleCard.saved'), 'success');
    } catch (err) {
      showToast(apiErrorCode(err) === 'VEHICLE_LOCKED_ON_DELIVERY' ? t('vehicleCard.onDelivery') : apiErrorMessage(err, t('vehicleCard.saveFailed')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const vehicleKey = VEHICLES.find(([v]) => v === rider?.vehicleType)?.[1];

  return (
    <div className="bg-surface rounded-[20px] border border-line p-6" data-testid="rider-vehicle-card">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Bike className="w-5 h-5 text-brand-ink" /> {t('vehicleCard.title')}
          </h2>
          <p className="text-sm text-muted">{t('vehicleCard.desc')}</p>
        </div>
        {rider && !editing && (
          <Button variant="outline" onClick={startEditing} size="sm" className="flex items-center gap-1.5 shrink-0" data-testid="rider-vehicle-edit">
            <Pencil className="w-4 h-4" /> {tc('edit')}
          </Button>
        )}
      </div>

      {error ? (
        <LoadError error={error} onRetry={load} title={t('vehicleCard.loadFailed')} compact plain />
      ) : !rider ? (
        <div className="h-24 rounded-xl bg-raised animate-pulse" />
      ) : editing ? (
        <form onSubmit={save} data-testid="rider-vehicle-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rider-vehicle-type" className={label}>{t('vehicleCard.type')}</label>
              <select id="rider-vehicle-type" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={field}>
                {VEHICLES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {t(l)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rider-vehicle-number" className={label}>{t('vehicleCard.number')}</label>
              <input id="rider-vehicle-number" required minLength={2} maxLength={20} dir="ltr" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="LEA-1234" className={field} />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Button type="submit" disabled={saving} className="flex items-center gap-1.5">
              <Check className="w-4 h-4" /> {saving ? t('vehicleCard.saving') : tc('save')}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 md:gap-x-6 divide-y divide-line md:divide-y-0 border-t border-line md:border-t-0">
          <div className="py-3 md:py-0">
            <p className="text-xs text-muted mb-1">{t('vehicleCard.type')}</p>
            <p className="font-semibold text-ink">{vehicleKey ? t(vehicleKey) : rider.vehicleType || t('notSet')}</p>
          </div>
          <div className="py-3 md:py-0">
            <p className="text-xs text-muted mb-1">{t('vehicleCard.number')}</p>
            <p className="font-semibold text-ink">{rider.vehicleNumber ? <span data-ltr>{rider.vehicleNumber}</span> : t('notSet')}</p>
          </div>
          <div className="py-3 md:py-0">
            <p className="text-xs text-muted mb-1">{t('vehicleCard.license')}</p>
            <p className="font-semibold text-ink">{rider.licenseNumber ? <span data-ltr>{rider.licenseNumber}</span> : t('notSet')}</p>
            <p className="text-xs text-muted mt-1">{t('vehicleCard.licenseLocked')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
