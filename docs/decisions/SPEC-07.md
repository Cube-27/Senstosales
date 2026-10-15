# SPEC-07 decisions

Decisions for [SPEC-07 — API foundation, startup, auth, onboarding and settings](../specs/SPEC-07-api-foundation-auth-settings.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md). Append new entries at the end.

## Entries

### D-0004 — Initial password `admin`, no forced change

- Date: 2026-10-14 · Spec/PR: SPEC-07 PR 4 · Status: decided
- Decision: First run uses the legacy default password `admin` with the legacy "default password" notice; it is changed in Settings, never forced (C11).
- Alternatives: Set a password during onboarding; force a change on first login (refused by C11).
- Why: Matches legacy behaviour; §10.3 does not say how the first password is set (SPEC-07 Open issues, SPEC-15 Open issues).
- Reversible: yes — an onboarding step can be added later.
- Owner answer: Decided by the orchestrator under owner delegation, 2026-10-14.

### D-0130 — `createApp` takes a handler map

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: `createApp(deps, handlers)` takes a map from route name to handler and mounts only the routes that have one, in the route table's order. Handlers get `{ params, query, body }` decoded by the table's schemas, and their return value is encoded by its response schema.
- Alternatives: One Hono sub-app per resource with `@hono/zod-validator`.
- Why: Each route's validation, codecs and error shape are in one place, and the route-table types are used directly. `@hono/zod-validator` would be one more dependency doing what `safeParse` already does.
- Reversible: yes.

### D-0131 — 10 MB cap on the whole body, before parsing

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: The 10 MB cap applies to the whole request body and is checked before parsing. An upload of several files that passes 10 MB in total is refused, even if each file is under 10 MB. The web client (SPEC-08 PR 3, SPEC-16) splits uploads into requests of at most 10 MB of JSON-encoded body, escaping included.
- Alternatives: A larger total cap for upload routes, with a per-file check after parsing; that needs a total limit no spec gives.
- Why: INV-110 refuses bodies before parsing, and a file's size is only known after parsing.
- Reversible: yes.

### D-0132 — 413 and 415 in the error hierarchy

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: `PayloadTooLargeError` (413) and `UnsupportedMediaTypeError` (415, a mutation that is not JSON) are added to the `AppError` hierarchy.
- Alternatives: Answer 400 for both.
- Why: SPEC-07 §6 asks for 413 for an oversize body and allows 415 for a text/plain POST.
- Reversible: yes.

### D-0133 — `createServices` added with the first service

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: `createServices(deps)` and `services/index.ts` arrive with the first service (SPEC-07 PR 4). `AppDeps` is `{ port, logger }` until later PRs need more. In production, `createApp(deps)` builds its handlers from `createServices`.
- Alternatives: An empty factory in PR 1.
- Why: No service existed yet; an empty seam would be speculative (ENGINEERING "Subtract before you add").
- Reversible: yes.

### D-0134 — Downloads named with RFC 5987 `filename*` only

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 1 (#35) · Status: decided
- Decision: A download's `Content-Disposition` is `attachment; filename*=UTF-8''<encoded>`, built by `contentDisposition` in `packages/schemas` beside the client's reader.
- Alternatives: Also send a quoted ASCII `filename=` fallback.
- Why: The only reader is our own client in WebView2/Chromium, which reads `filename*`; a fallback listed first would win in the client's parser and mangle non-ASCII names.
- Reversible: yes.

### D-0135 — Port line `SENSTO_PORT=<n>`; exit on stdin EOF

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: The node entry prints one line, `SENSTO_PORT=<n>`, once it is listening, and exits when stdin reaches EOF.
- Alternatives: `{"port": n}` as written in SPEC-07 §4.2.
- Why: ADR 0001 (accepted, SPEC-01 PR 1) chose this line and the stdin-EOF exit, and SPEC-07 depends on that decision.
- Reversible: yes, until SPEC-20 builds the shell.

### D-0136 — `SENSTO_DATA_DIR` overrides the data directory

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: `SENSTO_DATA_DIR`, when set, replaces `%LOCALAPPDATA%\SenstoSales`. With neither set, startup stops with a plain message.
- Alternatives: No override; fall back to the home folder.
- Why: Tests and development need a temporary data folder (the ADR 0001 spike used the same variable). A guessed folder could put data in the app folder, against INV-82.
- Reversible: yes.

### D-0137 — `config.json` created only when needed

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: `config.json` is neither created nor read until something needs it. Startup creates only the data folders.
- Alternatives: Write an empty `config.json` at startup.
- Why: Nothing in core stores configuration yet, and an empty file would be speculative.
- Reversible: yes.

### D-0138 — Health version from `package.json`; health job is the active one

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: `/api/health` reports `version` from `apps/api/package.json` (0.1.0), which SPEC-20's `stamp-version` will write from `VERSION`. Its `job` is the running job, else the oldest queued one, else `null`.
- Alternatives: A hard-coded constant; read `VERSION` at runtime (breaks inside the SEA); report only a running job.
- Why: INV-105 stamps `VERSION` into every `package.json`, and a JSON import is bundled into the SEA. A queued job is also busy from the shell's point of view.
- Reversible: yes.

### D-0139 — Storage keys: allow-list plus resolved-path check

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 2 (#36) · Status: decided
- Decision: Storage keys and SPA paths allow only `[A-Za-z0-9_.-]` names joined by `/`, and each resolved path must also stay under the root. Both checks run.
- Alternatives: Only the allow-list; only the resolved-path check.
- Why: Keys are system-made. The allow-list rejects drive letters, UNC paths, alternate data streams and backslashes on Windows without relying on path normalisation. The resolved-path check guards the file-system call itself, and SonarCloud's taint analysis recognises it (INV-96).
- Reversible: yes.

### D-0146 — Sessions last one year; remember-me sets the cookie's Max-Age

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Every session row expires one year after login (the legacy cookie's `Max-Age`). Without remember-me the cookie has no `Max-Age` and ends with the browser session; with it, `Max-Age=31536000`.
- Alternatives: Legacy's two cookies, both with a one-year Max-Age; a shorter server lifetime without remember-me.
- Why: A2-11 says "session cookie plus remember me"; legacy server tokens never expired and one year is its only lifetime.
- Reversible: yes.

### D-0147 — Change password and reset end every session, the caller's included

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Both delete all session rows and clear the caller's cookie, so the UI returns to the login.
- Alternatives: Keep the caller's session and end only the others.
- Why: The legacy flow logs the user out ("Please log in again"; frozen flow, C7), and it satisfies INV-80's "ends other sessions".
- Reversible: yes.

### D-0148 — No user row means the default password

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Nothing is seeded. Until the first login there is no `app_user` row and the password is `admin` (D-0004). The first login creates the row in its batch (`ON CONFLICT DO NOTHING` on the username, with the user id read by username inside the batch, so overlapping first logins both succeed). Reset-to-defaults deletes the row and every session.
- Alternatives: Seed the row in a migration; create it in onboarding.
- Why: Startup is read-only (C9), and one representation of "default" avoids hashing `admin` on reset.
- Reversible: yes.

### D-0149 — A wrong current password is 400, not 401

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Change password and reset answer 400 `wrong-password` or `current-password-required` with the field path `body.currentPassword`. A wrong login password is 401 `wrong-password`; a missing or expired session is 401 `signed-out`.
- Alternatives: 401 for all, as legacy.
- Why: A 401 on a signed-in settings form would read as "session ended" to the client.
- Reversible: yes.

### D-0150 — Logout ends only this session

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: Logout deletes the caller's session row only.
- Alternatives: End every session, as legacy's single-token store did.
- Why: Legacy kept one session at a time, so the two behave alike for its single WebView; INV-80 names only change password and reset as ending other sessions.
- Reversible: yes.

### D-0151 — PBKDF2 at 600 000 iterations in a self-describing hash

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 4 (#38) · Status: decided
- Decision: `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>`, 16-byte salt, 600 000 iterations.
- Alternatives: A fixed format without the iteration count.
- Why: The OWASP figure for PBKDF2-SHA256; storing the count lets it rise without invalidating stored hashes.
- Reversible: yes.

### D-0152 — A new, empty database is backed up before migration 0001

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 3 (#39) · Status: decided
- Decision: Startup treats a version-0 database like any older one: it writes `pre-upgrade-0-<ts>.db` before applying 0001, so every first launch leaves one small backup.
- Alternatives: Skip the backup at version 0, since there is nothing to keep.
- Why: C9 says "always after a backup", and SPEC-07 §4.2 and ARCHITECTURE §13.3 back up on any `<` with no exception. One special case fewer.
- Reversible: yes.

### D-0153 — Backup file stamp `YYYYMMDDTHHMMSSZ` (UTC)

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 3 (#39) · Status: decided
- Decision: The `<ts>` in `pre-upgrade-<version>-<ts>.db` is `Clock.now()` without separators or milliseconds, for example `20250401T053000Z`.
- Alternatives: The ISO instant with `:` replaced; IST local time.
- Why: The spec sets no format. `:` is not allowed in Windows file names. This form sorts by time, and UTC matches `applied_at`.
- Reversible: yes.

### D-0154 — A failed backup stops the upgrade

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 3 (#39) · Status: decided
- Decision: If `backupTo` fails, no migration runs, and startup exits with "SenstoSales could not back up its data, so it did not upgrade it. Nothing was changed."
- Alternatives: Migrate without a backup.
- Why: C9 allows the upgrade only after a backup.
- Reversible: yes.

### D-0165 — Onboarding gate answers 409 before the session check

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: Before a supplier exists, every non-public route answers 409 `onboarding-required`, checked before the session. `GET /api/onboarding` always answers; `POST /api/onboarding` answers 409 `already-set-up` once a supplier exists.
- Alternatives: Check the session first (401 on first run, when nobody can be signed in), or hide the onboarding routes with 404 after setup.
- Why: SPEC-07 §6 asks for a 409 `onboarding-required` redirect signal, and the SPA needs the status on every launch.
- Reversible: yes.

### D-0166 — One supplier enforced inside the onboarding batch

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: The onboarding batch ends with a statement that fails it if a second supplier row would exist, using the same NOT NULL technique as `updateWithVersion`. Onboarding maps exactly that failure to 409 `already-set-up`.
- Alternatives: A singleton unique column (needs a migration to a shared table), or check-then-write only (two overlapping submits create two suppliers).
- Why: A2-12 allows one supplier per install, and a double submit is a realistic way to get two. No schema change is needed.
- Reversible: yes.

### D-0167 — The supplier id is cached once found

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: The services and the onboarding gate share one supplier id, looked up until found and then kept for the life of the process.
- Alternatives: Query the supplier on every request (two lookups per request before this change).
- Why: No route or job deletes the supplier, so a found id stays correct. A later restore that swaps the database must rebuild the services.
- Reversible: yes.

### D-0168 — Settings PUT replaces every row; GST keys win

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: `PUT /api/settings` rewrites all of the supplier's `settings` rows. A preference whose key is `cgst_pct` or `sgst_pct` is dropped.
- Alternatives: Merge preferences, or reject a reserved key with 400.
- Why: The body is the full settings shape, and the rates must stay the typed fields.
- Reversible: yes.

### D-0169 — Audit actions and values for supplier data

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: The actor is `admin`. The actions are `onboarding`, `update-supplier`, `update-settings`, `create-buyer`, `update-buyer`, `delete-buyer`, `set-bhel-password` and `clear-bhel-password`. Each row carries the before and/or after values, except the BHEL password rows, which carry no values.
- Alternatives: Store no values in any audit row.
- Why: The audit log records changed values (ARCHITECTURE §8.2), and INV-81 forbids storing the secret.
- Reversible: yes.

### D-0170 — The secrets service implements the Secrets port

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: `createSecretsService` implements the `Secrets` port (`get`, `set`) over the `secret` table. Each `set` is one batch with its audit row. The status route derives `saved` from `get`.
- Alternatives: A separate platform adapter, which would bypass the batch and audit rule.
- Why: The secret is a DB row, so its writes follow C4 like every other write.
- Reversible: yes.

### D-0171 — Buyers listed by unit name; delete is unconditional

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 5 (#41) · Status: decided
- Decision: `GET /api/buyers` lists buyers by unit name, then id. Delete is unconditional, as in legacy, even though `po.buyer_id` may reference the buyer. That column has no foreign key, so the PO keeps a dangling id (EC-30).
- Alternatives: Order by creation time. Refuse the delete while a PO references the buyer, or clear the references.
- Why: Readable in the settings list. Delete follows the frozen legacy behaviour, because the spec is silent on references.
- Reversible: yes.

### D-0395 — Audit actions are `<entity>.<verb>`

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 6 + SPEC-05 follow-ups (#80) · Status: decided
- Decision: Every audit action is `<entity>.<verb>`, the entity as stored in `entity_type`: `srv.delete`, `buyer.create|update|delete`, `supplier.update`, `supplier.create` (onboarding), `settings.update`, `secret.set|clear`, `app_user.login|logout|change_password|reset_defaults`. Supersedes the names in D-0169 and D-0202.
- Alternatives: Keep the hyphenated `verb-entity` names.
- Why: One form with `po.create`, `dc.delete` and `po_item.manual_dispatched` (#67 review).
- Reversible: yes; no release stored the old names.

### D-0398 — DC and invoice number checks

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 6 + SPEC-05 follow-ups (#80) · Status: decided
- Decision: `taken` is true when a stored document of that kind has the trimmed number (D-0248) and its stored `financial_year` is the FY of `date`; a blank number is a 400.
- Alternatives: Derive the FY from each stored date.
- Why: It is the unique key behind the create's 409, so the live check and the save cannot disagree.
- Reversible: yes.

### D-0399 — One route composition

- Date: 2026-10-15 · Spec/PR: SPEC-07 PR 6 + SPEC-05 follow-ups (#80) · Status: decided
- Decision: `allRoutes(services, { health, restore })` is what `main.ts` mounts and what the route conformance test checks; without a scraper only the BHEL wizard routes are missing (D-0380).
- Alternatives: A test-only composition.
- Why: The test checks the server's own wiring (INV-101).
- Reversible: yes.
