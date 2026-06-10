// First-party proxy to Supabase. The browser talks to our own Vercel domain
// (/api/sb/...), and this edge function forwards the request to Supabase from
// Vercel's servers. This is essential when the user's network/ISP can't reach
// supabase.co directly (the cause of "TypeError: Failed to fetch" on every
// device/network). Cookies are stripped both ways so Cloudflare's cookies can't
// become first-party and pile up (which previously caused REQUEST_HEADER_TOO_LARGE).
//
// Routed via vercel.json: /api/sb/<path>  ->  /api/proxy?__p=<path>
export const config = { runtime: 'edge' };

// Public Supabase project URL (same value as VITE_SUPABASE_URL / .env.example).
const SUPABASE_URL = 'https://ynqncdczpumsenjhcmxk.supabase.co';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

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
  respHeaders.set('x-debug-requrl', req.url);
  respHeaders.set('x-debug-target', target);
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
