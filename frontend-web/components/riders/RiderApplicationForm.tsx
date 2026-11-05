'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import FileUploadField from '@/components/ui/FileUploadField';
import { useT } from '@/lib/i18n';
import { riderMessages } from '@/lib/i18n/messages/rider';
import { Button } from '@/components/ui/button';
import { fieldClass as field, labelClass as label } from '@/components/sellers/product-form/fields';
import { Clock } from 'lucide-react';

interface Application {
  verificationStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  city: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  licenseNumber: string | null;
  documents: Array<{ type: string; url: string | null; uploadedAt: string }>;
}

const VEHICLES = [
  ['motorcycle', 'vehicle.motorcycle'],
  ['scooter', 'vehicle.scooter'],
  ['bicycle', 'vehicle.bicycle'],
  ['car', 'vehicle.car'],
  ['rickshaw', 'vehicle.rickshaw'],
] as const;

const REQUIRED = ['cnic_front', 'cnic_back', 'license'];

/**
 * A new (or rejected) rider sends their vehicle details and photos of their CNIC and driving
 * licence. Admins review it before the rider can take any delivery.
 */
export default function RiderApplicationForm() {
  const { showToast } = useToast();
  const t = useT(riderMessages);
  const [app, setApp] = useState<Application | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [city, setCity] = useState('');
  const [vehicleType, setVehicleType] = useState<string>('motorcycle');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [cnicFront, setCnicFront] = useState<string | null>(null);
  const [cnicBack, setCnicBack] = useState<string | null>(null);
  const [license, setLicense] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/riders/me/application');
      const a: Application = res.data.data;
      setApp(a);
      setCity(a.city && a.city !== 'Unspecified' ? a.city : '');
      setVehicleType(a.vehicleType ?? 'motorcycle');
      setVehicleNumber(a.vehicleNumber ?? '');
      setLicenseNumber(a.licenseNumber ?? '');
      const complete = !!a.vehicleType && !!a.vehicleNumber && REQUIRED.every((t) => a.documents.some((d) => d.type === t));
      setEditing(!complete || a.verificationStatus === 'rejected');
    } catch (error) {
      setLoadError(apiErrorMessage(error, t('app.loadFailed')));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) return <p className="text-sm text-red-700 text-center">{loadError}</p>;
  if (!app) return <div className="h-40 max-w-2xl mx-auto rounded-[20px] bg-raised animate-pulse" />;

  const onFile = (type: string) => app.documents.some((d) => d.type === type);
  const missingDocs = REQUIRED.filter((t) => !onFile(t) && !{ cnic_front: cnicFront, cnic_back: cnicBack, license }[t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missingDocs.length) {
      showToast(t('app.missingDocs'), 'warning');
      return;
    }
    try {
      setSaving(true);
      await apiClient.put('/riders/me/application', {
        city: city.trim(),
        vehicleType,
        vehicleNumber: vehicleNumber.trim(),
        licenseNumber: licenseNumber.trim() || undefined,
        cnicFrontUrl: cnicFront || undefined,
        cnicBackUrl: cnicBack || undefined,
        licenseUrl: license || undefined,
      });
      showToast(t('app.sent'), 'success');
      setCnicFront(null);
      setCnicBack(null);
      setLicense(null);
      await load();
    } catch (error) {
      showToast(apiErrorMessage(error, t('app.sendFailed')), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-[20px] shadow-[var(--shadow-card)] border border-line p-5 sm:p-8 max-w-2xl mx-auto" data-testid="rider-application">
      {app.verificationStatus === 'rejected' && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>{t('app.rejectedTitle')}</strong> {app.rejectionReason ? t('app.rejectedReason', { reason: app.rejectionReason }) : ''}{t('app.rejectedFix')}
        </div>
      )}

      {!editing ? (
        <div className="text-center">
          <div aria-hidden="true" className="w-12 h-12 bg-accent-soft text-accent-soft-ink rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-ink">{t('app.underReview')}</h2>
          <p className="text-muted mt-2 text-sm">
            {(() => {
              const vehicleKey = VEHICLES.find(([v]) => v === app.vehicleType)?.[1];
              return t('app.underReviewBody', {
                vehicle: vehicleKey ? t(vehicleKey).toLowerCase() : t('app.vehicleGeneric'),
                number: app.vehicleNumber,
              });
            })()}
          </p>
          <Button type="button" variant="ghost" onClick={() => setEditing(true)} className="mt-4">
            {t('app.changeDetails')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-ink">{t('app.finishTitle')}</h2>
            <p className="text-sm text-muted mt-1">{t('app.finishBody')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rider-app-city" className={label}>{t('app.city')}</label>
              <input id="rider-app-city" required value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" className={field} />
            </div>
            <div>
              <label htmlFor="rider-app-vehicle" className={label}>{t('app.vehicle')}</label>
              <select id="rider-app-vehicle" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={field}>
                {VEHICLES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {t(l)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rider-app-reg" className={label}>{t('app.regNumber')}</label>
              <input id="rider-app-reg" required dir="ltr" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="LEA-1234" className={field} />
            </div>
            <div>
              <label htmlFor="rider-app-licence" className={label}>{t('app.licenseNumber')}</label>
              <input id="rider-app-licence" dir="ltr" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder={t('app.optional')} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <FileUploadField kind="document" label={t('app.cnicFront')} required value={cnicFront} onChange={setCnicFront} onFileText={onFile('cnic_front') ? t('app.onFile') : undefined} testId="rider-cnic-front" />
            <FileUploadField kind="document" label={t('app.cnicBack')} required value={cnicBack} onChange={setCnicBack} onFileText={onFile('cnic_back') ? t('app.onFile') : undefined} testId="rider-cnic-back" />
            <FileUploadField kind="document" label={t('app.license')} required value={license} onChange={setLicense} onFileText={onFile('license') ? t('app.onFile') : undefined} testId="rider-license" />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? t('app.sending') : app.verificationStatus === 'rejected' ? t('app.sendAgain') : t('app.send')}
          </Button>
        </form>
      )}
    </div>
  );
}
