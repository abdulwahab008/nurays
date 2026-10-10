/**
 * The two files that tie this website to a store app, so that the Android app (a Trusted Web Activity) opens without a
 * browser bar and links to the site open the app: Digital Asset Links on Android and the apple-app-site-association file
 * on iOS. Neither is a secret, but both name the app (its package, its signing certificate, its team), which only exists
 * once the store accounts do, so they come from the environment of the web server and are 404 until it has them.
 */

export interface AppLinkEnv {
  /** Android package name, e.g. pk.nuray.app */
  ANDROID_APP_PACKAGE?: string;
  /** SHA-256 fingerprints of the app's signing certificates (the upload key and Play's app-signing key), comma separated */
  ANDROID_SHA256_CERT_FINGERPRINTS?: string;
  /** iOS app ids, TEAMID.bundle.id, comma separated */
  IOS_APP_IDS?: string;
}

/** The settings, read from the server's environment when asked (not when the app is built). */
export const appLinkEnv = (): AppLinkEnv => ({
  ANDROID_APP_PACKAGE: process.env.ANDROID_APP_PACKAGE,
  ANDROID_SHA256_CERT_FINGERPRINTS: process.env.ANDROID_SHA256_CERT_FINGERPRINTS,
  IOS_APP_IDS: process.env.IOS_APP_IDS,
});

const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const IOS_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*$/;

const list = (value?: string) => (value ?? '').split(',').map((part) => part.trim()).filter(Boolean);

/** Whether anything is set at all, so a half-filled or mistyped value can be told apart from "not configured". */
export function appLinksConfigured(env: AppLinkEnv): { android: boolean; ios: boolean } {
  return {
    android: Boolean(env.ANDROID_APP_PACKAGE?.trim() || env.ANDROID_SHA256_CERT_FINGERPRINTS?.trim()),
    ios: Boolean(env.IOS_APP_IDS?.trim()),
  };
}

/** `/.well-known/assetlinks.json`, or null while the package and at least one valid fingerprint are not both set. */
export function assetLinks(env: AppLinkEnv): object[] | null {
  const pkg = env.ANDROID_APP_PACKAGE?.trim() ?? '';
  const fingerprints = list(env.ANDROID_SHA256_CERT_FINGERPRINTS).map((f) => f.toUpperCase()).filter((f) => FINGERPRINT.test(f));
  if (!ANDROID_PACKAGE.test(pkg) || fingerprints.length === 0) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fingerprints },
    },
  ];
}

/**
 * `/.well-known/apple-app-site-association`, or null while no valid app id is set. Every path opens the app except
 * the API and the admin console, which belong in a browser.
 */
export function appSiteAssociation(env: AppLinkEnv): object | null {
  const appIDs = list(env.IOS_APP_IDS).filter((id) => IOS_APP_ID.test(id));
  if (appIDs.length === 0) return null;
  return {
    applinks: {
      details: [
        {
          appIDs,
          components: [{ '/': '/api/*', exclude: true }, { '/': '/admin/*', exclude: true }, { '/': '*' }],
        },
      ],
    },
  };
}
