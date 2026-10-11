import { notFound } from 'next/navigation';

// The page of one-click demo logins is its own file, loaded only in a build that switches the demo accounts on (next.config.ts
// sets NEXT_PUBLIC_DEMO_LOGIN). In any other build the condition is a constant false, the require is dropped, and the seeded
// e-mail addresses and the shared password are not in the JavaScript at all.
/* eslint-disable @typescript-eslint/no-require-imports */
const DevLogin: (() => React.JSX.Element) | null =
  process.env.NEXT_PUBLIC_DEMO_LOGIN === 'true' ? require('./DevLogin').default : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export default function DevLoginPage() {
  if (!DevLogin) notFound();
  return <DevLogin />;
}
