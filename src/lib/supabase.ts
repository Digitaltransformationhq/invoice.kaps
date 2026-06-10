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

// Connect directly to Supabase. (A same-origin proxy was tried to dodge
// ad-blockers, but on Vercel it made Cloudflare's cookies first-party and they
// accumulated until requests were rejected with REQUEST_HEADER_TOO_LARGE.)
// The proper first-party option without that downside is a Supabase custom
// domain — see PROXY_SETUP.md.
export const supabase = createClient(effectiveSupabaseUrl, effectiveSupabaseAnonKey);
