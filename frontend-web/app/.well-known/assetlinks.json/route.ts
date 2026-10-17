import { appLinkEnv, appLinksConfigured, assetLinks } from '@/lib/app-links';

// Read from the server's environment on each request, not baked in at build time.
export const dynamic = 'force-dynamic';

/** Digital Asset Links for the Android app: 404 until ANDROID_APP_PACKAGE and ANDROID_SHA256_CERT_FINGERPRINTS are set. */
export function GET() {
  const links = assetLinks(appLinkEnv());
  if (!links) {
    if (appLinksConfigured(appLinkEnv()).android) {
      console.warn('assetlinks.json: ANDROID_APP_PACKAGE or ANDROID_SHA256_CERT_FINGERPRINTS is set but not valid (a package like pk.nuray.app, and SHA-256 fingerprints as AA:BB:...)');
    }
    return new Response('Not found', { status: 404 });
  }
  return Response.json(links, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
