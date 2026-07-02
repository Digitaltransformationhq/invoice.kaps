// MPIN (quick sign-in PIN) credential vault.
//
// To let a returning user sign in with a 4-digit MPIN — even after the Supabase
// session has expired — we keep their credentials on the device, encrypted with
// a key derived from the MPIN itself (AES-GCM + PBKDF2). Only the correct MPIN
// can decrypt the bundle, after which we replay it through the normal login().
//
// This is device-local only. It never leaves the browser.

const VAULT_KEY = 'kaps-mpin-vault';
const RETURNING_KEY = 'kaps-returning-user';

/** Default MPIN provisioned for existing users on their next email/password login. */
export const DEFAULT_MPIN = '9999';

interface VaultData {
  email: string; // kept in clear so the sign-in screen can greet/prefill
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64 ciphertext of { email, password }
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

// ---- vault accessors ----

export function hasMpinVault(): boolean {
  try {
    return Boolean(localStorage.getItem(VAULT_KEY));
  } catch {
    return false;
  }
}

export function getVaultEmail(): string | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as VaultData).email || null;
  } catch {
    return null;
  }
}

export function clearMpinVault(): void {
  try {
    localStorage.removeItem(VAULT_KEY);
  } catch {}
}

export function isValidMpin(mpin: string): boolean {
  return /^\d{4}$/.test(mpin);
}

// ---- crypto helpers ----

function cryptoReady(): boolean {
  return typeof crypto !== 'undefined' && Boolean(crypto.subtle);
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(mpin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(mpin),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt the credentials under the given MPIN and persist them on the device.
 * Silently no-ops if Web Crypto is unavailable (e.g. an insecure context) — the
 * caller's email/password flow still works, MPIN just won't be offered.
 */
export async function saveMpinVault(email: string, password: string, mpin: string): Promise<void> {
  if (!cryptoReady() || !isValidMpin(mpin)) return;

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(mpin, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify({ email, password }))
  );

  const data: VaultData = {
    email,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ciphertext)),
  };

  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Attempt to decrypt the stored credentials with the given MPIN.
 * Returns null on a wrong MPIN (AES-GCM auth failure) or any other problem.
 */
export async function unlockWithMpin(mpin: string): Promise<{ email: string; password: string } | null> {
  if (!cryptoReady()) return null;

  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as VaultData;
    const salt = b64ToBytes(data.salt);
    const iv = b64ToBytes(data.iv);
    const key = await deriveKey(mpin, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      b64ToBytes(data.ct)
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext));
    if (!parsed?.email || !parsed?.password) return null;
    return { email: parsed.email, password: parsed.password };
  } catch {
    return null;
  }
}
