/**
 * A fetch implementation that delivers HTTP requests straight to the stub's
 * handler in-process. The MCP client still speaks real JSON-RPC over "HTTP";
 * only the transport hop is skipped (avoids a serverless function calling itself).
 */
import { handleStubRpc, type StubStateStore } from '../../../stub/server.js';

export function stubFetch(store: StubStateStore): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const out = await handleStubRpc({
      body,
      authorization: headers.get('authorization'),
      flagsHeader: headers.get('x-stub-flags'),
      store,
    });
    return new Response(out.body === null ? null : JSON.stringify(out.body), {
      status: out.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}
