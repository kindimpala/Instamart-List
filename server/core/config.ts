import { log } from './log.js';

export type SwiggyMode = 'stub' | 'staging' | 'production';

export interface AppConfig {
  mode: SwiggyMode;
  isProduction: boolean;
  anthropicApiKey: string | null;
  anthropicModel: string;
  sessionSecret: string;
  redirectUri: string;
  /** Instamart MCP endpoint. Stub mode uses an in-process loopback. */
  mcpBaseUrl: string;
  /** OAuth authorization server (discovery is read from here). */
  authBase: string;
  stubFlags: string;
  trackCoords: { lat: number; lng: number } | null;
  storage: 'file' | 'blobs';
}

const MCP_URLS: Record<SwiggyMode, string> = {
  stub: 'stub://instamart/im',
  staging: 'https://mcp-staging.swiggy.com/im',
  production: 'https://mcp.swiggy.com/im',
};

let cached: AppConfig | null = null;
let warnedSecret = false;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const env = process.env;
  const rawMode = (env.SWIGGY_MODE ?? 'stub').toLowerCase();
  const mode: SwiggyMode = rawMode === 'staging' || rawMode === 'production' ? rawMode : 'stub';
  const isProduction = env.NODE_ENV === 'production' || !!env.NETLIFY || env.CONTEXT === 'production';

  let sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) {
    if (mode !== 'stub' && isProduction) {
      throw new Error('SESSION_SECRET must be set (32+ chars) outside stub mode.');
    }
    sessionSecret = 'dev-only-insecure-session-secret-change-me-0000';
    if (!warnedSecret) {
      warnedSecret = true;
      log.warn('config.session_secret_default', { hint: 'Set SESSION_SECRET (32+ chars) for any shared deployment.' });
    }
  }

  const lat = Number(env.SWIGGY_TRACK_LAT);
  const lng = Number(env.SWIGGY_TRACK_LNG);

  cached = {
    mode,
    isProduction,
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
    sessionSecret,
    redirectUri: env.SWIGGY_REDIRECT_URI?.trim() || 'http://localhost:3000/auth/callback',
    mcpBaseUrl: env.SWIGGY_MCP_URL?.trim() || MCP_URLS[mode],
    authBase: (env.SWIGGY_AUTH_BASE?.trim() || 'https://mcp.swiggy.com').replace(/\/$/, ''),
    stubFlags: env.STUB_FLAGS ?? '',
    trackCoords: Number.isFinite(lat) && Number.isFinite(lng) && env.SWIGGY_TRACK_LAT ? { lat, lng } : null,
    storage: env.STORAGE === 'blobs' || (!!env.NETLIFY && env.STORAGE !== 'file') ? 'blobs' : 'file',
  };
  return cached;
}

/** Tests only. */
export function resetConfig() {
  cached = null;
}
