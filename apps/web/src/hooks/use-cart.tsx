'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import useSWR from 'swr';
import type { CartDto } from '@tsh/shared';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';

/** Server-owned cart: every mutation returns the recomputed cart (totals are
 * always calculated server-side) and we swap the SWR cache for it. */

export type CartContextValue = {
  cart: CartDto | undefined;
  loading: boolean;
  itemCount: number;
  addItem: (input: { serviceId: string; quantity?: number; optionIds?: string[]; requirements?: string }) => Promise<void>;
  updateItem: (itemId: string, patch: { quantity?: number; optionIds?: string[]; requirements?: string | null }) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const { data, isLoading, mutate } = useSWR<CartDto>(
    user ? ['/cart', user.id] : null,
    () => api.get<CartDto>('/cart'),
    { revalidateOnFocus: false },
  );

  const apply = useCallback(
    async (action: () => Promise<CartDto>) => {
      const next = await action();
      await mutate(next, { revalidate: false });
    },
    [mutate],
  );

  const addItem: CartContextValue['addItem'] = useCallback(
    (input) =>
      apply(() =>
        api.post<CartDto>('/cart/items', {
          serviceId: input.serviceId,
          quantity: input.quantity ?? 1,
          optionIds: input.optionIds ?? [],
          ...(input.requirements ? { requirements: input.requirements } : {}),
        }),
      ),
    [apply],
  );

  const updateItem: CartContextValue['updateItem'] = useCallback(
    (itemId, patch) => apply(() => api.patch<CartDto>(`/cart/items/${itemId}`, patch)),
    [apply],
  );

  const removeItem: CartContextValue['removeItem'] = useCallback(
    (itemId) => apply(() => api.delete<CartDto>(`/cart/items/${itemId}`)),
    [apply],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart: data,
      loading: isLoading,
      itemCount: data?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0,
      addItem,
      updateItem,
      removeItem,
      refresh: async () => {
        await mutate(data, { revalidate: true });
      },
    }),
    [data, isLoading, addItem, updateItem, removeItem, mutate],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
