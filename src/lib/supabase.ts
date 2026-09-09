import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const fallbackSupabaseUrl = 'https://ynqncdczpumsenjhcmxk.supabase.co';
const fallbackSupabaseAnonKey = 'sb_publishable_gZDEZe5HgReOgCGDueMAzg_VETlA0sh';

const effectiveSupabaseUrl = supabaseUrl || fallbackSupabaseUrl;
const effectiveSupabaseAnonKey = supabaseAnonKey || fallbackSupabaseAnonKey;

export const isSupabaseConfigured = Boolean(effectiveSupabaseUrl && effectiveSupabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Using local development fallback credentials.');
}

// Talk to Supabase through our own origin (/api/sb) instead of supabase.co
// directly. Many users' networks/ISPs can't reach supabase.co (causing
// "TypeError: Failed to fetch" on every device), but they CAN reach our Vercel
// domain — and Vercel's servers reach Supabase fine. The /api/sb edge function
// (api/proxy.ts) forwards the request and strips cookies.
// Set VITE_SUPABASE_PROXY_PATH=direct to force a direct connection.
const configuredProxy = import.meta.env.VITE_SUPABASE_PROXY_PATH;
const proxyPath =
  configuredProxy === 'direct' ? '' : (configuredProxy && configuredProxy.trim()) || '/api/sb';

const clientUrl =
  proxyPath && typeof window !== 'undefined'
    ? `${window.location.origin}${proxyPath}`
    : effectiveSupabaseUrl;

// Where the proxied requests actually point, so a request can be replayed
// straight at Supabase if our own edge refuses it.
const proxyPrefix =
  proxyPath && typeof window !== 'undefined' ? `${window.location.origin}${proxyPath}` : '';

function toDirectUrl(input: RequestInfo | URL): string | null {
  const href =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!proxyPrefix || !href.startsWith(proxyPrefix)) {
    return null;
  }
  return effectiveSupabaseUrl + href.slice(proxyPrefix.length);
}

const HEADER_TOO_LARGE = /REQUEST_HEADER_TOO_LARGE|header\w*\s+(?:fields\s+)?too\s+large/i;

/**
 * Vercel answers an oversized request with a 431 (or an HTML error page naming
 * REQUEST_HEADER_TOO_LARGE) from the edge, so there is no JSON to inspect.
 */
async function isHeaderTooLarge(response: Response): Promise<boolean> {
  if (response.status === 431 || response.status === 494) {
    return true;
  }
  if (response.ok || (response.headers.get('content-type') || '').includes('application/json')) {
    return false;
  }
  try {
    return HEADER_TOO_LARGE.test(await response.clone().text());
  } catch {
    return false;
  }
}

// Two defences against REQUEST_HEADER_TOO_LARGE, which locks a user out with the
// correct password and leaves no server log:
//
// 1. Never attach cookies. /api/sb is on our own origin, so the browser treats
//    every cookie set on the domain as first-party and sends the whole jar with
//    each request. Vercel's edge rejects oversized headers *before* api/proxy.ts
//    runs, so stripping them inside the proxy is too late. Supabase authenticates
//    with the apikey and Authorization headers alone and has no use for cookies.
//
// 2. Retry rejected requests directly against Supabase. The usual culprit is an
//    oversized JWT — signup put the base64 company logo into auth metadata, which
//    Supabase embeds in every access token — and Supabase's own edge accepts a
//    larger header than Vercel's. This rescues tokens in that band; a token far
//    past both limits still needs supabase/sql/supabase_fix_header_too_large.sql,
//    which strips the logo from auth metadata for good. If the direct hop fails
//    (the very ISP blocking that the proxy exists for), the original response is
//    returned unchanged.
const resilientFetch: typeof fetch = async (input, init) => {
  const request: RequestInit = { ...init, credentials: 'omit' };
  const response = await fetch(input, request);

  if (await isHeaderTooLarge(response)) {
    const direct = toDirectUrl(input);
    if (direct) {
      try {
        return await fetch(direct, request);
      } catch {
        return response;
      }
    }
  }

  return response;
};

export const supabase = createClient(clientUrl, effectiveSupabaseAnonKey, {
  global: { fetch: resilientFetch },
});
