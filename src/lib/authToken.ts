import { supabase } from './supabase';

// Supabase copies auth metadata (`user_metadata`) into every access token, and
// the token rides along on every request as the Authorization header. Anything
// large in there — historically the base64 company logo — pushes the header
// past the hosting edge's limit and the request is rejected with
// REQUEST_HEADER_TOO_LARGE before it reaches the server. So:
//
//   * nothing large is ever written to auth metadata (the logo goes straight to
//     public.companies, see savePendingCompanyLogo), and
//   * a session that still carries a fat token is slimmed on sign-in
//     (slimOversizedSession), for accounts created before this was fixed.
//
// supabase/sql/supabase_jwt_size_guard.sql enforces the same rule in the
// database, so it holds whatever the client does.

const PENDING_LOGO_KEY = 'kaps-pending-company-logo';

// Well under Vercel's header limit; a normal token is ~1 KB.
const MAX_HEALTHY_TOKEN_LENGTH = 8 * 1024;

/**
 * The logo picked at signup can only be saved once there is a session (the
 * companies update runs as the signed-in owner). When signup returns none —
 * email confirmation on — park it for the first sign-in. localStorage, not
 * sessionStorage: the confirmation link often opens in a new tab.
 */
export function setPendingCompanyLogo(email: string, logo: string): void {
  try {
    if (!logo || !email.trim()) return;
    localStorage.setItem(PENDING_LOGO_KEY, JSON.stringify({ email: email.trim().toLowerCase(), logo }));
  } catch {}
}

function takePendingCompanyLogo(email: string): string | null {
  try {
    const raw = localStorage.getItem(PENDING_LOGO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; logo?: string };
    if (!parsed?.logo || (parsed.email || '') !== email.trim().toLowerCase()) return null;
    localStorage.removeItem(PENDING_LOGO_KEY);
    return parsed.logo;
  } catch {
    return null;
  }
}

/** Writes the logo to the owner's company unless it already has one. */
async function saveCompanyLogoIfMissing(authUserId: string, logo: string): Promise<boolean> {
  const { error } = await supabase
    .from('companies')
    .update({ company_logo: logo })
    .eq('owner_auth_user_id', authUserId)
    .or('company_logo.is.null,company_logo.eq.');
  return !error;
}

/**
 * Saves the logo chosen at signup. With a session it goes straight to the
 * company; without one it is parked and applied by applyPendingCompanyLogo.
 */
export async function saveSignupCompanyLogo(
  email: string,
  logo: string,
  authUserId: string | null,
): Promise<void> {
  if (!logo) return;
  if (authUserId) {
    try {
      if (await saveCompanyLogoIfMissing(authUserId, logo)) return;
    } catch {
      /* fall through and retry after the first sign-in */
    }
  }
  setPendingCompanyLogo(email, logo);
}

/** Applies a logo parked at signup; returns it when it was saved. */
export async function applyPendingCompanyLogo(email: string, authUserId: string): Promise<string | null> {
  const logo = takePendingCompanyLogo(email);
  if (!logo) return null;
  try {
    if (await saveCompanyLogoIfMissing(authUserId, logo)) return logo;
  } catch {}
  setPendingCompanyLogo(email, logo);
  return null;
}

/**
 * Repairs a session whose access token is too large to send, which happens to
 * accounts whose logo was stored in auth metadata before the fix. Moves the
 * logo to the company, drops it from the metadata, and refreshes the session so
 * every later request carries a small token.
 *
 * The oversized requests here are replayed directly against Supabase by the
 * client's fetch wrapper when our own edge refuses them, which is what lets
 * this work at all. It never throws: a failure just leaves the session as it
 * was, and the database guard fixes the account on its own.
 */
export async function slimOversizedSession(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.access_token.length <= MAX_HEALTHY_TOKEN_LENGTH) {
      return;
    }

    const metadata = (session.user?.user_metadata || {}) as Record<string, unknown>;
    const logo = typeof metadata.company_logo === 'string' ? metadata.company_logo : '';
    if (logo) {
      await saveCompanyLogoIfMissing(session.user.id, logo);
    }

    const cleared: Record<string, null> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (key === 'company_logo' || JSON.stringify(value ?? '').length > 2048) {
        cleared[key] = null;
      }
    }
    if (Object.keys(cleared).length > 0) {
      await supabase.auth.updateUser({ data: cleared });
    }

    // Even if the update was refused, a refresh helps: once the database guard
    // has slimmed the stored metadata, the reissued token is small.
    await supabase.auth.refreshSession();
  } catch (error) {
    console.warn('Could not slim the session token:', error);
  }
}
