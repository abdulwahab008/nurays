import { Community } from '../services/community.service';

/**
 * Smart Community Synonyms & Geofence Boundaries
 * Focused on core Lahore communities:
 * 1. Askari 11 (Bedian Road)
 * 2. Askari 10 (Cantt)
 * 3. DHA Phase 5
 * 4. DHA Phase 6
 * 5. DHA 9 Town (Shuhada Town)
 */
interface CommunityMatchRule {
  slug: string;
  primaryName: string;
  city: string;
  lat: number;
  lng: number;
  radiusKm: number;
  keywords: string[];
  patterns: RegExp[];
}

export const COMMUNITY_MATCH_RULES: CommunityMatchRule[] = [
  {
    slug: 'askari-11',
    primaryName: 'Askari 11',
    city: 'Lahore',
    lat: 31.4550,
    lng: 74.4500,
    radiusKm: 3.5,
    keywords: ['askari 11', 'askari xi', 'askari eleven', 'bedian', 'bedian road', 'sector a askari', 'sector b askari', 'sector c askari', 'al-fateh askari 11'],
    patterns: [/\baskari\s*(11|xi|eleven)\b/i, /\bbedian(\s*road)?\b/i],
  },
  {
    slug: 'askari-10',
    primaryName: 'Askari 10',
    city: 'Lahore',
    lat: 31.5200,
    lng: 74.4100,
    radiusKm: 3.5,
    keywords: ['askari 10', 'askari x', 'askari ten', 'airport road', 'cantt', 'saddar cantt', 'lahore cantt'],
    patterns: [/\baskari\s*(10|x|ten)\b/i, /\bairport\s*road\b/i],
  },
  {
    slug: 'dha-phase-6',
    primaryName: 'DHA Phase 6',
    city: 'Lahore',
    lat: 31.4650,
    lng: 74.4300,
    radiusKm: 4.5,
    keywords: ['dha phase 6', 'dha 6', 'phase 6', 'phase vi', 'raya', 'fairways', 'broadway commercial', 'main boulevard phase 6', 'sector c dha 6'],
    patterns: [/\b(dha\s*)?(phase\s*6|phase\s*vi|phase\s*six)\b/i, /\bdha\s*6\b/i, /\braya(\s*fairways)?\b/i],
  },
  {
    slug: 'dha-phase-5',
    primaryName: 'DHA Phase 5',
    city: 'Lahore',
    lat: 31.4700,
    lng: 74.4000,
    radiusKm: 4.0,
    keywords: ['dha phase 5', 'dha 5', 'phase 5', 'phase v', 'ring road phase 5', 'sector c phase 5', 'sector g phase 5', 'lalik jan'],
    patterns: [/\b(dha\s*)?(phase\s*5|phase\s*v|phase\s*five)\b/i, /\bdha\s*5\b/i],
  },
  {
    slug: 'dha-9-town',
    primaryName: 'DHA 9 Town',
    city: 'Lahore',
    lat: 31.4420,
    lng: 74.4550,
    radiusKm: 3.5,
    keywords: ['dha 9 town', 'dha 9', '9 town', 'phase 9 town', 'shuhada', 'shuhada town', 'sector a 9 town', 'sector b 9 town'],
    patterns: [/\b(dha\s*)?(9\s*town|phase\s*9|nine\s*town)\b/i, /\bshuhada(\s*town)?\b/i],
  },
  // Karachi communities (supported gracefully)
  {
    slug: 'gulshan-e-iqbal',
    primaryName: 'Gulshan-e-Iqbal',
    city: 'Karachi',
    lat: 24.9200,
    lng: 67.0900,
    radiusKm: 4.5,
    keywords: ['gulshan', 'gulshan-e-iqbal', 'block 4', 'block 13', 'disco bakery'],
    patterns: [/\bgulshan/i],
  },
  {
    slug: 'dha-karachi',
    primaryName: 'DHA Karachi',
    city: 'Karachi',
    lat: 24.8100,
    lng: 67.0700,
    radiusKm: 5.0,
    keywords: ['dha karachi', 'defence', 'phase 5 karachi', 'phase 6 karachi', 'khayaban'],
    patterns: [/\bdha\s*karachi/i, /\bdefence\b/i],
  },
  {
    slug: 'clifton',
    primaryName: 'Clifton',
    city: 'Karachi',
    lat: 24.8200,
    lng: 67.0300,
    radiusKm: 4.0,
    keywords: ['clifton', 'block 5', 'bilawal chowrangi', 'boat basin', 'seaview'],
    patterns: [/\bclifton\b/i, /\bboat\s*basin\b/i],
  },
  {
    slug: 'pechs',
    primaryName: 'PECHS',
    city: 'Karachi',
    lat: 24.8700,
    lng: 67.0600,
    radiusKm: 3.5,
    keywords: ['pechs', 'tariq road', 'khalid bin waleed', 'society'],
    patterns: [/\bpechs\b/i, /\btariq\s*road\b/i],
  },
];

/**
 * Calculates Great-Circle distance using Haversine formula in kilometers
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface SmartMatchResult {
  community: Community;
  confidence: number; // 0 to 1
  matchedBy: 'exact_slug' | 'pattern' | 'keyword' | 'gps_radius' | 'gps_nearest' | 'default';
  distanceKm?: number;
}

/**
 * Smart Location Resolver:
 * Resolves an address string, search query, or GPS coordinates to the best matching Community.
 */
export function resolveLocationSmart(
  input: { text?: string; lat?: number; lng?: number },
  availableCommunities: Community[]
): SmartMatchResult | null {
  if (!availableCommunities || availableCommunities.length === 0) return null;

  // 1. Text-based resolution (address string or search query)
  if (input.text && input.text.trim()) {
    const cleanText = input.text.trim().toLowerCase();

    // Check regex patterns first (highest precision)
    for (const rule of COMMUNITY_MATCH_RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(cleanText)) {
          const found = availableCommunities.find((c) => c.slug === rule.slug || c.id === rule.slug);
          if (found) {
            return {
              community: found,
              confidence: 0.95,
              matchedBy: 'pattern',
            };
          }
        }
      }
    }

    // Check keywords & synonyms
    for (const rule of COMMUNITY_MATCH_RULES) {
      for (const kw of rule.keywords) {
        if (cleanText.includes(kw) || kw.includes(cleanText)) {
          const found = availableCommunities.find((c) => c.slug === rule.slug || c.id === rule.slug);
          if (found) {
            return {
              community: found,
              confidence: 0.85,
              matchedBy: 'keyword',
            };
          }
        }
      }
    }

    // Direct community name or areaDescription match
    for (const c of availableCommunities) {
      const cName = c.name.toLowerCase();
      const cArea = (c.areaDescription || '').toLowerCase();
      if (cleanText.includes(cName) || cName.includes(cleanText) || (cArea && cArea.includes(cleanText))) {
        return {
          community: c,
          confidence: 0.75,
          matchedBy: 'keyword',
        };
      }
    }
  }

  // 2. GPS Coordinate Resolution
  if (typeof input.lat === 'number' && typeof input.lng === 'number' && !isNaN(input.lat) && !isNaN(input.lng)) {
    let closestCommunity: Community | null = null;
    let minDistance = Infinity;

    for (const comm of availableCommunities) {
      const dist = calculateHaversineDistanceKm(
        input.lat,
        input.lng,
        Number(comm.centerLatitude),
        Number(comm.centerLongitude)
      );

      if (dist < minDistance) {
        minDistance = dist;
        closestCommunity = comm;
      }
    }

    if (closestCommunity) {
      const radius = closestCommunity.radiusKm || 4.0;
      const isInside = minDistance <= radius;
      return {
        community: closestCommunity,
        confidence: isInside ? 0.95 : Math.max(0.4, 1 - minDistance / 20),
        matchedBy: isInside ? 'gps_radius' : 'gps_nearest',
        distanceKm: Math.round(minDistance * 10) / 10,
      };
    }
  }

  // Nothing to go on: no guess. The buyer chooses their area.
  return null;
}
