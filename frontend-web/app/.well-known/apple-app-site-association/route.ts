import { appLinkEnv, appLinksConfigured, appSiteAssociation } from '@/lib/app-links';

// Read from the server's environment on each request, not baked in at build time.
export const dynamic = 'force-dynamic';

/** The iOS app's association file: 404 until IOS_APP_IDS (TEAMID.bundle.id) is set. Apple wants plain JSON, with no redirect. */
export function GET() {
  const file = appSiteAssociation(appLinkEnv());
  if (!file) {
    if (appLinksConfigured(appLinkEnv()).ios) {
      console.warn('apple-app-site-association: IOS_APP_IDS is set but not valid (TEAMID.bundle.id, comma separated)');
    }
    return new Response('Not found', { status: 404 });
  }
  return Response.json(file, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
