# Invoice Software

GST invoicing for Indian businesses — invoices, delivery challans, credit/debit notes,
receipts, outstanding and GSTR-1 reporting. React + Vite + Tailwind on Supabase,
deployed to Vercel at [invoice.kapsca.in](https://invoice.kapsca.in).

Originally generated from [this Figma design](https://www.figma.com/design/HqWP2iPlalzO0XetHq9oAg/Invoice-Software).

## Running the code

```bash
npm i        # install dependencies
npm run dev  # start the dev server
npm run build # production build
```

Copy `.env.example` to `.env` for your own Supabase project; the client falls back to
built-in credentials if the variables are absent.

## Layout

```
src/
  app/components/    feature screens, one folder per module (invoices, receipts, …)
  contexts/          AuthContext — owner (Supabase Auth) and auditor (RPC) sessions
  lib/               shared helpers: PDF generation, MPIN quick sign-in, GSTIN, email
  styles/            Tailwind entry + the print/A4 stylesheet
api/proxy.ts         Vercel edge proxy — the browser reaches Supabase via /api/sb
supabase/
  config.toml        Supabase CLI config (Edge Function JWT overrides)
  functions/         Deno Edge Functions — send-invoice-email (AWS SES), mpin-signin
  sql/               schema and migration scripts, run by hand in the SQL editor
docs/                setup guides, plans and design notes
public/              PWA manifest, service worker, icons
```

### About `supabase/sql/`

These are standalone scripts applied through the Supabase SQL editor, **not** Supabase CLI
migrations. They are deliberately kept out of `supabase/migrations/`, because `supabase db
push` would otherwise run them in filename order — and several overlap or drop objects
(`supabase_fresh_start.sql` rebuilds from scratch). Read a script before running it.

## Documentation

| Document | What it covers |
| --- | --- |
| [docs/PASSWORD_RESET_SETUP.md](docs/PASSWORD_RESET_SETUP.md) | Owner password reset — the Supabase dashboard settings it needs |
| [docs/reset-password-email.html](docs/reset-password-email.html) | Branded template for the reset email |
| [docs/MPIN_SETUP.md](docs/MPIN_SETUP.md) | Account-level MPIN quick sign-in — SQL + Edge Function to deploy |
| `supabase/sql/supabase_owner_profile_repair.sql` | Fix "Profile not found" / "User already registered" — reinstalls the signup trigger and backfills half-created owners |
| [docs/PROXY_SETUP.md](docs/PROXY_SETUP.md) | Why traffic goes through `/api/sb` instead of `supabase.co` |
| [docs/AUDITOR_SYSTEM_SETUP.md](docs/AUDITOR_SYSTEM_SETUP.md) | Auditor accounts, permissions and multi-company access |
| [docs/QUICK_START_AUDITOR.md](docs/QUICK_START_AUDITOR.md) | Short version of the above |
| [docs/SETUP_CHECKLIST.md](docs/SETUP_CHECKLIST.md) | First-time Supabase setup, step by step |
| [docs/delivery-challans-plan.md](docs/delivery-challans-plan.md) | Design notes for the delivery challan module |
| [docs/GUIDELINES.md](docs/GUIDELINES.md) | UI and code guidelines |

`docs/` also holds several older Supabase integration write-ups
(`SUPABASE_INTEGRATION.md`, `SUPABASE_FIXED_INTEGRATION.md`, `SUPABASE_QUICK_START.md`,
`QUICK_SETUP.md`, `FIX_SUMMARY.md`, `AUDITOR_LOGIN_WORKING.md`, `AUDITOR_UI_COMPLETE.md`).
They overlap and contradict each other in places — they record how the integration evolved
rather than describing the current setup. Trust the code and the tables above first.
