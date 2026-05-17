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

export const supabase = createClient(effectiveSupabaseUrl, effectiveSupabaseAnonKey);
