// MPIN (4-digit quick sign-in) — client helpers.
//
// The PIN belongs to the ACCOUNT, not to the browser: it is bcrypt-hashed in
// public.user_mpins and verified by the `mpin-signin` Edge Function, which hands
// back a one-shot token the client trades for a session. So an owner sets their
// PIN once and it works on every device they ever sign in from.
//
// Nothing secret is kept on the device. localStorage only holds two conveniences:
// a "this browser has signed in before" flag (routing) and the last email used
// (prefilling the PIN screen).
//
// The previous design was the opposite — an encrypted credential vault in
// localStorage — which is why a PIN had to be re-created per device, and why it
// silently failed wherever Web Crypto is unavailable (any plain-http origin).
//
// Those old vaults are still useful exactly once: the PIN a long-standing user
// types is the key to the vault, so `unlockLegacyVault()` can recover the
// credentials inside and hand the same PIN to the account — upgrading them in
// place instead of making them pick a PIN again. The vault is deleted only after
// that succeeds (see `clearLegacyMpinVault`), since it holds a recoverable copy
// of the password. Decrypt-only: nothing here ever writes a vault.

const RETURNING_KEY = 'kaps-returning-user';
const EMAIL_KEY = 'kaps-mpin-email';
const LEGACY_VAULT_KEY = 'kaps-mpin-vault';
const PENDING_KEY = 'kaps-pending-mpin';

export function isValidMpin(mpin: string): boolean {
  return /^\d{4}$/.test(mpin);
}

// ---- "returning user" flag (controls landing-page vs sign-in routing) ----

export function isReturningUser(): boolean {
  try {
    return localStorage.getItem(RETURNING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markReturningUser(): void {
  try {
    localStorage.setItem(RETURNING_KEY, '1');
  } catch {}
}

export function clearReturningUser(): void {
  try {
    localStorage.removeItem(RETURNING_KEY);
  } catch {}
}

// ---- remembered email (prefill only — never a credential) ----

export function getRememberedEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY) || null;
  } catch {
    return null;
  }
}

export function rememberEmail(email: string): void {
  try {
    const trimmed = email.trim();
    if (trimmed) {
      localStorage.setItem(EMAIL_KEY, trimmed);
    }
  } catch {}
}

// ---- MPIN chosen at signup, applied after the first sign-in ----

/**
 * Signup collects an MPIN, but the PIN can only be stored once there is a
 * session (`set_user_mpin` runs as the signed-in user). When signup does not
 * hand back a session — email confirmation on — park the choice for this tab and
 * apply it right after the first successful password login.
 */
export function setPendingMpin(email: string, mpin: string): void {
  try {
    if (!isValidMpin(mpin) || !email.trim()) return;
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ email: email.trim().toLowerCase(), mpin }));
  } catch {}
}

export function takePendingMpin(email: string): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; mpin?: string };
    if (!parsed?.mpin || !isValidMpin(parsed.mpin)) return null;
    if ((parsed.email || '') !== email.trim().toLowerCase()) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return parsed.mpin;
  } catch {
    return null;
  }
}

export function clearPendingMpin(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

// ---- legacy device vault: one-time, in-place upgrade ----

interface LegacyVault {
  email: string;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64 ciphertext of { email, password }
}

function readLegacyVault(): LegacyVault | null {
  try {
    const raw = localStorage.getItem(LEGACY_VAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyVault;
    return parsed?.salt && parsed?.iv && parsed?.ct ? parsed : null;
  } catch {
    return null;
  }
}

export function hasLegacyMpinVault(): boolean {
  return readLegacyVault() !== null;
}

/**
 * Picks up the email from any pre-central vault so the PIN screen still greets
 * long-standing users by address. The vault itself is left in place — it is what
 * lets their existing PIN be upgraded without asking for a new one.
 */
export function adoptLegacyVaultEmail(): void {
  const vault = readLegacyVault();
  if (!vault) return;
  markReturningUser();
  if (vault.email && !getRememberedEmail()) {
    rememberEmail(vault.email);
  }
}

export function clearLegacyMpinVault(): void {
  try {
    localStorage.removeItem(LEGACY_VAULT_KEY);
  } catch {}
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Recovers the credentials from a pre-central vault using the MPIN that locked
 * it (AES-GCM + PBKDF2, as the old `saveMpinVault` wrote it). Returns null on a
 * wrong PIN, a missing vault, or where Web Crypto is unavailable — every one of
 * which just means "fall back to the password form".
 */
export async function unlockLegacyVault(
  mpin: string,
): Promise<{ email: string; password: string } | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle || !isValidMpin(mpin)) {
    return null;
  }

  const vault = readLegacyVault();
  if (!vault) return null;

  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(mpin),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBytes(vault.salt), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(vault.iv) },
      key,
      b64ToBytes(vault.ct),
    );

    const parsed = JSON.parse(new TextDecoder().decode(plaintext));
    if (!parsed?.email || !parsed?.password) return null;
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}
