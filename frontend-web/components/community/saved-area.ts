/**
 * Which delivery area a signed-in customer already told us about: the area they last chose (the server keeps it on their
 * profile as area and city) or the one their saved address is in. Matched the way the server matches an address to an area.
 */
export interface AreaLike {
  id: string;
  name: string;
  slug: string;
  city: string;
}

export interface AreaHint {
  communityId?: string | null;
  area?: string | null;
  city?: string | null;
}

const norm = (v?: string | null) => (v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function match<T extends AreaLike>(areas: T[], hint: AreaHint): T | null {
  if (hint.communityId) {
    const byId = areas.find((a) => a.id === hint.communityId);
    if (byId) return byId;
  }
  const area = norm(hint.area);
  if (!area) return null;
  const city = norm(hint.city);
  const inCity = city ? areas.filter((a) => norm(a.city) === city) : areas;
  const exact = inCity.find((a) => norm(a.name) === area || norm(a.slug) === area);
  if (exact) return exact;
  // "Askari 11 phase 2" is in Askari 11; "Askari 111" is not.
  const padded = ` ${area} `;
  return inCity.find((a) => norm(a.name).length > 0 && padded.includes(` ${norm(a.name)} `)) ?? null;
}

/** The first hint that names a known area wins; null when none does. */
export function findSavedArea<T extends AreaLike>(areas: T[], hints: AreaHint[]): T | null {
  for (const hint of hints) {
    const found = match(areas, hint);
    if (found) return found;
  }
  return null;
}

/**
 * The areas grouped by city for the picker: the customer's own city first (the chosen area's, else their profile's),
 * then the city with the most kitchens. Areas keep the server's order inside a city.
 */
export function groupAreasByCity<T extends AreaLike & { sellerCount?: number }>(
  areas: T[],
  preferredCity?: string | null,
): Array<{ city: string; areas: T[] }> {
  const groups = new Map<string, T[]>();
  for (const a of areas) {
    const list = groups.get(a.city) ?? [];
    list.push(a);
    groups.set(a.city, list);
  }
  const kitchens = (list: T[]) => list.reduce((n, a) => n + (a.sellerCount ?? 0), 0);
  const preferred = norm(preferredCity);
  return [...groups.entries()]
    .map(([city, list]) => ({ city, areas: list }))
    .sort((a, b) => {
      const pa = preferred && norm(a.city) === preferred ? 1 : 0;
      const pb = preferred && norm(b.city) === preferred ? 1 : 0;
      return pb - pa || kitchens(b.areas) - kitchens(a.areas) || a.city.localeCompare(b.city);
    });
}
