import { describe, expect, it } from 'vitest';
import { handleStubRpc, parseFlags, type StubStateStore } from '../../stub/server';
import { buildCatalog, SEED_PRODUCT_COUNT } from '../../stub/catalog';
import { McpClient } from '../../server/core/mcp/client';
import { stubFetch } from '../../server/core/mcp/stubTransport';

function memStore(): StubStateStore {
  const m = new Map<string, unknown>();
  return { get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null) as any, set: async (k, v) => void m.set(k, structuredClone(v)) };
}

function client(flags = '', store = memStore()) {
  return new McpClient({ baseUrl: 'stub://instamart', token: 'stub_user_test', fetchImpl: stubFetch(store), extraHeaders: { 'x-stub-flags': flags } });
}

describe('stub seed data', () => {
  it('has 40+ products with spinIds, sizes, prices and multiple variants for staples', () => {
    const cat = buildCatalog();
    expect(SEED_PRODUCT_COUNT).toBeGreaterThanOrEqual(40);
    const multi = cat.filter((p) => p.variations.length > 1);
    expect(multi.length).toBeGreaterThan(20);
    for (const p of cat) for (const v of p.variations) {
      expect(v.spinId).toMatch(/^spin_/);
      expect(v.quantityDescription).toBeTruthy();
      expect(v.price.offerPrice).toBeGreaterThan(0);
    }
  });
});

describe('stub MCP server', () => {
  it('rejects calls without a bearer token like the real server', async () => {
    const res = await handleStubRpc({ body: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, store: memStore() });
    expect(res.status).toBe(401);
  });

  it('lists the Instamart tools', async () => {
    const names = (await client().listTools()).map((t) => t.name);
    for (const t of ['get_addresses', 'search_products', 'update_cart', 'get_cart', 'clear_cart', 'checkout', 'get_orders', 'track_order', 'your_go_to_items', 'report_error']) {
      expect(names).toContain(t);
    }
  });

  it('returns the saved Vikaspuri address in { success, data }', async () => {
    const r = await client().callTool<any>('get_addresses');
    expect(r.success).toBe(true);
    expect(r.data.addresses[0].addressLine).toBe('Home 2, Vikaspuri, Delhi');
  });

  it('searches with variations', async () => {
    const r = await client().callTool<any>('search_products', { query: 'milk', addressId: 'addr_stub_home2' });
    expect(r.success).toBe(true);
    expect(r.data.products.length).toBeGreaterThan(1);
    expect(r.data.products[0].variations[0].spinId).toBeTruthy();
  });

  it('applies the out-of-stock and price-change flags', async () => {
    const c = client('oos,price');
    const milk = await c.callTool<any>('search_products', { query: 'amul taaza' });
    const v = milk.data.products[0].variations.find((x: any) => x.quantityDescription === '500 ml');
    expect(v.isInStockAndAvailable).toBe(false);
    const bread = await c.callTool<any>('search_products', { query: 'britannia white bread' });
    expect(bread.data.products[0].variations[0].price.offerPrice).toBe(52);
  });

  it('builds a cart with a bill, removes OOS items, adds surge fee', async () => {
    const c = client('oos,surge');
    const r = await c.callTool<any>('update_cart', {
      selectedAddressId: 'addr_stub_home2',
      items: [
        { spinId: 'spin_milk-amul-taaza_0', quantity: 1 },
        { spinId: 'spin_eggs-farm_1', quantity: 1 },
      ],
    });
    expect(r.data.items).toHaveLength(1);
    expect(r.data.removedOutOfStockItems[0].spinId).toBe('spin_milk-amul-taaza_0');
    const labels = r.data.billBreakdown.lineItems.map((l: any) => l.label);
    expect(labels).toEqual(['Item Total', 'Handling Fee', 'Delivery Fee', 'Surge Fee']);
  });

  it('checks out, clears the cart and can be tracked with and without ETA', async () => {
    const store = memStore();
    const withEta = client('eta', store);
    await withEta.callTool('update_cart', { items: [{ spinId: 'spin_atta-aashirvaad_1', quantity: 1 }] });
    const co = await withEta.callTool<any>('checkout', { addressId: 'addr_stub_home2' });
    expect(co.success).toBe(true);
    expect(co.data.orderId).toMatch(/^IM/);
    expect(co.data.etaText).toBe('12 mins');
    const cart = await withEta.callTool<any>('get_cart');
    expect(cart.data.items).toHaveLength(0);

    const noEta = client('noeta', store);
    await noEta.callTool('update_cart', { items: [{ spinId: 'spin_atta-aashirvaad_1', quantity: 1 }] });
    const co2 = await noEta.callTool<any>('checkout', { addressId: 'addr_stub_home2' });
    expect(co2.data.etaText).toBeUndefined();
    const tr = await noEta.callTool<any>('track_order', { orderId: co2.data.orderId, lat: 0, lng: 0 });
    expect(tr.data.status.etaText).toBeUndefined();
  });

  it('refuses checkout of an empty cart', async () => {
    const r = await client().callTool<any>('checkout', { addressId: 'addr_stub_home2' });
    expect(r.success).toBe(false);
  });

  it('parses flags including the demo shortcut', () => {
    expect([...parseFlags('demo')].sort()).toEqual(['oos', 'price', 'surge']);
    expect(parseFlags('bogus').size).toBe(0);
  });
});
