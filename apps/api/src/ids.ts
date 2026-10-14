// Surrogate ids (ARCHITECTURE §8.1, C4): ULIDs generated in services. 48 bits of milliseconds then 80 random bits,
// in Crockford base32, so ids sort by creation time.
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new ULID; `now` is the millisecond timestamp it encodes. */
export function newId(now: number = Date.now()): string {
  let time = "";
  for (let rest = now, i = 0; i < 10; i++, rest = Math.floor(rest / 32)) time = BASE32[rest % 32] + time;
  // 256 is a multiple of 32, so `byte % 32` is uniform.
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => BASE32[byte % 32]).join("");
  return time + random;
}
