/**
 * Instamart MCP payload types, transcribed from the Swiggy Builders Club reference
 * (https://mcp.swiggy.com/builders/docs/reference/instamart/). Only the fields this
 * app reads are typed strictly; everything else is optional, as the docs advise.
 */

export interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { message: string; code?: string };
}

/* get_addresses */
export interface Address {
  id: string;
  addressLine: string;
  phoneNumber: string;
  addressCategory?: string;
  addressTag?: string;
}
export interface AddressesData {
  addresses: Address[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean };
  resolution: {
    defaultAddressId?: string;
    resolutionSource: string;
    needsUserClarification: boolean;
    candidateAddressIds: string[];
  };
}

/* search_products / your_go_to_items */
export interface Variation {
  spinId: string;
  skuId: string;
  quantityDescription: string;
  displayName: string;
  brandName: string;
  price: { mrp: number; offerPrice: number; unitLevelPrice?: string };
  isInStockAndAvailable: boolean;
  imageUrl?: string;
  maxQuantity?: number;
  maxQuantityMessage?: string;
}
export interface SearchProduct {
  displayName: string;
  brand: string;
  inStock: boolean;
  isAvail: boolean;
  productId: string;
  parentProductId: string;
  variations: Variation[];
}
export interface SearchData {
  nextOffset: string;
  products: SearchProduct[];
  similarProducts?: SearchProduct[];
}

/* get_cart / update_cart */
export interface CartItem {
  spinId: string;
  skuId: string;
  productId: string;
  itemName: string;
  quantity: number;
  isInStockAndAvailable: boolean;
  mrp: number;
  discountedFinalPrice: number;
  itemVariant?: string;
  imageUrl?: string;
}
export interface BillLine {
  label: string;
  value: string;
}
export interface CartData {
  cartTotalAmount: string;
  items: CartItem[];
  billBreakdown: { lineItems: BillLine[]; toPay: BillLine };
  selectedAddress?: string;
  selectedAddressDetails?: { id: string; address: string; area?: string; name?: string };
  cartId?: string;
  cartWarning?: string;
  availablePaymentMethods?: string[];
  removedOutOfStockItems?: Array<{ spinId: string; itemName: string }>;
  reducedQuantityItems?: Array<{
    spinId: string;
    itemName: string;
    requestedQuantity: number;
    cappedQuantity: number;
    reason?: string;
  }>;
}

/* checkout (single-order shape) */
export interface CheckoutData {
  orderId: string;
  status: string;
  paymentMethod: string;
  cartTotal?: number;
  addressId?: string;
  deliveryAddress?: string;
  deliveryLabel?: string;
}

/* track_order */
export interface TrackData {
  orderId: string;
  orderTitle: string;
  orderSubtitle: string;
  status: { statusMessage: string; subStatusMessage?: string; etaMinutes?: number; etaText?: string };
  items: Array<{ name: string; quantity: number; price: string }>;
  itemCount: number;
  placedAt?: string;
  pollingIntervalSeconds: number;
}

/* get_orders */
export interface OrdersData {
  orders: Array<{
    orderId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    estimatedDeliveryTime?: string;
    itemCount: number;
    totalAmount: number;
    orderType: string;
    isActive: boolean;
    currentStatus: string;
    historyStatus: string;
    items: Array<{ name: string; quantity: number; itemId?: string }>;
  }>;
  hasMore: boolean;
}

export const INSTAMART_TOOLS = [
  'get_addresses',
  'search_products',
  'update_cart',
  'get_cart',
  'clear_cart',
  'checkout',
  'get_orders',
  'track_order',
  'your_go_to_items',
  'report_error',
] as const;
export type InstamartTool = (typeof INSTAMART_TOOLS)[number];
