// Password hashing for the `admin` login (ARCHITECTURE §10.1): PBKDF2-SHA256 through WebCrypto, stored as
// `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>` so the work factor can rise without breaking stored hashes.
// Session tokens are random and stored only as their SHA-256.
const SCHEME = "pbkdf2-sha256";
const ITERATIONS = 600_000;

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return [SCHEME, ITERATIONS, toHex(salt), await derive(password, salt, ITERATIONS)].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== SCHEME || iterations === undefined || salt === undefined || hash === undefined) return false;
  return (await derive(password, fromHex(salt), Number(iterations))) === hash;
}

/** A new session token: 32 random bytes as hex, for the cookie. */
export const newToken = (): string => toHex(crypto.getRandomValues(new Uint8Array(32)));

/** What the `session` table keeps instead of the token. */
export async function hashToken(token: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}
