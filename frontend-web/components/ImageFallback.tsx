'use client';

import { useEffect } from 'react';

/**
 * A photo that fails to load (offline, expired link, blocked host) would show the browser's
 * broken-image icon and its alt text over the layout. This hides the broken <img> and lets its frame
 * show a soft placeholder instead (see `.img-failed` in globals.css). One listener covers every image.
 */
export function ImageFallback() {
  useEffect(() => {
    const onError = (event: Event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.failed) return;
      img.dataset.failed = '1';
      img.style.visibility = 'hidden';
      img.parentElement?.classList.add('img-failed');
    };
    document.addEventListener('error', onError, true);
    // Images that already failed before this ran (server-rendered, cached failure).
    document.querySelectorAll('img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0 && img.currentSrc) onError({ target: img } as unknown as Event);
    });
    return () => document.removeEventListener('error', onError, true);
  }, []);
  return null;
}
