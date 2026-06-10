// First-party proxy to Supabase. Keeps auth/data requests on our own domain so
// ad-blockers / privacy extensions can't block them, while stripping cookies so
// Cloudflare's __cf_bm cookie can't accumulate first-party (which otherwise
// causes Vercel's REQUEST_HEADER_TOO_LARGE).
//
// Routed via vercel.json: /api/sb/<path>  ->  /api/proxy?__p=<path>
export const config = { runtime: 'edge' };

// Public Supabase project URL (same value as VITE_SUPABASE_URL / .env.example).
// Hardcoded so the edge function needs no Node types (process.env) at build time.
const SUPABASE_URL = 'https://ynqncdczpumsenjhcmxk.supabase.co';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // The Supabase sub-path comes from the rewrite (__p); fall back to the
  // pathname if the function is hit directly.
  const params = url.searchParams;
  let path = params.get('__p');
  params.delete('__p');
  if (path === null) {
    path = url.pathname.replace(/^\/api\/(sb|proxy)\/?/, '');
  }
  path = path.replace(/^\/+/, '');

  const query = params.toString();
  const target = `${SUPABASE_URL}/${path}${query ? `?${query}` : ''}`;

  const headers = new Headers(req.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('x-forwarded-host');

  const method = req.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();

  const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });

  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete('set-cookie');
  respHeaders.delete('content-encoding');
  respHeaders.delete('content-length');
  respHeaders.delete('transfer-encoding');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
