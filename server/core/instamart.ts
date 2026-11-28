/**
 * Thin typed facade over the Instamart MCP tools. The only mode-specific bits are
 * the base URL, the bearer token and (stub only) the transport + scenario header.
 */
import type {
  Address,
  AddressesData,
  CartData,
  CheckoutData,
  SearchData,
  TrackData,
} from '../../shared/instamart.js';
import { getAccessToken } from './auth/oauth.js';
import { getConfig } from './config.js';
import { log } from './log.js';
import { McpAuthError, McpClient, McpToolError } from './mcp/client.js';
import { stubFetch } from './mcp/stubTransport.js';
import type { Storage } from './storage/index.js';

const EXPECTED_FAILURES = /out of stock|cart is empty|not serviceable|unserviceable|limit/i;

export class InstamartService {
  private addressCache: Address | null = null;
  constructor(private client: McpClient, private requestId: string) {}

  async call<T>(tool: string, args: Record<string, unknown> = {}, opts: { retryable?: boolean } = {}): Promise<T> {
    let env;
    try {
      env = await this.client.callTool<T>(tool, args, opts);
    } catch (e) {
      if (e instanceof McpAuthError) throw e;
      await this.report(tool, (e as Error).message);
      throw new McpToolError(tool, 'Instamart is not responding right now. Please try again in a moment.');
    }
    if (!env.success) {
      const message = env.error?.message ?? `${tool} failed`;
      if (!EXPECTED_FAILURES.test(message)) await this.report(tool, message);
      throw new McpToolError(tool, message);
    }
    return env.data as T;
  }

  /** Best-effort report_error so Swiggy can trace issues by request ID. */
  private async report(tool: string, message: string) {
    log.error('instamart.tool_failed', { tool, message, requestId: this.requestId });
    try {
      await this.client.callTool('report_error', {
        tool,
        errorMessage: message.slice(0, 500),
        flowDescription: 'Instamart Lists: list ordering',
        toolContext: { requestId: this.requestId },
      });
    } catch {
      /* never let reporting break the user flow */
    }
  }

  async getDefaultAddress(): Promise<Address> {
    if (this.addressCache) return this.addressCache;
    const data = await this.call<AddressesData>('get_addresses', {});
    const id = data.resolution?.defaultAddressId ?? data.addresses[0]?.id;
    const addr = data.addresses.find((a) => a.id === id) ?? data.addresses[0];
    if (!addr) throw new McpToolError('get_addresses', 'No saved delivery address on your Swiggy account. Add one in the Swiggy app first.');
    this.addressCache = addr;
    return addr;
  }

  search(query: string, addressId: string) {
    return this.call<SearchData>('search_products', { query, addressId });
  }
  updateCart(addressId: string, items: Array<{ spinId: string; quantity: number }>) {
    return this.call<CartData>('update_cart', { selectedAddressId: addressId, items });
  }
  getCart() {
    return this.call<CartData>('get_cart', {});
  }
  clearCart() {
    return this.call<unknown>('clear_cart', {});
  }
  async checkout(addressId: string, paymentMethod?: string): Promise<{ data: CheckoutData; message: string | null }> {
    // Never auto-retried: checkout is not idempotent.
    const env = await this.client.callTool<CheckoutData & { etaText?: string }>(
      'checkout',
      { addressId, ...(paymentMethod ? { paymentMethod } : {}) },
      { retryable: false },
    );
    if (!env.success) {
      const message = env.error?.message ?? 'Checkout failed';
      if (!EXPECTED_FAILURES.test(message)) await this.report('checkout', message);
      throw new McpToolError('checkout', message);
    }
    return { data: env.data!, message: env.message ?? null };
  }
  track(orderId: string, lat: number, lng: number) {
    return this.call<TrackData>('track_order', { orderId, lat, lng });
  }
}

export interface RequestCtx {
  uid: string;
  storage: Storage;
  requestId: string;
  stubFlags?: string | null;
}

export async function instamartFor(ctx: RequestCtx): Promise<InstamartService> {
  const cfg = getConfig();
  if (cfg.mode === 'stub') {
    const client = new McpClient({
      baseUrl: cfg.mcpBaseUrl,
      token: `stub_${ctx.uid}`,
      fetchImpl: stubFetch(ctx.storage),
      extraHeaders: ctx.stubFlags ? { 'x-stub-flags': ctx.stubFlags } : {},
      requestId: ctx.requestId,
    });
    return new InstamartService(client, ctx.requestId);
  }
  const token = await getAccessToken(ctx.storage, ctx.uid);
  return new InstamartService(new McpClient({ baseUrl: cfg.mcpBaseUrl, token, requestId: ctx.requestId }), ctx.requestId);
}
