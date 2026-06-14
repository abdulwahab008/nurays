import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Nuray is an API-driven app (Next.js SSR + a separate backend), so the native
 * shell loads the web app over the network rather than bundling a static export.
 *
 * Point it at the running web app via CAP_SERVER_URL, then `npx cap sync`:
 *   - Android emulator → http://10.0.2.2:3000   (use `npm run cap:android`)
 *   - iOS simulator    → http://localhost:3000  (use `npm run cap:ios`)
 *   - Physical device  → http://<your-LAN-IP>:3000
 *   - Production        → https://app.yourdomain.com
 *
 * With no CAP_SERVER_URL set it falls back to the bundled splash in mobile/www.
 */
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.nuray.app',
  appName: 'Nuray',
  webDir: 'mobile/www',
  backgroundColor: '#f6f6f7',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          // Allow http for local dev (10.0.2.2 / LAN IP). Use https in prod.
          cleartext: serverUrl.startsWith('http://'),
        },
      }
    : {}),
};

export default config;
