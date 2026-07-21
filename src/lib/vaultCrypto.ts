// ─── Zero-knowledge vault crypto ────────────────────────────────────────────
// All encryption happens in the browser. The master password and the derived
// key NEVER leave this device and are NEVER written to disk / Firestore.
// Firestore only ever receives ciphertext.
//
//   key      = PBKDF2(masterPassword, salt, 250k, SHA-256)  → AES-GCM 256
//   verifier = AES-GCM(key, VERIFIER_TEXT)   — lets us check the password
//   blob     = AES-GCM(key, JSON.stringify(entries))

const PBKDF2_ITERATIONS = 250_000;
const VERIFIER_TEXT = 'family-vault-verifier-v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface CipherBlob {
  iv: string;   // base64
  ct: string;   // base64
}

// ─── base64 helpers ───────────────────────────────────────────────────────────
function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buf;
}

export function randomB64(byteLen: number): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return bufToB64(bytes.buffer);
}

// ─── Key derivation ─────────────────────────────────────────────────────────
export async function deriveKey(masterPassword: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBuf(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Encrypt / decrypt ────────────────────────────────────────────────────────
export async function encrypt(key: CryptoKey, plaintext: string): Promise<CipherBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext),
  );
  return { iv: bufToB64(iv.buffer), ct: bufToB64(ct) };
}

export async function decrypt(key: CryptoKey, blob: CipherBlob): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(blob.iv) }, key, b64ToBuf(blob.ct),
  );
  return dec.decode(pt);
}

// ─── Verifier ─────────────────────────────────────────────────────────────────
// Encrypt a known token so we can validate the master password without
// having to decrypt the whole vault (and to seed an empty vault).
export async function makeVerifier(key: CryptoKey): Promise<CipherBlob> {
  return encrypt(key, VERIFIER_TEXT);
}

export async function checkVerifier(key: CryptoKey, verifier: CipherBlob): Promise<boolean> {
  try {
    return (await decrypt(key, verifier)) === VERIFIER_TEXT;
  } catch {
    return false;
  }
}

// ─── Password generator ─────────────────────────────────────────────────────
export interface GenOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}

export function generatePassword(opts: GenOptions): string {
  const sets: string[] = [];
  if (opts.upper)   sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');    // no I/O (ambiguous)
  if (opts.lower)   sets.push('abcdefghijkmnpqrstuvwxyz');    // no l
  if (opts.digits)  sets.push('23456789');                    // no 0/1
  if (opts.symbols) sets.push('!@#$%^&*()-_=+[]{}');
  if (sets.length === 0) sets.push('abcdefghijkmnpqrstuvwxyz');

  const all = sets.join('');
  const out: string[] = [];

  // Guarantee at least one char from each selected set
  for (const set of sets) {
    out.push(set[randomInt(set.length)]);
  }
  while (out.length < opts.length) {
    out.push(all[randomInt(all.length)]);
  }
  // Fisher–Yates shuffle so the guaranteed chars aren't always first
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, opts.length).join('');
}

function randomInt(max: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

// ─── Password strength (0–4) ──────────────────────────────────────────────────
export function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '#64748b' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(re => re.test(pw)).length;
  if (classes >= 3) score++;
  if (classes === 4 && pw.length >= 12) score++;
  score = Math.min(score, 4);

  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
  return { score, label: labels[score], color: colors[score] };
}
