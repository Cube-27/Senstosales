# SPEC-19 — BHEL scraper and sync

Layer: L7. Architecture refs: §3, §4.1 (`Scraper`), §7.3, §7.5, §10.2, §12.2 (`/po/ingest-bhel`), §12.4 (tray), C17;
A-5, A-17; EC-09.

## 1. Summary

Live sync from the BHEL supplier portal: the `Scraper` port and an in-memory fake, the playwright-core adapter that
drives the system Edge (headless, no bundled browser) through captcha and e-mailed OTP, a plain HTTP session that
reuses the login cookies to list PO ids and fetch PO and SRV pages, the `po.scrape` / `srv.scrape` jobs that feed
the same ingestion services as folder import, and the login wizard on the existing `/po/ingest-bhel` screen with tray
status. Page content is data, never executed (C17). The stored BHEL password means a sync needs only the captcha
and the OTP (A-17).

## 2. Scope

Core:

- Port (§4.1): `openSession()` → `prepareLogin()` (captcha PNG), `submitCaptcha(code, password, captcha)`,
  `submitOtp(otp)`, `listPoIds()`, `fetchPoHtml(id)`, `fetchSrvHtml(id)`, `close()`. In-memory fake for tests.
- Sessions in a map keyed by job id; closed on job end, app exit or 15 minutes idle (INV-100).
- Adapter: `playwright-core`, `channel: 'msedge'`, headless, a fixed user agent and no other flags; no
  `--disable-web-security` (INV-86). Edge missing or blocked → typed `EdgeUnavailable` with the plain message that
  BHEL sync needs Microsoft Edge; folder import still works (EC-09).
- Login flow per §7.5: open the portal origin (a constant), dismiss pop-ups, capture the captcha, submit supplier
  code + stored password + captcha, detect the OTP step, submit the user's OTP, confirm by the supplier PO page.
- Listing and fetching over the cookie session; PO ids validated `^\d{1,10}$` (INV-97); responses handled as
  strings.
- Selectors in one module (`selectors.ts`) with tests on synthetic portal-shaped HTML fixtures.
- Jobs: `po.scrape`, `srv.scrape`: ids → fetch → `Storage` → ingest per document (SPEC-08 services), cancel between
  documents, per-document failure events, progress.
- Wizard API: start session (returns captcha image), submit captcha, submit OTP, then start the scrape job.
- UI on `/po/ingest-bhel` (legacy BHEL ingest tab): captcha → OTP → job progress (shared `JobProgress`), stored
  password status with a link to Settings, plain messages; tray status through the platform adapter.

Out of scope:

- Fallback browsers (K8), Browser Rendering (K1), encrypted password (K9).

## 3. Dependencies

- SPEC-08 (jobs, ingestion), SPEC-07 (secrets, supplier code), SPEC-14 and SPEC-16 (`JobProgress`, platform).
- SPEC-01 PR 2 (flow and selector findings).
- Human task H3 (portal credentials and OTP mailbox, owner's machine only).

## 4. Design

### 4.1 Modules

| Path                                                                                | Responsibility                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `packages/scraper/src/port.ts`                                                      | `Scraper`, `ScraperSession`, error types               |
| `packages/scraper/src/fake.ts`                                                      | scripted fake (captcha, OTP, ids, pages from fixtures) |
| `packages/scraper/src/sessions.ts`                                                  | session map, idle timer via the `Clock` port           |
| `packages/scraper/src/platform/playwright/{launch,login,selectors,http-session}.ts` | the adapter                                            |
| `packages/scraper/fixtures/*.html`                                                  | synthetic portal-shaped pages for selector tests       |
| `apps/api/src/{routes,services}/bhel-sync.ts`                                       | wizard endpoints; scrape job handlers                  |
| `apps/web/src/routes/po/ingest-bhel.tsx`, `components/modules/bhel-sync/*`          | the wizard UI                                          |

### 4.2 Error handling

Wrong captcha or OTP → the wizard asks again in place; portal unreachable → plain message, job not started; a
document fetch failure → job event, the job continues; `EdgeUnavailable` → the EC-09 message. No error message or
log line contains the password, cookies or page bodies (INV-81, INV-106).

## 5. Invariants

INV-81, INV-86, INV-97 (new), INV-100 (new), INV-98 (single job), INV-106.

## 6. Testing strategy

- Unit: session idle close via a fake clock; id validation; selector tests on synthetic fixtures; the adapter never
  passes forbidden launch flags (launch options snapshot).
- API (fake scraper): the wizard sequence; a scrape job ingests fixture pages; a failing page does not lose the
  others; cancel between documents.
- E2E (fake scraper, `e2e` mode): captcha → OTP → running job → summary.
- Manual on the owner's machine: a live sync (L7 exit), recorded in DECISIONS without real data.

## 7. Acceptance criteria

- [ ] A live sync on the owner's machine ingests new documents (L7 exit).
- [ ] Without Edge, the plain EC-09 message appears and folder import still works.
- [ ] Sessions close on job end, exit and 15 minutes idle.
- [ ] The wizard keeps its footprint across steps (no layout shift).
- [ ] `pnpm verify` and every CI job green, including `e2e`.

## 8. PR plan

| #   | Title                                | Scope / files                                                                   | Checks         | Done when                                                                                                             |
| --- | ------------------------------------ | ------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Scraper port, fake and sessions      | `packages/scraper/src/{port,fake,sessions}.ts`, tests                           | `check`        | Fake drives a full flow in tests; idle close at 15 min with a fake clock; invalid PO ids rejected.                    |
| 2   | Playwright adapter: launch and login | `src/platform/playwright/{launch,login,selectors}.ts`, fixtures, tests          | `check`        | Launch options snapshot has only channel, headless and UA; selector tests pass on fixtures; `EdgeUnavailable` mapped. |
| 3   | HTTP session listing and fetch       | `src/platform/playwright/http-session.ts`, tests with a local stub server       | `check`        | Cookies reused; portal origin constant; pages returned as strings; ids validated.                                     |
| 4   | Scrape jobs and wizard API           | `apps/api/src/{routes,services}/bhel-sync.ts`, job handlers, tests              | `check`        | Fake-backed wizard and scrape jobs pass; partial failures keep other documents; cancel works.                         |
| 5   | Sync wizard UI and tray status       | `apps/web/src/routes/po/ingest-bhel.tsx`, `components/modules/bhel-sync/*`, e2e | `check`, `e2e` | Captcha → OTP → progress → summary e2e passes with the fake; no layout shift between steps.                           |
| 6   | Live sync acceptance (human)         | DECISIONS entry with the outcome (no real data)                                 | —              | The owner runs a live sync (H3) and new documents appear.                                                             |

## 9. Open issues

- Selector strategies are fixed by the SPEC-01 spike; portal changes are fixed by updating `selectors.ts` and its
  fixtures.
- How the e2e build swaps in the fake scraper (an env flag read by the node platform entry only) is an
  implementation detail; production builds cannot select it.
