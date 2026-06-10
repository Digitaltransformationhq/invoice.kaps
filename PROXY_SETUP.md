# Keeping login from getting blocked (first-party Supabase proxy)

Some ad-blockers and privacy extensions (uBlock Origin, Brave Shields, AdGuard),
as well as corporate proxies/VPNs and antivirus "web shields", block direct
requests to `*.supabase.co`. Because the **sign-in** endpoint is
`/auth/v1/token`, this shows up as `TypeError: Failed to fetch` on login while
sign-up (`/auth/v1/signup`) often still works.

The fix is to make the browser talk to **your own domain** instead of
`supabase.co`. Your server/host then forwards (reverse-proxies) those requests
to Supabase. Because the request is now first-party, blockers leave it alone.

## Development — already done

`vite.config.ts` proxies `/supabase-api` to your Supabase URL, and
`src/lib/supabase.ts` automatically uses that path in dev. Just run:

```bash
npm run dev
```

Login now goes to `http://localhost:5173/supabase-api/auth/v1/token` — first-party,
never blocked. No extra setup needed.

## Production

The app now defaults to the first-party `/supabase-api` path in **every**
environment, so all you need on the host is a rewrite that forwards that path to
Supabase. To force a direct connection instead (e.g. a host without a rewrite),
set `VITE_SUPABASE_PROXY_PATH=direct`.

### Vercel — already configured ✅

`vercel.json` (committed to the repo) contains the rewrite plus a SPA fallback:

```json
{
  "rewrites": [
    { "source": "/supabase-api/:path*", "destination": "https://ynqncdczpumsenjhcmxk.supabase.co/:path*" },
    { "source": "/((?!supabase-api/).*)", "destination": "/index.html" }
  ]
}
```

Just push/redeploy. Make sure your Supabase env vars
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are set in the Vercel project
settings as before — nothing else to change.

### Other hosts

Replace the target with your project URL (`https://ynqncdczpumsenjhcmxk.supabase.co`).

**Netlify** — create `public/_redirects`:

```
/supabase-api/*  https://ynqncdczpumsenjhcmxk.supabase.co/:splat  200
```

**Vercel** — create `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/supabase-api/:path*", "destination": "https://ynqncdczpumsenjhcmxk.supabase.co/:path*" }
  ]
}
```

**Cloudflare Pages** — add to `public/_redirects` (same as Netlify), or use a
Pages Function / Transform Rule pointing `/supabase-api/*` at the Supabase URL.

**Nginx** (self-hosted / VPS):

```nginx
location /supabase-api/ {
    proxy_pass https://ynqncdczpumsenjhcmxk.supabase.co/;
    proxy_set_header Host ynqncdczpumsenjhcmxk.supabase.co;
    proxy_ssl_server_name on;
    # WebSocket support for Supabase Realtime:
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

**Caddy**:

```
handle_path /supabase-api/* {
    reverse_proxy https://ynqncdczpumsenjhcmxk.supabase.co {
        header_up Host ynqncdczpumsenjhcmxk.supabase.co
    }
}
```

### The strongest option: a Supabase custom domain

If you control DNS, Supabase's **Custom Domains** add-on lets the project live at
e.g. `https://api.yourdomain.com`. Point `VITE_SUPABASE_URL` at it and the proxy
above becomes unnecessary — everything is first-party by default. See
https://supabase.com/docs/guides/platform/custom-domains

## How to verify

Open DevTools → Network, sign in, and confirm the request goes to
`yourdomain.com/supabase-api/auth/v1/token` and returns **200** — not to
`supabase.co`, and not `(blocked:other)`.
