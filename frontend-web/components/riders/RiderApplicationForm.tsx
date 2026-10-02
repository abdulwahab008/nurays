'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import FileUploadField from '@/components/ui/FileUploadField';
import { useT } from '@/lib/i18n';
import { riderMessages } from '@/lib/i18n/messages/rider';

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
  if (!app) return <div className="h-40 rounded-2xl bg-slate-100 animate-pulse" />;

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

  const field = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm';
  const label = 'block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 max-w-2xl mx-auto" data-testid="rider-application">
      {app.verificationStatus === 'rejected' && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>{t('app.rejectedTitle')}</strong> {app.rejectionReason ? t('app.rejectedReason', { reason: app.rejectionReason }) : ''}{t('app.rejectedFix')}
        </div>
      )}

      {!editing ? (
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">⏳</div>
          <h2 className="text-xl font-bold text-slate-900">{t('app.underReview')}</h2>
          <p className="text-slate-600 mt-2 text-sm">
            {(() => {
              const vehicleKey = VEHICLES.find(([v]) => v === app.vehicleType)?.[1];
              return t('app.underReviewBody', {
                vehicle: vehicleKey ? t(vehicleKey).toLowerCase() : t('app.vehicleGeneric'),
                number: app.vehicleNumber,
              });
            })()}
          </p>
          <button type="button" onClick={() => setEditing(true)} className="mt-4 text-sm font-semibold text-emerald-700 underline">
            {t('app.changeDetails')}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('app.finishTitle')}</h2>
            <p className="text-sm text-slate-600 mt-1">{t('app.finishBody')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>{t('app.city')}</label>
              <input required value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" className={field} />
            </div>
            <div>
              <label className={label}>{t('app.vehicle')}</label>
              <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={field}>
                {VEHICLES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {t(l)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>{t('app.regNumber')}</label>
              <input required dir="ltr" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="LEA-1234" className={field} />
            </div>
            <div>
              <label className={label}>{t('app.licenseNumber')}</label>
              <input dir="ltr" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder={t('app.optional')} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <FileUploadField kind="document" label={t('app.cnicFront')} required value={cnicFront} onChange={setCnicFront} onFileText={onFile('cnic_front') ? t('app.onFile') : undefined} testId="rider-cnic-front" />
            <FileUploadField kind="document" label={t('app.cnicBack')} required value={cnicBack} onChange={setCnicBack} onFileText={onFile('cnic_back') ? t('app.onFile') : undefined} testId="rider-cnic-back" />
            <FileUploadField kind="document" label={t('app.license')} required value={license} onChange={setLicense} onFileText={onFile('license') ? t('app.onFile') : undefined} testId="rider-license" />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
          >
            {saving ? t('app.sending') : app.verificationStatus === 'rejected' ? t('app.sendAgain') : t('app.send')}
          </button>
        </form>
      )}
    </div>
  );
}
