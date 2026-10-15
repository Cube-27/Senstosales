// The health wait (ARCHITECTURE §13.1, ADR 0001). The shell page is another origin, so it asks `/api/health` with
// `no-cors`: the response is opaque, but the request resolves only once the server answers, and the API needs no CORS
// header. Readiness itself is the sidecar's port line; this only confirms the server is reachable before navigating.

export interface HealthWait {
  /** `http://127.0.0.1:<port>` */
  readonly base: string;
  readonly fetch: (url: string, init: RequestInit) => Promise<unknown>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly attempts: number;
  readonly intervalMs: number;
}

/** True once `/api/health` answers; false when every attempt was refused. */
export async function waitForHealth({ base, fetch, sleep, attempts, intervalMs }: HealthWait): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await fetch(`${base}/api/health`, { mode: "no-cors" });
      return true;
    } catch {
      if (attempt < attempts) await sleep(intervalMs);
    }
  }
  return false;
}
