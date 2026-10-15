# SPEC-15 — Web: onboarding, login, settings, dashboard and search

Layer: L5. Architecture refs: §10.1–§10.3, §12.2, §12.3 (settings, forms), C7, C8, C11; A-6, A-17, A-18, A-23.

## 1. Summary

The screens around the session and the supplier profile: first-run onboarding (the one new screen, A-6), the login
page, settings with the existing Save button made accessible and usable (A-18), the dashboard, and the global
search dialog. Flows, on-screen elements and labels match legacy (A-2); minor visual differences are
allowed where they reduce maintenance, improve performance or increase consistency (D-0016). Plain language and fewest steps throughout (C11).

## 2. Scope

Core:

- `/auth/login`: legacy layout; password with the fixed `admin` user; "remember me"; the legacy default-password
  notice; plain error text; redirect back after login.
- `/onboarding`: shown when no supplier exists (INV-78); supplier profile and GST rates in the existing settings
  layout (same fields and order), then the login.
- `/settings`: legacy sections (supplier profile, GST rates, buyers, system access: change password and
  reset-to-defaults with the confirmation phrase alone, also on the login screen; BHEL portal password shown as "saved" with Change and Clear, never
  displayed; INV-81). No currency option and only the April-March FY cycle; the supplier GSTIN is checked for its
  format (ARCHITECTURE rev 1.9). Save only through the existing Save button, with dirty tracking, inline validation, a disabled
  state with a visible reason and an unsaved-changes prompt on navigation (INV-72). Download-folder preferences are
  removed (§9). Backup now / Restore are added by SPEC-21.
- `/` dashboard: legacy stat cards and recent activity; the open-flag count (INV-60); no insights.
- Global search dialog: legacy trigger and results; FY shown with DC/invoice numbers (INV-24).

Out of scope:

- Lists and details (SPEC-16..18); backup UI (SPEC-21); BHEL sync wizard (SPEC-19).

## 3. Dependencies

- SPEC-14 (shell, primitives, DataTable, platform), SPEC-07 (auth, onboarding, settings, buyers, secrets), SPEC-10
  (dashboard, search, flag count).

## 4. Design

### 4.1 Modules (`apps/web/src/`)

`routes/{auth/login,onboarding,settings,index}.tsx`; `components/modules/{auth,onboarding,settings,dashboard,search}/*`;
forms with react-hook-form and the shared Zod schemas; settings form state derived from the server value
(`isDirty`), never stored elsewhere.

### 4.2 Error handling

Server `message` shown inline at the field (`details` paths) or in the form footer; 409 version conflicts offer a
plain "Reload" action. All states keep the form's footprint (C8).

## 5. Invariants

INV-60, INV-67, INV-72, INV-78, INV-80, INV-81, INV-71 (states in place).

## 6. Testing strategy

E2E (Playwright, synthetic data): fresh data dir → onboarding → login → dashboard (§14.1); settings: edit → Save
enabled with reason when disabled → save persists → navigating away with unsaved changes prompts; change password
logs out other sessions; BHEL password set shows "saved" and the value never appears in the DOM or network
responses. Layout: toggling tabs/sections and showing validation errors does not move the Save button or the
section headers (bounding boxes).

## 7. Acceptance criteria

- [ ] First run opens `/onboarding`; afterwards it redirects away.
- [ ] Settings saves only via Save, with dirty tracking, inline validation, a disabled reason and an unsaved prompt.
- [ ] No interaction on these screens moves or resizes surrounding layout; loading/empty/error keep the same
      footprint.
- [ ] Light and dark screenshots of login, settings and dashboard show the legacy screens' elements and labels
      (review artefacts).
- [ ] `pnpm verify` and every CI job green, including `e2e`.

## 8. PR plan

| #   | Title                      | Scope / files                                                                         | Checks         | Done when                                                                                                          |
| --- | -------------------------- | ------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Login and session handling | `routes/auth/login.tsx`, `components/modules/auth/*`, session guard, e2e              | `check`, `e2e` | Login, remember me, logout and 401 redirect work; default-password notice shown as legacy.                         |
| 2   | Onboarding                 | `routes/onboarding.tsx`, `components/modules/onboarding/*`, e2e                       | `check`, `e2e` | Fresh install → onboarding → login → dashboard e2e passes.                                                         |
| 3   | Settings                   | `routes/settings.tsx`, `components/modules/settings/*`, e2e                           | `check`, `e2e` | INV-72 behaviours and BHEL password status pass e2e; no layout shift on validation or section toggles.             |
| 4   | Dashboard                  | `routes/index.tsx`, `components/modules/dashboard/*`, tests                           | `check`, `e2e` | Stat cards and activity show synthetic values equal to legacy for the same data; open-flag count shown.            |
| 5   | Global search              | `components/common/GlobalSearchDialog.tsx` wiring, `components/modules/search/*`, e2e | `check`, `e2e` | Search finds PO, DC, invoice and SRV numbers with FY on DC/invoice hits; dialog keeps its size while results load. |

## 9. Open issues

- Initial password handling follows SPEC-07 Open issues (legacy default, owner to confirm).
