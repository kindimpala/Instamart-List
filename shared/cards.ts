/** Structured UI payloads shared by server and client. */

export interface ListItem {
  spinId: string;
  productId: string;
  name: string;
  size: string;
  quantity: number;
  /** Unit offer price (₹) as returned by search_products when the item was saved. */
  price: number;
}

export interface GroceryList {
  id: string;
  badge: string; // L1, L2, ...
  name: string;
  items: ListItem[];
  budget: number | null;
  createdAt: string;
  updatedAt: string;
  lastOrderedAt: string | null;
}

export interface Alternative {
  spinId: string;
  productId: string;
  name: string;
  size: string;
  price: number;
  inStock: boolean;
}

export interface DraftItem extends ListItem {
  query: string;
  inStock: boolean;
  alternatives: Alternative[];
}

export interface BillLineView {
  label: string;
  value: string;
  kind: 'itemTotal' | 'handling' | 'delivery' | 'surge' | 'other';
}

export interface Bill {
  itemTotal: number | null;
  handlingFee: number | null;
  deliveryFee: number | null;
  deliveryFree: boolean;
  surgeFee: number | null;
  other: Array<{ label: string; value: string }>;
  toPay: number;
  toPayLabel: string;
  lines: BillLineView[];
}

export type BudgetSuggestion =
  | { kind: 'cheaper'; fromSpinId: string; toSpinId: string; name: string; fromLabel: string; toLabel: string; saving: number }
  | { kind: 'remove'; spinId: string; name: string; saving: number };

export interface BudgetStatus {
  limit: number;
  total: number;
  basis: 'estimate' | 'bill';
  over: boolean;
  remaining: number;
  suggestions: BudgetSuggestion[];
}

export interface Substitution {
  originalSpinId: string;
  originalName: string;
  originalSize: string;
  substitute: Alternative;
  quantity: number;
}

export interface PriceChange {
  spinId: string;
  name: string;
  size: string;
  oldPrice: number;
  newPrice: number;
}

export interface PreviewItem {
  spinId: string;
  name: string;
  size: string;
  quantity: number;
  lineTotal: number;
}

export interface OrderPreview {
  previewId: string;
  source: { kind: 'list' | 'draft'; id: string; name: string };
  items: PreviewItem[];
  address: { id: string; label: string; line: string };
  payment: string | null;
  bill: Bill;
  confirmToken: string;
  expiresAt: string;
  substitutions: Substitution[];
  priceChanges: PriceChange[];
  unavailable: Array<{ name: string; size: string; reason: string }>;
  warnings: string[];
  budget: BudgetStatus | null;
}

export type Card =
  | { type: 'found_items'; draftId: string; suggestedName: string; badge: string; items: DraftItem[]; estimatedTotal: number; notFound: string[]; budget: BudgetStatus | null }
  | { type: 'lists'; lists: GroceryList[] }
  | {
      type: 'diff';
      editId: string;
      listId: string;
      listName: string;
      rename: { from: string; to: string } | null;
      added: ListItem[];
      removed: ListItem[];
      changed: Array<{ item: ListItem; from: number; to: number }>;
      unchanged: ListItem[];
      budgetChange: { from: number | null; to: number | null } | null;
    }
  | { type: 'order_preview'; preview: OrderPreview }
  | { type: 'confirm_delete'; listId: string; listName: string; badge: string }
  | { type: 'notice'; tone: 'info' | 'success' | 'warning'; text: string }
  | { type: 'error'; message: string };

export interface ChatResponse {
  reply: string;
  cards: Card[];
  requestId: string;
}

export interface OrderResult {
  orderId: string;
  status: string;
  paymentMethod: string;
  total: number | null;
  addressLine: string | null;
  etaText: string | null;
  /** Service success message plus "Powered by Instamart" (text-only channel). */
  message: string;
  source: OrderPreview['source'];
  offerSaveAsList: boolean;
}

export interface TrackResult {
  orderId: string;
  statusMessage: string;
  subStatusMessage: string | null;
  etaText: string | null;
}

export interface SessionInfo {
  mode: 'stub' | 'staging' | 'production';
  signedIn: boolean;
  address: { id: string; label: string; line: string } | null;
  listCount: number;
  agent: 'llm' | 'rules';
}
