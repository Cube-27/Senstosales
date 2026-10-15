# SPEC-19 decisions

Decisions for [SPEC-19 — BHEL scraper and sync](../specs/SPEC-19-bhel-scraper-sync.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

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

### D-0503 — BHEL credentials come from Settings

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: The Authentication card shows the supplier code read-only and the BHEL password as Saved/Not saved with a "Change in Settings" link; the legacy code and password inputs, their Save and the show-password toggle are not built.
- Alternatives: Keep the inputs.
- Why: A-17 and INV-81: the password is stored once in Settings and never returned to a page; SPEC-19 §2 names a stored-password status with a link to Settings.
- Reversible: yes.

### D-0504 — Auto-Ingest and Sync Before Start are not built

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: Pipeline Configuration keeps only Batch Limit and the PO filter.
- Alternatives: Inert toggles.
- Why: Every scraped page is stored and then ingested (ARCHITECTURE §7.3, D-0379) and there is no download folder to sync from; the schema has only `poIds`/`limit` (SPEC-04). Same precedent as the Download Folders section (SPEC-15).
- Reversible: yes.

### D-0505 — What a scrape request sends

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: The filter's ids when it names any (split on commas and white space, each `^\d{1,10}$`, INV-97), else Batch Limit 1-5000 with the legacy default 1; an invalid entry blocks Start with its reason in a reserved line.
- Alternatives: Send both.
- Why: `zScrape`: specific PO ids, or the first `limit` found.
- Reversible: yes.

### D-0506 — Wizard login state, cancel and labels

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: The login is a union (idle, connecting, captcha, otp, failed, ready). Authenticated is derived: ready, and the session's run has not ended; Reset ends a login on the run's session. Each attempt has a number and Cancel starts a new one, so a late answer changes nothing and a session opened after Cancel is closed. Stop is `JobProgress`'s Cancel. Labels: queued Connecting, running Downloading (PO) or Checking Portal (SRV), then Done, Cancelled or Error; `PO|SRV Standby` before a run.
- Alternatives: Store a logged-out flag when the job ends.
- Why: D-0379 closes the session at job end; deriving it needs no effect (owner rule); #86 review.
- Reversible: yes.

### D-0507 — Tray status from /api/health

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: Inside the shell only, a `QueryObserver` polls health (every 2 s while a job runs, 10 s otherwise, also with the window hidden) and sets the tooltip to `SenstoSales` or `SenstoSales: <job> running|waiting`, each text once.
- Alternatives: Follow only jobs this page started.
- Why: ARCHITECTURE §7.3: the tray shows the current job, including the daily backup and jobs started on other screens.
- Reversible: yes.

### D-0508 — How e2e selects the fake scraper

- Date: 2026-10-15 · Spec/PR: SPEC-21 PR 3 + SPEC-19 PR 5 (#86) · Status: decided
- Decision: A separate entry, `apps/api/test/e2e-server.ts`, runs `run(web, fakeScraper)` for the whole e2e harness; `startServer`/`run` take an optional `scraper`; the BHEL spec runs on its own worker server.
- Alternatives: An env flag in `main.ts` (SPEC-19 §9).
- Why: No flag exists for production to read: the sidecar entry never imports the fake.
- Reversible: yes.

### D-0530 — Portal flow and selectors from the legacy scraper until the spike

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: The origin, paths, form field names, notices (each ticked and closed in order when visible after load), captcha table (innermost `table:has(img[src*='captcha.asp'])`) and PO-link selector follow the legacy scraper's visible behaviour; only the main frame is read.
- Alternatives: Wait for the SPEC-01 PR 2 spike (H3).
- Why: SPEC-19 §9 puts portal changes in `selectors.ts` and its fixtures; the spike corrects them there.
- Reversible: yes.

### D-0531 — How the login reads where the portal is

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: After each submit the adapter waits for the page `load` event, then `classifyPage` reads it as the supplier PO page (URL or headings), the OTP step (an OTP field) or other. After the captcha, other is `wrong-captcha`; after the OTP, the OTP form again is `wrong-otp`, otherwise it opens the PO page and failing that is `portal-unreachable`. A rejected password returns the login page, so it surfaces as `wrong-captcha` until the SPEC-01 spike shows how the portal reports it (EC-55).
- Alternatives: Keyword search of the page text (legacy fallback).
- Why: A field or heading is a stronger signal than words a login page may also contain.
- Reversible: yes.

### D-0532 — One step guard for every Scraper

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: `packages/scraper/src/session-guard.ts` owns the step order (D-0376), runs one login step at a time (a concurrent second call is `out-of-order`), restarts at a fresh captcha after any failure but a wrong OTP, maps a driver's non-`ScraperError` failure to `portal-unreachable`, and checks PO ids (INV-97). The fake and the Edge adapter are drivers under it.
- Alternatives: A step machine in each Scraper.
- Why: The two copies already disagreed, so API tests against the fake did not test the real rules.
- Reversible: yes.

### D-0533 — Edge closes after the login

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: The cookies the portal sends to its `/mm/` pages go to the HTTP session and Edge closes at once.
- Alternatives: Keep Edge open until the session closes.
- Why: Listing and fetching never use the browser (ARCHITECTURE §7.5); fewer Edge processes for up to 15 minutes.
- Reversible: yes.

### D-0534 — An SRV fetch opens its PO page first

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: `fetchSrvHtml` POSTs the PO page, then the SRV list with the PO page as referer.
- Alternatives: The SRV list alone.
- Why: The legacy scraper's observed portal behaviour: the SRV list is served only after its PO's page in the same session.
- Reversible: yes.

### D-0535 — The HTTP session refuses redirects

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: `redirect: "error"`, a 90 s timeout; a network error, timeout, redirect or non-2xx is the fixed `fetch-failed`.
- Alternatives: Follow same-origin redirects.
- Why: C17 (no URL from the portal is followed); an expired session redirects, which is a fetch failure.
- Reversible: yes.

### D-0536 — Scraped pages are decoded as UTF-8

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: `response.text()`, the decoding `packages/parsers` applies to stored pages.
- Alternatives: Decode with the response charset.
- Why: One decoding for scraped and imported pages; no non-UTF-8 page observed.
- Reversible: yes.

### D-0537 — The node entry does not pass the adapter yet

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: `run()` keeps no scraper until playwright-core ships beside the sidecar (ACTIVE.md follow-up). Refines D-0380's "SPEC-19 PR 2 passes the adapter".
- Alternatives: Pass it now.
- Why: playwright-core reads its own `package.json`, `browsers.json` and `lib/` from disk at run time, so inside the SEA bundle the packaged app would say Edge is missing when it is not, the untrue message D-0380 avoids.
- Reversible: yes.

### D-0538 — Adapter tests run headless Edge offline

- Date: 2026-10-15 · Spec/PR: SPEC-19 PRs 2-3 (#90) · Status: decided
- Decision: The adapter test drives the real headless `msedge`; Playwright routes answer every request from synthetic fixtures and never with a redirect (Playwright does not route the request a redirect leads to); the test browser's proxy is a closed local port, and a test proves an unrouted request fails on the machine.
- Alternatives: A fake `Page`.
- Why: The selectors and the flow run in the real browser without reaching the network; an early run that followed a stub redirect reached the portal unauthenticated.
- Reversible: yes.
