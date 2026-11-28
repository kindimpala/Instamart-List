import { createContext, useContext } from 'react';
import type { Card, GroceryList, OrderPreview, OrderResult } from '../shared/cards';

export interface OrderStart {
  listId?: string;
  draftId?: string;
  label: string;
  budget?: number | null;
}

export interface AppActions {
  lists: GroceryList[];
  refreshLists(): Promise<void>;
  startOrder(input: OrderStart): void;
  showPreview(preview: OrderPreview): void;
  orderPlaced(order: OrderResult): void;
  prefill(text: string): void;
  send(text: string): void;
  pushBot(text: string, cards?: Card[]): void;
  toast(text: string): void;
  announce(text: string): void;
  openLists(): void;
}

export const AppCtx = createContext<AppActions | null>(null);
export function useApp(): AppActions {
  const v = useContext(AppCtx);
  if (!v) throw new Error('AppCtx missing');
  return v;
}
