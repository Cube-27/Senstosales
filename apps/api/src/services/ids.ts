// Surrogate ids are ULIDs generated in the service (C4, ARCHITECTURE §8.1): 10 Crockford base32 characters of
// milliseconds, then 16 of randomness.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newId(): string {
  let time = "";
  for (let ms = Date.now(), i = 0; i < 10; i++, ms = Math.floor(ms / 32)) time = CROCKFORD[ms % 32] + time;
  // 256 is a multiple of 32, so `byte % 32` is uniform.
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => CROCKFORD[byte % 32]);
  return time + random.join("");
}
