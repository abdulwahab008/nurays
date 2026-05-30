import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  setItems: (items: CartItem[]) => void;
  addItem: (item: CartItem) => void;
  updateItem: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
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
            item.id === id ? { ...item, quantity, subtotal: quantity * item.unitPrice } : item
          ),
        });
      },
      removeItem: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
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

