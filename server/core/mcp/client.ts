/**
 * Minimal MCP client over streamable HTTP (JSON-RPC 2.0). Mode-agnostic: it only
 * knows a base URL, a bearer token and a fetch implementation.
 */
import type { Envelope } from '../../../shared/instamart.js';
import { log } from '../log.js';

export class McpAuthError extends Error {
  constructor(message = 'Your Instamart session has expired. Please sign in again.') {
    super(message);
    this.name = 'McpAuthError';
  }
}
export class McpToolError extends Error {
  constructor(public tool: string, message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

export interface McpClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  extraHeaders?: Record<string, string>;
  requestId?: string;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Parses either an application/json body or a text/event-stream body. */
export async function readRpcBody(res: Response): Promise<any> {
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (!text) return null;
  if (type.includes('text/event-stream')) {
    const datas = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    for (let i = datas.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(datas[i]);
        if (parsed && ('result' in parsed || 'error' in parsed)) return parsed;
      } catch {
        /* keep scanning */
      }
    }
    return null;
  }
  return JSON.parse(text);
}

export class McpClient {
  private sessionId: string | null = null;
  private initialised = false;
  private seq = 0;
  private fetchImpl: typeof fetch;
  private sleep: (ms: number) => Promise<void>;

  constructor(private opts: McpClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private async post(body: unknown, retryable = true): Promise<any> {
    const max = retryable ? (this.opts.maxRetries ?? 3) : 0;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${this.opts.token}`,
        ...(this.opts.requestId ? { 'x-request-id': this.opts.requestId } : {}),
        ...(this.sessionId ? { 'mcp-session-id': this.sessionId } : {}),
        ...this.opts.extraHeaders,
      };
      const res = await this.fetchImpl(this.opts.baseUrl, { method: 'POST', headers, body: JSON.stringify(body) });
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;
      if (res.status === 401 || res.status === 419) throw new McpAuthError();
      if ((res.status === 429 || res.status >= 500) && attempt < max) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt;
        log.warn('mcp.retry', { status: res.status, attempt, wait, requestId: this.opts.requestId });
        await this.sleep(wait);
        continue;
      }
      if (res.status === 202) return null;
      if (!res.ok) throw new McpToolError('transport', `Instamart service returned HTTP ${res.status}`);
      const parsed = await readRpcBody(res);
      if (parsed?.error) {
        if (parsed.error.code === -32001) throw new McpAuthError();
        throw new McpToolError('rpc', parsed.error.message ?? 'MCP error');
      }
      return parsed?.result;
    }
  }

  private async ensureInit() {
    if (this.initialised) return;
    await this.post({
      jsonrpc: '2.0',
      id: ++this.seq,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'instamart-lists', version: '0.1.0' },
      },
    });
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    this.initialised = true;
  }

  async listTools(): Promise<Array<{ name: string }>> {
    await this.ensureInit();
    const r = await this.post({ jsonrpc: '2.0', id: ++this.seq, method: 'tools/list' });
    return r?.tools ?? [];
  }

  /**
   * Calls a tool and returns the `{ success, data }` envelope from structuredContent.
   * Non-idempotent tools (checkout) are never retried automatically.
   */
  async callTool<T>(name: string, args: Record<string, unknown> = {}, opts: { retryable?: boolean } = {}): Promise<Envelope<T>> {
    await this.ensureInit();
    const started = Date.now();
    const result = await this.post(
      { jsonrpc: '2.0', id: ++this.seq, method: 'tools/call', params: { name, arguments: args } },
      opts.retryable ?? true,
    );
    log.info('mcp.call', { tool: name, ms: Date.now() - started, requestId: this.opts.requestId });
    let env: Envelope<T> | undefined = result?.structuredContent;
    if (!env) {
      // Fallback: some servers only send text content containing the JSON envelope.
      const text = result?.content?.find((c: any) => c.type === 'text')?.text;
      try {
        env = text ? JSON.parse(text) : undefined;
      } catch {
        env = undefined;
      }
    }
    if (!env) env = result?.isError ? { success: false, error: { message: 'Tool failed' } } : { success: true, data: result as T };
    return env;
  }
}
