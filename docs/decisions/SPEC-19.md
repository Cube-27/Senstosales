# SPEC-19 decisions

Decisions for [SPEC-19 — BHEL scraper and sync](../specs/SPEC-19-bhel-scraper-sync.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0375 — Scraper errors are one class with codes

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 1+4 (#77) · Status: decided
- Decision: `ScraperError` carries a `code` (`edge-unavailable`, `portal-unreachable`, `wrong-captcha`, `wrong-otp`, `out-of-order`, `closed`, `invalid-po-id`, `fetch-failed`) and a fixed plain message per code; SPEC-19 `EdgeUnavailable` is `code: "edge-unavailable"`.
- Alternatives: A class per error.
- Why: Fixed messages cannot carry the password, OTP, cookies or a page body (INV-81, INV-106); callers switch on one field.
- Reversible: yes.

### D-0376 — Scraper port step order

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 1+4 (#77) · Status: decided
- Decision: `prepareLogin` -> `submitCaptcha` (resolves at the OTP step) -> `submitOtp` (resolves on the PO page) -> list/fetch. A wrong captcha needs a fresh `prepareLogin`; a wrong OTP is retried in place; out of order rejects `out-of-order`, after `close` rejects `closed`; `listPoIds` drops ids failing `^d{1,10}$`.
- Alternatives: `submitCaptcha` returns the next captcha.
- Why: The most conservative reading of SPEC-19 §4.1-4.2 until the SPEC-01 spike; the PR 2 adapter fits under it.
- Reversible: yes.

### D-0377 — Scraper sessions keyed by the wizard session id

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 1+4 (#77) · Status: decided
- Decision: The session map key is the `sessionId` `bhel.start` hands out and the scrape job carries; each call on a session counts as use when it starts and settles; `get` answers none after 15 minutes idle and the runtime sweeps every 60 s (`unref`), settling every close. The idle check reads only `now()` (`InstantClock`, a subset of `Clock`).
- Alternatives: Key by job id, which does not exist until after login.
- Why: The session exists before its job and each job carries one session and closes it, so INV-100 holds; a long scrape is never closed under a running job.
- Reversible: yes.

### D-0378 — How the BHEL wizard answers errors

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 1+4 (#77) · Status: decided
- Decision: The supplier code and stored password are checked at `bhel.start` (409 `bhel-supplier-code-missing` / `bhel-password-missing`); Edge missing or portal down: 409 with the port message; unknown or closed session: 404 `bhel-session-ended`; invalid PO id: 400.
- Alternatives: A 5xx for the portal down.
- Why: `AppError` has no 5xx; these are states the user resolves, like `onboarding-required`.
- Reversible: yes.

### D-0379 — Scrape storage and the session at job end

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 1+4 (#77) · Status: decided
- Decision: A scraped page is stored under the requested PO id before parsing (D-0178), `doc_date` null; the ingest skips its own store (`preStored`). A scrape job closes its session at `finish`, so PO and SRV scrapes take one login each; the summary adds the flags opened, as folder import.
- Alternatives: Store again after parsing (two audit rows per page).
- Why: D-0178 and INV-100 as written; `doc_date` is read nowhere.
- Reversible: yes.

### D-0380 — No scraper, no BHEL sync

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 1+4 (#77) · Status: decided
- Decision: `openRuntime` takes an optional `Scraper`; without one the wizard routes are not mounted and the scrape job types have no handler ("not available yet"). SPEC-19 PR 2 passes the adapter.
- Alternatives: A stub scraper that always answers `edge-unavailable`.
- Why: Saying Edge is missing before the adapter exists would be untrue.
- Reversible: yes.
