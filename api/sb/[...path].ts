// Edge proxy that keeps Supabase requests first-party (so ad-blockers / privacy
// extensions can't block login) WITHOUT letting cookies accumulate on our own
// domain. A plain vercel.json rewrite can't strip cookies, which caused
// "REQUEST_HEADER_TOO_LARGE": Supabase auth Set-Cookie responses were stored
// first-party and re-sent on every request until the header limit was exceeded.
//
// This function:
//   - forwards /api/sb/<path> -> <SUPABASE_URL>/<path>
//   - drops the inbound Cookie header (never send our cookies to Supabase)
//   - drops the outbound Set-Cookie header (never store Supabase cookies here)
export const config = { runtime: 'edge' };

const SUPABASE_URL = (
  process.env.VITE_SUPABASE_URL || 'https://ynqncdczpumsenjhcmxk.supabase.co'
).replace(/\/$/, '');

const PREFIX = '/api/sb';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const targetPath = url.pathname.startsWith(PREFIX)
    ? url.pathname.slice(PREFIX.length)
    : url.pathname;
  const target = `${SUPABASE_URL}${targetPath}${url.search}`;

  // Forward request headers, minus anything that bloats or leaks state.
  const headers = new Headers(req.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('x-forwarded-host');

  const method = req.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  // Strip cookies and encoding headers (fetch already decoded the body).
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
