import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { cartService, type CartItem as ServerCartItem } from '../services/cart.service';

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productImage?: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
  unitPrice: number;
  stockType: 'direct' | 'hub';
  hubId?: string;
  subtotal: number;
}

interface CartState {
  items: CartItem[];
  appliedPromoCode: string | null;
  setItems: (items: CartItem[]) => void;
  addItem: (item: CartItem) => void;
  updateItem: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
  setAppliedPromoCode: (code: string | null) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      appliedPromoCode: null,
      setAppliedPromoCode: (code) => set({ appliedPromoCode: code }),
      setItems: (items) => set({ items }),
      addItem: (item) => {
        const existingItem = get().items.find(
          (i) => i.productId === item.productId && i.stockType === item.stockType && i.hubId === item.hubId
        );
        if (existingItem) {
          set({
            items: get().items.map((i) =>
              i.id === existingItem.id
                ? { ...i, quantity: i.quantity + item.quantity, subtotal: (i.quantity + item.quantity) * i.unitPrice }
                : i
            ),
          });
        } else {
          set({ items: [...get().items, item] });
        }
      },
      updateItem: (id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(id);
          return;
        }
        set({
          items: get().items.map((item) =>
            item.id === id || item.productId === id
              ? { ...item, quantity, subtotal: quantity * item.unitPrice }
              : item
          ),
        });
      },
      removeItem: (id) => {
        set({ items: get().items.filter((item) => item.id !== id && item.productId !== id) });
      },
      clearCart: () => {
        set({ items: [] });
      },
      getTotal: () => {
        return get().items.reduce((sum, item) => sum + item.subtotal, 0);
      },
      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);


/** The server's tray as the browser keeps it. */
export function trayFromServer(items: ServerCartItem[]): CartItem[] {
  return items.map((i) => ({
    id: i.id,
    productId: i.product.id,
    productName: i.product.name,
    productImage: i.product.image,
    sellerId: i.seller.id,
    sellerName: i.seller.businessName,
    quantity: i.quantity,
    unitPrice: i.variant?.price ?? i.product.price,
    stockType: i.stockType,
    hubId: i.hubId,
    subtotal: i.subtotal,
  }));
}

export type GuestTrayMerge =
  | { kind: 'done' }
  | {
      kind: 'conflict';
      /** The kitchen the dishes added before signing in come from. */
      guestKitchen: string;
      /** The kitchen the account's tray already holds. */
      accountKitchen: string;
      /** Replace the account's tray with the dishes added before signing in. */
      keepGuest: () => Promise<void>;
      /** Keep the account's tray; the dishes added before signing in are dropped. */
      keepAccount: () => void;
    };

async function readServerTray(): Promise<ServerCartItem[]> {
  return (await cartService.getCart()).data?.items ?? [];
}

async function addLines(lines: CartItem[], clearFirst: boolean): Promise<void> {
  for (const [n, line] of lines.entries()) {
    try {
      await cartService.addToCart({
        productId: line.productId,
        quantity: line.quantity,
        stockType: line.stockType || 'direct',
        hubId: line.hubId,
        clearAndAdd: clearFirst && n === 0 ? true : undefined,
      });
    } catch {
      // A dish that can no longer be ordered (sold out, off the menu) is left out; the rest still go in.
    }
  }
}

/**
 * Right after signing in: the dishes put in the tray while signed out (kept only in this browser) go into the account's
 * tray, so nothing is silently lost. When the account's tray already holds another kitchen's dishes the customer
 * chooses which to keep (one kitchen per order). Afterwards the browser's tray is the server's.
 */
export async function mergeGuestTray(): Promise<GuestTrayMerge> {
  const store = useCartStore.getState();
  let server: ServerCartItem[];
  try {
    server = await readServerTray();
  } catch {
    // The tray could not be read: the browser keeps what it has, and the tray page syncs it later.
    return { kind: 'done' };
  }
  // Lines that came from the server carry its ids; the rest were added while signed out.
  const added = store.items.filter((line) => !server.some((s) => s.id === line.id));
  const guest = added.filter((line) => line.sellerId === added[0]?.sellerId);
  const sync = async () => {
    try {
      useCartStore.getState().setItems(trayFromServer(await readServerTray()));
    } catch {
      // Keep what is there; the tray page reads the server again.
    }
  };

  if (guest.length === 0) {
    store.setItems(trayFromServer(server));
    return { kind: 'done' };
  }
  if (server.length === 0 || server[0].seller.id === guest[0].sellerId) {
    await addLines(guest, false);
    await sync();
    return { kind: 'done' };
  }
  return {
    kind: 'conflict',
    guestKitchen: guest[0].sellerName,
    accountKitchen: server[0].seller.businessName,
    keepGuest: async () => {
      await addLines(guest, true);
      await sync();
    },
    keepAccount: () => useCartStore.getState().setItems(trayFromServer(server)),
  };
}
