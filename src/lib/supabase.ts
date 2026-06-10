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

// Route Supabase through a same-origin path so requests stay first-party and
// can't be blocked by ad-blockers / privacy extensions (the cause of
// "TypeError: Failed to fetch" on login for some users).
// - Dev: the Vite proxy (see vite.config.ts) forwards "/api/sb" to Supabase.
// - Prod: the edge function at api/sb/[...path].ts forwards it (and strips
//   cookies, which a plain rewrite cannot — that caused REQUEST_HEADER_TOO_LARGE).
// Defaults to the first-party path everywhere. Set VITE_SUPABASE_PROXY_PATH to
// "direct" to force a direct connection, or to a custom path if you proxy
// under a different route.
const configuredProxy = import.meta.env.VITE_SUPABASE_PROXY_PATH;
const proxyPath =
  configuredProxy === 'direct' ? '' : (configuredProxy && configuredProxy.trim()) || '/api/sb';

const clientUrl =
  proxyPath && typeof window !== 'undefined'
    ? `${window.location.origin}${proxyPath}`
    : effectiveSupabaseUrl;

export const supabase = createClient(clientUrl, effectiveSupabaseAnonKey);
