'use client';

import { useEffect, useState } from 'react';
import { isNativeShell } from '@/lib/open-external';

/**
 * Whether the page runs inside the Nuray store app. False on the server and in the first render (so both match), true
 * after that inside the app.
 */
export function useNativeShell(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    if (isNativeShell()) setNative(true);
  }, []);
  return native;
}
