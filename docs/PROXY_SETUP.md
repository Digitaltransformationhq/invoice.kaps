# Supabase connection notes

The app connects **directly** to Supabase (`VITE_SUPABASE_URL`). This is the
simplest, most reliable setup and is what `src/lib/supabase.ts` does.

## Background: why not a reverse proxy

We briefly routed Supabase through a same-origin path (`/api/sb` on Vercel) so
that ad-blockers / privacy extensions couldn't block the request. On Vercel that
backfired: Supabase sits behind Cloudflare, which sets a rotating `__cf_bm`
cookie. Proxied through our own domain, those cookies became first-party and
accumulated until Vercel rejected requests with `REQUEST_HEADER_TOO_LARGE`.
A cookie-stripping edge function fixed *new* sessions but couldn't clear cookies
already stored in a user's browser. So we reverted to a direct connection.

## If ad-blockers become a problem

The correct first-party fix — without the cookie issue — is a **Supabase custom
domain** (e.g. `api.yourdomain.com`). It's a real Supabase endpoint, so cookies
are handled natively (no accumulation), and because it's your own domain,
blockers leave it alone.

1. Enable the Custom Domains add-on in the Supabase dashboard.
2. Point `VITE_SUPABASE_URL` at the custom domain and redeploy.

Docs: https://supabase.com/docs/guides/platform/custom-domains

## Diagnosing "Failed to fetch" on login

That error means the browser couldn't reach Supabase at all — almost always a
local ad-blocker / privacy extension, VPN/proxy, or no connectivity. Check
DevTools → Network: if the `auth/v1/token` request shows `(blocked:other)` or
fails with no response, allowlist `*.supabase.co` (or use the custom domain
above). `src/contexts/AuthContext.tsx` surfaces a clear message for this case.
