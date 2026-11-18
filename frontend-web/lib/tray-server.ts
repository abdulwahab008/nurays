import type { CartItem as ServerCartItem } from './services/cart.service';

interface TrayLine {
  id: string;
  productId: string;
  variantId?: string;
}

interface TrayApi {
  getCart: () => Promise<{ data?: { items?: ServerCartItem[] } | null }>;
  updateCartItem: (itemId: string, quantity: number) => Promise<unknown>;
  removeCartItem: (itemId: string) => Promise<unknown>;
}

/**
 * The line of the account's tray that a line of the browser's tray stands for. A dish added from the home page or a
 * dish page carries an id made up in the browser, so it is found by its dish (and variant) instead.
 */
export function serverLineFor(server: ServerCartItem[], line: TrayLine): ServerCartItem | undefined {
  return (
    server.find((s) => s.id === line.id) ??
    server.find((s) => s.product.id === line.productId && (s.variant?.id ?? undefined) === (line.variantId ?? undefined))
  );
}

/**
 * Sets how many of a line the account's tray holds (none removes it). Checkout orders the account's tray, so a change
 * made only in the browser would not be what is ordered.
 */
export async function writeTrayLine(api: TrayApi, line: TrayLine, quantity: number): Promise<void> {
  const serverLine = serverLineFor((await api.getCart()).data?.items ?? [], line);
  if (quantity <= 0) {
    if (serverLine) await api.removeCartItem(serverLine.id);
    return;
  }
  if (!serverLine) throw new Error('This dish is not in the tray any more');
  await api.updateCartItem(serverLine.id, quantity);
}
