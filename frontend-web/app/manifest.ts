import type { MetadataRoute } from 'next';

/** Lets riders and customers "Add to Home Screen" and open Nuray like an app (no browser bar). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Nuray',
    short_name: 'Nuray',
    description: 'Home-cooked food from kitchens in your community',
    start_url: '/',
    scope: '/',
    categories: ['food', 'shopping'],
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAFAFA',
    theme_color: '#FF5500',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/brand/nuray-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
