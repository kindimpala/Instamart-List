/**
 * Local fake of the Swiggy Instamart MCP server (JSON-RPC 2.0 over HTTP, the
 * same wire format as https://mcp.swiggy.com/im). Runs with no credentials.
 *
 * Scenario flags (comma-separated, via STUB_FLAGS env or the X-Stub-Flags header):
 *   oos    - Amul Taaza 500 ml is out of stock
 *   price  - Britannia White Bread 400 g changes from ₹49 to ₹52
 *   surge  - bill includes a surge fee
 *   eta    - checkout/track always include an ETA
 *   noeta  - checkout/track never include an ETA (default: alternates per order)
 */
import type {
  AddressesData,
  CartData,
  CartItem,
  Envelope,
  SearchData,
  SearchProduct,
} from '../shared/instamart.js';
import { buildCatalog, PRODUCT_TAGS, SCENARIO_TARGETS } from './catalog.js';

export type StubFlag = 'oos' | 'price' | 'surge' | 'eta' | 'noeta';
const ALL_FLAGS: StubFlag[] = ['oos', 'price', 'surge', 'eta', 'noeta'];

export function parseFlags(...sources: Array<string | undefined | null>): Set<StubFlag> {
  const out = new Set<StubFlag>();
  for (const src of sources) {
    for (const raw of (src ?? '').split(',')) {
      const f = raw.trim().toLowerCase();
      if (f === 'demo') ['oos', 'price', 'surge'].forEach((x) => out.add(x as StubFlag));
      else if ((ALL_FLAGS as string[]).includes(f)) out.add(f as StubFlag);
    }
  }
  return out;
}

/** Minimal key/value persistence so the stub survives serverless cold starts. */
export interface StubStateStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

interface StubUserState {
  cart: Array<{ spinId: string; quantity: number }>;
  orders: Array<{
    orderId: string;
    createdAt: string;
    items: Array<{ name: string; quantity: number; price: number; spinId: string }>;
    total: number;
    etaText?: string;
    etaMinutes?: number;
  }>;
  orderSeq: number;
}

const HOME_ADDRESS = {
  id: 'addr_stub_home2',
  addressLine: 'Home 2, Vikaspuri, Delhi',
  phoneNumber: '******1234',
  addressCategory: 'Home',
  addressTag: 'Home 2',
};
const HOME_COORDS = { lat: 28.6389, lng: 77.0738 };

const HANDLING_FEE = 9;
const FREE_DELIVERY_THRESHOLD = 199;
const DELIVERY_FEE = 30;
const MAX_QTY = 10;

const rupees = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

function catalogFor(flags: Set<StubFlag>): SearchProduct[] {
  const cat = buildCatalog();
  for (const p of cat) {
    for (const v of p.variations) {
      if (flags.has('oos') && v.spinId === SCENARIO_TARGETS.outOfStock) v.isInStockAndAvailable = false;
      if (flags.has('price') && v.spinId === SCENARIO_TARGETS.priceChange.spinId) {
        v.price = { ...v.price, offerPrice: SCENARIO_TARGETS.priceChange.newOffer };
      }
    }
    p.inStock = p.variations.some((v) => v.isInStockAndAvailable);
    p.isAvail = p.inStock;
  }
  return cat;
}

function findVariation(cat: SearchProduct[], spinId: string) {
  for (const p of cat) {
    const v = p.variations.find((x) => x.spinId === spinId);
    if (v) return { product: p, variation: v };
  }
  return null;
}

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function searchCatalog(cat: SearchProduct[], query: string): SearchProduct[] {
  const q = normalise(query);
  if (!q) return [];
  const words = q.split(' ').filter((w) => w.length > 1);
  const scored = cat
    .map((p) => {
      const tags = PRODUCT_TAGS[p.productId] ?? [];
      const hay = normalise(`${p.displayName} ${p.brand} ${tags.join(' ')}`);
      let score = 0;
      if (tags.some((t) => normalise(t) === q)) score += 10;
      for (const w of words) {
        const singular = w.endsWith('s') ? w.slice(0, -1) : w;
        if (hay.includes(w)) score += 3;
        else if (singular.length > 2 && hay.includes(singular)) score += 2;
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.p);
}

function buildCart(state: StubUserState, flags: Set<StubFlag>): CartData {
  const cat = catalogFor(flags);
  const items: CartItem[] = [];
  for (const line of state.cart) {
    const hit = findVariation(cat, line.spinId);
    if (!hit) continue;
    items.push({
      spinId: hit.variation.spinId,
      skuId: hit.variation.skuId,
      productId: hit.product.productId,
      itemName: hit.product.displayName,
      itemVariant: hit.variation.quantityDescription,
      quantity: line.quantity,
      isInStockAndAvailable: hit.variation.isInStockAndAvailable,
      mrp: hit.variation.price.mrp,
      discountedFinalPrice: hit.variation.price.offerPrice * line.quantity,
    });
  }
  const itemTotal = items.reduce((s, i) => s + i.discountedFinalPrice, 0);
  const lineItems = [{ label: 'Item Total', value: rupees(itemTotal) }];
  let toPay = itemTotal;
  if (items.length) {
    lineItems.push({ label: 'Handling Fee', value: rupees(HANDLING_FEE) });
    toPay += HANDLING_FEE;
    if (itemTotal >= FREE_DELIVERY_THRESHOLD) lineItems.push({ label: 'Delivery Fee', value: 'FREE' });
    else {
      lineItems.push({ label: 'Delivery Fee', value: rupees(DELIVERY_FEE) });
      toPay += DELIVERY_FEE;
    }
    if (flags.has('surge')) {
      lineItems.push({ label: 'Surge Fee', value: rupees(SCENARIO_TARGETS.surgeFee) });
      toPay += SCENARIO_TARGETS.surgeFee;
    }
  }
  return {
    cartTotalAmount: rupees(toPay),
    items,
    billBreakdown: { lineItems, toPay: { label: 'To Pay', value: rupees(toPay) } },
    selectedAddress: HOME_ADDRESS.id,
    selectedAddressDetails: { id: HOME_ADDRESS.id, address: HOME_ADDRESS.addressLine, area: 'Vikaspuri', name: 'Home 2' },
    cartId: items.length ? `cart_stub_${items.length}_${toPay}` : undefined,
    availablePaymentMethods: ['Cash'],
  };
}

type ToolResult = Envelope<unknown>;
const ok = (data: unknown, message?: string): ToolResult => ({ success: true, data, ...(message ? { message } : {}) });
const fail = (message: string): ToolResult => ({ success: false, error: { message } });

function etaFor(flags: Set<StubFlag>, seq: number): { etaText?: string; etaMinutes?: number } {
  const include = flags.has('eta') ? true : flags.has('noeta') ? false : seq % 2 === 1;
  return include ? { etaMinutes: 12, etaText: '12 mins' } : {};
}

async function callTool(
  name: string,
  args: Record<string, any>,
  userKey: string,
  flags: Set<StubFlag>,
  store: StubStateStore,
): Promise<ToolResult> {
  const key = `stub/${userKey}`;
  const state: StubUserState = (await store.get<StubUserState>(key)) ?? { cart: [], orders: [], orderSeq: 0 };
  const save = () => store.set(key, state);

  switch (name) {
    case 'get_addresses': {
      const data: AddressesData = {
        addresses: [HOME_ADDRESS],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasMore: false },
        resolution: {
          defaultAddressId: HOME_ADDRESS.id,
          resolutionSource: 'ranked_saved_address',
          needsUserClarification: false,
          candidateAddressIds: [HOME_ADDRESS.id],
        },
      };
      return ok(data);
    }
    case 'search_products': {
      if (typeof args.query !== 'string' || !args.query.trim()) return fail('query is required');
      const cat = catalogFor(flags);
      const results = searchCatalog(cat, args.query);
      const offset = Number(args.offset ?? 0) || 0;
      const page = results.slice(offset, offset + 6);
      const data: SearchData = {
        nextOffset: String(offset + page.length),
        products: page,
        similarProducts: results.slice(offset + 6, offset + 9),
      };
      return ok(data);
    }
    case 'your_go_to_items': {
      const cat = catalogFor(flags);
      const spins = [...new Set(state.orders.flatMap((o) => o.items.map((i) => i.spinId)))];
      const products = spins.map((s) => findVariation(cat, s)?.product).filter(Boolean) as SearchProduct[];
      return ok({ nextOffset: String(products.length), products });
    }
    case 'update_cart': {
      if (!Array.isArray(args.items)) return fail('items must be an array');
      const cat = catalogFor(flags);
      const removed: Array<{ spinId: string; itemName: string }> = [];
      const reduced: CartData['reducedQuantityItems'] = [];
      const next: StubUserState['cart'] = [];
      for (const it of args.items) {
        if (!it || typeof it.spinId !== 'string' || !(Number(it.quantity) > 0)) continue;
        const hit = findVariation(cat, it.spinId);
        if (!hit) return fail(`Unknown spinId ${it.spinId}`);
        if (!hit.variation.isInStockAndAvailable) {
          removed.push({ spinId: it.spinId, itemName: hit.product.displayName });
          continue;
        }
        let qty = Math.floor(Number(it.quantity));
        if (qty > MAX_QTY) {
          reduced.push({ spinId: it.spinId, itemName: hit.product.displayName, requestedQuantity: qty, cappedQuantity: MAX_QTY, reason: 'Max quantity per order' });
          qty = MAX_QTY;
        }
        next.push({ spinId: it.spinId, quantity: qty });
      }
      state.cart = next;
      await save();
      const cart = buildCart(state, flags);
      return ok({
        ...cart,
        ...(removed.length ? { removedOutOfStockItems: removed } : {}),
        ...(reduced.length ? { reducedQuantityItems: reduced } : {}),
      });
    }
    case 'get_cart':
      return ok(buildCart(state, flags));
    case 'clear_cart':
      state.cart = [];
      await save();
      return ok({ cleared: true }, 'Cart cleared');
    case 'checkout': {
      if (args.addressId !== HOME_ADDRESS.id) return fail('addressId must come from get_addresses');
      const cart = buildCart(state, flags);
      if (!cart.items.length) return fail('Cart is empty');
      if (cart.items.some((i) => !i.isInStockAndAvailable)) return fail('Item out of stock at this address');
      state.orderSeq += 1;
      const orderId = `IM${String(700000 + state.orderSeq * 37).padStart(9, '0')}`;
      const eta = etaFor(flags, state.orderSeq);
      const total = Number(cart.billBreakdown.toPay.value.replace(/[^0-9.]/g, ''));
      state.orders.unshift({
        orderId,
        createdAt: new Date().toISOString(),
        items: cart.items.map((i) => ({ name: `${i.itemName} ${i.itemVariant ?? ''}`.trim(), quantity: i.quantity, price: i.discountedFinalPrice, spinId: i.spinId })),
        total,
        ...eta,
      });
      state.cart = [];
      await save();
      return ok(
        {
          orderId,
          status: 'CONFIRMED',
          paymentMethod: args.paymentMethod ?? 'Cash',
          cartTotal: total,
          addressId: HOME_ADDRESS.id,
          deliveryAddress: HOME_ADDRESS.addressLine,
          deliveryLabel: HOME_ADDRESS.addressTag,
          // Stub-only extension so the UI is exercised with and without an ETA.
          ...(eta.etaText ? { etaText: eta.etaText } : {}),
        },
        'Instamart order placed successfully',
      );
    }
    case 'get_orders': {
      const orders = state.orders.slice(0, Number(args.count ?? 10)).map((o) => ({
        orderId: o.orderId,
        status: 'CONFIRMED',
        createdAt: o.createdAt,
        updatedAt: o.createdAt,
        itemCount: o.items.length,
        totalAmount: o.total,
        orderType: 'INSTAMART',
        isActive: true,
        currentStatus: 'CONFIRMED',
        historyStatus: 'ACTIVE',
        items: o.items.map((i) => ({ name: i.name, quantity: i.quantity })),
        ...(o.etaText ? { estimatedDeliveryTime: o.etaText } : {}),
      }));
      return ok({ orders: args.activeOnly ? orders.filter((o) => o.isActive) : orders, hasMore: false });
    }
    case 'track_order': {
      const order = state.orders.find((o) => o.orderId === args.orderId);
      if (!order) return fail('Order not found');
      return ok({
        orderId: order.orderId,
        orderTitle: 'Instamart order',
        orderSubtitle: `${order.items.length} items`,
        status: {
          statusMessage: 'Order confirmed',
          subStatusMessage: 'Your items are being packed',
          ...(order.etaMinutes ? { etaMinutes: order.etaMinutes, etaText: order.etaText } : {}),
        },
        deliveryInfo: { addressLabel: HOME_ADDRESS.addressTag, fullAddress: HOME_ADDRESS.addressLine },
        items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, price: rupees(i.price) })),
        itemCount: order.items.length,
        placedAt: order.createdAt,
        pollingIntervalSeconds: 30,
      });
    }
    case 'report_error':
      if (!args.tool || !args.errorMessage) return fail('tool and errorMessage are required');
      return ok({
        mailto: 'mailto:builders@swiggy.in',
        summary: { subject: `[stub] ${args.tool} error`, body: String(args.errorMessage) },
      });
    default:
      return fail(`Unknown tool: ${name}`);
  }
}

const TOOL_LIST = [
  'get_addresses', 'search_products', 'your_go_to_items', 'update_cart', 'get_cart',
  'clear_cart', 'checkout', 'get_orders', 'track_order', 'report_error',
].map((name) => ({ name, description: `Stub of Instamart ${name}`, inputSchema: { type: 'object' } }));

export interface StubRequest {
  body: any;
  authorization?: string | null;
  flagsHeader?: string | null;
  store: StubStateStore;
}
export interface StubResponse {
  status: number;
  body: any;
}

/** HTTP entry point. Returns a JSON-RPC response (or 401 like the real server). */
export async function handleStubRpc(req: StubRequest): Promise<StubResponse> {
  const auth = req.authorization ?? '';
  const m = /^Bearer\s+(stub_[A-Za-z0-9_-]{4,})$/.exec(auth);
  if (!m) return { status: 401, body: { error: 'invalid_token', error_description: 'Cannot resolve session' } };
  const userKey = m[1];
  const flags = parseFlags(process.env.STUB_FLAGS, req.flagsHeader);
  const { id = null, method, params } = req.body ?? {};
  const reply = (result: unknown) => ({ status: 200, body: { jsonrpc: '2.0', id, result } });

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'instamart-stub', version: '1.0.0' },
      });
    case 'notifications/initialized':
      return { status: 202, body: null };
    case 'tools/list':
      return reply({ tools: TOOL_LIST });
    case 'tools/call': {
      const name = params?.name;
      const args = params?.arguments ?? {};
      const result = await callTool(String(name), args, userKey, flags, req.store);
      return reply({
        content: [{ type: 'text', text: result.success ? (result.message ?? `${name} ok`) : result.error!.message }],
        structuredContent: result,
        isError: !result.success,
      });
    }
    default:
      return { status: 200, body: { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } } };
  }
}

export const STUB_HOME = { ...HOME_ADDRESS, ...HOME_COORDS };
