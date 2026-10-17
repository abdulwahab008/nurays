'use client';

import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { isNativeShell, openExternal } from '@/lib/open-external';

/**
 * A link to something outside the app (a maps app, a document, a legal page). On the web it is an ordinary link that
 * opens in a new tab, so it can be copied and middle-clicked; inside a native shell the tap is handed to the shell.
 */
export function ExternalLink({ href, onClick, children, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel'> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (!isNativeShell()) return; // the browser opens the new tab itself
    event.preventDefault();
    openExternal(href);
  };
  return (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer" onClick={handle}>
      {children}
    </a>
  );
}
