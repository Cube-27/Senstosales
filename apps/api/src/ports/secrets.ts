// The Secrets port (ARCHITECTURE §4.1): the BHEL portal password, stored simply (A-17). Its value is never returned
// by the API or written to logs, audit values, exports or error bodies (INV-81).
export type SecretName = "bhel-password";

export interface Secrets {
  /** The stored value, or `null` when none is saved. */
  get(name: SecretName): Promise<string | null>;
  /** Saves `value`, or clears the secret when `value` is `null`. */
  set(name: SecretName, value: string | null): Promise<void>;
}
