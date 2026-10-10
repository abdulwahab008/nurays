'use client';

import { useEffect } from 'react';

/**
 * On phones a table with many columns is turned into one card per row: every cell shows its column
 * name next to its value (see the `.stack-table` rules in globals.css). It marks the tables in the
 * page once they render and again when their rows change, so no table needs rewriting.
 */
export function StackedTables() {
  useEffect(() => {
    const mark = () => {
      document.querySelectorAll<HTMLTableElement>('main table').forEach((table) => {
        const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent || '').trim());
        if (heads.length < 3) return;
        table.classList.add('stack-table');
        table.querySelectorAll('tbody tr').forEach((row) => {
          Array.from(row.children).forEach((cell, i) => {
            const td = cell as HTMLElement;
            if (!td.hasAttribute('data-label') && heads[i] && (td as HTMLTableCellElement).colSpan <= 1) td.setAttribute('data-label', heads[i]);
          });
        });
      });
    };
    mark();
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        mark();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
