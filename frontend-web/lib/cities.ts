/**
 * Pakistani cities for the address, kitchen and sign-up forms, and working a city out from what a map gives back.
 * Pure functions with no imports, so `npm test` covers them (tests/unit/cities.test.ts).
 *
 * A form never invents a city: when nothing here or in the map's answer says which one it is, the answer is '' and the
 * person chooses.
 */

/** The cities the forms offer, largest first. A person can still type another. */
export const CITIES = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot',
  'Gujranwala', 'Bahawalpur', 'Sargodha', 'Sukkur', 'Larkana', 'Sheikhupura', 'Jhang', 'Rahim Yar Khan', 'Mardan', 'Kasur',
  'Mingora', 'Dera Ghazi Khan', 'Sahiwal', 'Nawabshah', 'Okara',
] as const;

export type City = (typeof CITIES)[number];

/** Where each city is (its middle), for naming the city a map pin falls in. */
export const CITY_CENTRES: Record<City, { lat: number; lng: number }> = {
  Karachi: { lat: 24.8607, lng: 67.0011 },
  Lahore: { lat: 31.5204, lng: 74.3587 },
  Islamabad: { lat: 33.6844, lng: 73.0479 },
  Rawalpindi: { lat: 33.5651, lng: 73.0169 },
  Faisalabad: { lat: 31.4504, lng: 73.135 },
  Multan: { lat: 30.1575, lng: 71.5249 },
  Peshawar: { lat: 34.0151, lng: 71.5249 },
  Quetta: { lat: 30.1798, lng: 66.975 },
  Hyderabad: { lat: 25.396, lng: 68.3578 },
  Sialkot: { lat: 32.4945, lng: 74.5229 },
  Gujranwala: { lat: 32.1877, lng: 74.1945 },
  Bahawalpur: { lat: 29.3956, lng: 71.6836 },
  Sargodha: { lat: 32.074, lng: 72.6861 },
  Sukkur: { lat: 27.7052, lng: 68.8574 },
  Larkana: { lat: 27.557, lng: 68.2028 },
  Sheikhupura: { lat: 31.7167, lng: 73.985 },
  Jhang: { lat: 31.2681, lng: 72.3181 },
  'Rahim Yar Khan': { lat: 28.4202, lng: 70.2952 },
  Mardan: { lat: 34.1989, lng: 72.0231 },
  Kasur: { lat: 31.1187, lng: 74.45 },
  Mingora: { lat: 34.7717, lng: 72.36 },
  'Dera Ghazi Khan': { lat: 30.0489, lng: 70.6455 },
  Sahiwal: { lat: 30.6682, lng: 73.1114 },
  Nawabshah: { lat: 26.2442, lng: 68.41 },
  Okara: { lat: 30.8138, lng: 73.4534 },
};

/** How a map service writes a city in Urdu. */
const URDU_NAMES: Record<string, City> = {
  'کراچی': 'Karachi',
  'لاہور': 'Lahore',
  'ضلع لاہور': 'Lahore',
  'اسلام آباد': 'Islamabad',
  'راولپنڈی': 'Rawalpindi',
  'فیصل آباد': 'Faisalabad',
  'ملتان': 'Multan',
  'پشاور': 'Peshawar',
  'کوئٹہ': 'Quetta',
  'حیدرآباد': 'Hyderabad',
  'سیالکوٹ': 'Sialkot',
  'گوجرانوالہ': 'Gujranwala',
  'بہاولپور': 'Bahawalpur',
  'سرگودھا': 'Sargodha',
  'سکھر': 'Sukkur',
  'لاڑکانہ': 'Larkana',
  'شیخوپورہ': 'Sheikhupura',
  'جھنگ': 'Jhang',
  'رحیم یار خان': 'Rahim Yar Khan',
  'مردان': 'Mardan',
  'قصور': 'Kasur',
  'مینگورہ': 'Mingora',
  'ڈیرہ غازی خان': 'Dera Ghazi Khan',
  'ساہیوال': 'Sahiwal',
  'نواب شاہ': 'Nawabshah',
  'اوکاڑہ': 'Okara',
};

/** A pin farther than this from every city's middle is not named after one (Karachi is the widest, at about 30 km). */
const NEAR_KM = 30;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * The city whose middle a pin is nearest to, when it is within reach of one (Rawalpindi and Islamabad touch, so boxes
 * round them overlap; the nearer middle decides). null in the countryside.
 */
export function cityFromCoords(lat: number, lng: number): City | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: City | null = null;
  let bestKm = NEAR_KM;
  for (const city of CITIES) {
    const km = distanceKm(lat, lng, CITY_CENTRES[city].lat, CITY_CENTRES[city].lng);
    if (km <= bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

/** A listed city named in a map's text: "Rawalpindi District" and "Islamabad Capital Territory" are Rawalpindi and Islamabad. */
function cityFromName(value: string): City | null {
  const text = value.trim();
  if (!text) return null;
  const urdu = URDU_NAMES[text];
  if (urdu) return urdu;
  const lower = ` ${text.toLowerCase().replace(/[^a-z]+/g, ' ')} `;
  return CITIES.find((city) => lower.includes(` ${city.toLowerCase()} `)) ?? null;
}

/** The fields of a map service's address, in the order that says most about the city. */
const CITY_FIELDS = ['city', 'town', 'village', 'municipality', 'county', 'district', 'state_district'] as const;

/**
 * The city for a place a map service described: a listed city its text names, else the listed city the pin is in,
 * else the service's own `city` (a real city we do not list), else '' (the person chooses). Never a guess such as
 * "Karachi".
 */
export function cityFromGeocoder(address: Partial<Record<string, string>> | null | undefined, lat: number, lng: number): string {
  const fields = CITY_FIELDS.map((key) => address?.[key]?.trim()).filter((value): value is string => !!value);
  for (const field of fields) {
    const named = cityFromName(field);
    if (named) return named;
  }
  const near = cityFromCoords(lat, lng);
  if (near) return near;
  return address?.city?.trim() ?? '';
}
