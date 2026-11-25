/**
 * The platform settings form, checked before it is sent. A box left empty used to be sent as 0 (`parseFloat('') || 0`), so
 * clearing the commission box to type a new rate and pressing Save set the commission to 0%; a number the server would refuse
 * (a farthest delivery of 0 km) came back as a vague "Failed to update settings". Each number is now either what was typed or
 * a sentence naming the box, and nothing is sent until every box is right.
 *
 * Pure on purpose (no React, no axios): run by the unit tests. The limits are the ones the API enforces
 * (backend/src/validators/admin.validator.ts, updateSettingsSchema).
 */

export interface SettingsForm {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  commissionRate: string;
  minPayoutAmount: string;
  deliveryPerKm: string;
  deliveryIncludedKm: string;
  deliveryMaxKm: string;
  deliveryFallbackFee: string;
  /** Payout holidays, one YYYY-MM-DD date per line (or separated by commas). */
  payoutHolidays: string;
}

type NumberKey = Exclude<keyof SettingsForm, 'platformName' | 'supportEmail' | 'supportPhone' | 'payoutHolidays'>;

/** The box, what a person calls it, and the lowest and highest value the API accepts. */
const NUMBERS: ReadonlyArray<readonly [NumberKey, string, number, number]> = [
  ['commissionRate', 'Commission rate', 0, 100],
  ['minPayoutAmount', 'Minimum payout amount', 0, 10_000_000],
  ['deliveryPerKm', 'Per km to another community', 0, 1000],
  ['deliveryIncludedKm', 'Km included in the base fee', 0, 100],
  ['deliveryMaxKm', 'Farthest a Nuray rider delivers', 1, 200],
  ['deliveryFallbackFee', "Base fee when a kitchen's community isn't known", 0, 5000],
];

const TEXTS: ReadonlyArray<readonly [keyof SettingsForm, string]> = [
  ['platformName', 'Platform name'],
  ['supportEmail', 'Support email'],
  ['supportPhone', 'Support phone'],
];

export type SettingsCheck =
  | { ok: true; body: Record<keyof SettingsForm, string | number | string[]> }
  | { ok: false; field: keyof SettingsForm; message: string };

export function checkSettingsForm(form: SettingsForm): SettingsCheck {
  const body: Record<string, string | number | string[]> = {};
  for (const [key, label] of TEXTS) {
    const value = form[key].trim();
    if (!value) return { ok: false, field: key, message: `${label} can't be empty.` };
    body[key] = value;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.supportEmail))) {
    return { ok: false, field: 'supportEmail', message: 'Support email must be an e-mail address, such as help@example.com.' };
  }
  for (const [key, label, min, max] of NUMBERS) {
    const typed = form[key].trim();
    if (!typed) return { ok: false, field: key, message: `${label} can't be empty.` };
    const value = Number(typed);
    if (!Number.isFinite(value) || value < min || value > max) {
      return { ok: false, field: key, message: `${label} must be a number from ${min} to ${max.toLocaleString('en-US')}.` };
    }
    body[key] = value;
  }
  const holidays = form.payoutHolidays.split(/[\s,]+/).filter(Boolean);
  for (const day of holidays) {
    const at = new Date(`${day}T00:00:00Z`);
    const real = /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(at.getTime()) && at.toISOString().startsWith(day);
    if (!real) return { ok: false, field: 'payoutHolidays', message: `Payout holidays: "${day}" is not a date as YYYY-MM-DD.` };
  }
  body.payoutHolidays = [...new Set(holidays)].sort();
  return { ok: true, body: body as Record<keyof SettingsForm, string | number | string[]> };
}
