// Surrogate ids (ARCHITECTURE §8.1, C4): ULIDs generated in services. 48 bits of milliseconds then 80 random bits,
// in Crockford base32, so ids sort by creation time. Within one millisecond the random part counts up, so ids made one
// after another (job events) sort in the order they were made.
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let lastTime = -1;
/** The random part as 16 base-32 digits. */
const random = new Uint8Array(16);

/** A new ULID; `now` is the millisecond timestamp it encodes. */
export function newId(now: number = Date.now()): string {
  let time = "";
  for (let rest = now, i = 0; i < 10; i++, rest = Math.floor(rest / 32)) time = BASE32[rest % 32] + time;
  if (now === lastTime) {
    increment();
  } else {
    lastTime = now;
    // 256 is a multiple of 32, so `byte % 32` is uniform.
    crypto.getRandomValues(random).forEach((byte, i) => (random[i] = byte % 32));
  }
  return time + Array.from(random, (digit) => BASE32[digit]).join("");
}

/** Adds one to the random part, carrying from the last digit. */
function increment(): void {
  for (let i = random.length - 1; i >= 0; i--) {
    random[i] = (random[i]! + 1) % 32;
    if (random[i] !== 0) return;
  }
}
