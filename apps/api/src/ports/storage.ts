// The Storage port (ARCHITECTURE §4.1): files by key (`html/po/<po>.html`, `exports/<ulid>.<ext>`,
// `backups/<ts>.db`). File locations come only from here, never from a request (C17); an adapter refuses a key that
// would leave its root (INV-96).
export interface Storage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** The stored bytes, or `null` when nothing is stored under `key`. */
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** The keys under `prefix`. */
  list(prefix: string): Promise<string[]>;
}
