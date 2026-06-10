# Keeping login from getting blocked (first-party Supabase proxy)

Some ad-blockers and privacy extensions (uBlock Origin, Brave Shields, AdGuard),
as well as corporate proxies/VPNs and antivirus "web shields", block direct
requests to `*.supabase.co`. Because the **sign-in** endpoint is
`/auth/v1/token`, this shows up as `TypeError: Failed to fetch` on login while
sign-up (`/auth/v1/signup`) often still works.

The fix is to make the browser talk to **your own domain** instead of
`supabase.co`. Your server/host then forwards (reverse-proxies) those requests
to Supabase. Because the request is now first-party, blockers leave it alone.

## Why an edge function (not a plain rewrite)

A static `vercel.json` rewrite forwards Supabase's `Set-Cookie` responses to
your domain, where they're stored first-party and re-sent on every request until
the header exceeds Vercel's limit — `REQUEST_HEADER_TOO_LARGE`. The edge function
at `api/sb/[...path].ts` strips the inbound `Cookie` and outbound `Set-Cookie`
headers, so nothing accumulates.

## Development — already done

`vite.config.ts` proxies `/api/sb` to your Supabase URL, and
`src/lib/supabase.ts` automatically uses that path in dev. Just run:

```bash
npm run dev
```

Login now goes to `http://localhost:5173/api/sb/auth/v1/token` — first-party,
never blocked. No extra setup needed.

## Production (Vercel) — already configured ✅

The app defaults to the first-party `/api/sb` path in **every** environment, and
the edge function `api/sb/[...path].ts` forwards it to Supabase while stripping
cookies. Just push/redeploy — Vercel picks up the function automatically.

Make sure your Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
are set in the Vercel project settings as before. The function also reads
`VITE_SUPABASE_URL` at runtime (falling back to the project URL).

To force a direct connection instead (bypassing the proxy), set
`VITE_SUPABASE_PROXY_PATH=direct`.

### Other hosts

The edge function is Vercel-specific. On other platforms, run an equivalent
cookie-stripping proxy at `/api/sb/*`, or use a Supabase **custom domain**
(below), which removes the need for any proxy.

### The strongest option: a Supabase custom domain

If you control DNS, Supabase's **Custom Domains** add-on lets the project live at
e.g. `https://api.yourdomain.com`. Point `VITE_SUPABASE_URL` at it and the proxy
above becomes unnecessary — everything is first-party by default. See
https://supabase.com/docs/guides/platform/custom-domains

## How to verify

Open DevTools → Network, sign in, and confirm the request goes to
`yourdomain.com/api/sb/auth/v1/token` and returns **200** — not to
`supabase.co`, and not `(blocked:other)`.
