/**
 * Map tiles. The default is the public OpenStreetMap server, fine for development and light use only:
 * its policy forbids heavy or commercial traffic. For production point NEXT_PUBLIC_MAP_TILE_URL at a
 * tile provider you have an account with (MapTiler, Stadia, Mapbox, a self-hosted server...) and set
 * NEXT_PUBLIC_MAP_ATTRIBUTION to the text that provider requires.
 */
export const MAP_TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const MAP_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const MAP_MAX_ZOOM = 19;
