import type { CapacitorConfig } from '@capacitor/cli';
import { IN_APP_HOSTS, resolveAppUrl } from './app-url';

const app = resolveAppUrl(process.env);
if (app.placeholder) {
  console.warn(`NURAY_APP_URL is not set: the app will open ${app.url}. Set it to the production website before a store build.`);
}

const config: CapacitorConfig = {
  appId: 'pk.nuray.app',
  appName: 'Nuray',
  // Only the page shown when the website cannot be reached lives in the app (server.errorPath).
  webDir: 'www',
  server: {
    url: app.url,
    cleartext: app.url.startsWith('http://'),
    allowNavigation: [app.hostname, ...IN_APP_HOSTS],
    errorPath: 'offline.html',
  },
  android: {
    // Content is never mixed: the website is https.
    allowMixedContent: false,
  },
  ios: {
    // Keeps the page clear of the notch and the home indicator.
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#FAFAFA',
      showSpinner: false,
    },
  },
};

export default config;
