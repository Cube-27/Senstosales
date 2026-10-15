# SPEC-15 decisions

Decisions for [SPEC-15 — Web: onboarding, login, settings, dashboard and search](../specs/SPEC-15-web-onboarding-login-settings-dashboard.md).
Template, statuses and rules: [DECISIONS.md](../DECISIONS.md).

### D-0435 — Settings Save sits in the page header

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: The supplier profile, GST rates and system defaults save through one Save in the page header; buyers, change password, reset and the BHEL password keep their own buttons.
- Alternatives: A Save per section, as legacy.
- Why: INV-72 / A-18: legacy defined `handleSaveAll` but never rendered it; the spec asks for one Save with a reason.
- Reversible: yes.

### D-0436 — Base Currency, Fiscal Year Cycle and IGST % kept as inert preferences

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: Kept as legacy settings elements under the preference keys `currency`, `fiscal_year_cycle` and `igst_pct` (defaults INR, APR_MAR, 18); no calculation reads them.
- Alternatives: Remove them.
- Why: C7 freezes on-screen elements; A2-4: they drive no rule.
- Reversible: yes.

### D-0437 — No Download Folders settings section

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: The legacy Download Folders section is not built.
- Alternatives: Port it.
- Why: SPEC-15 §9; file locations come from the Storage port (C17).
- Reversible: yes.

### D-0438 — Settings inputs without leading icons

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: The legacy settings inputs' leading icons are dropped; inputs are the shared FormField/Input.
- Alternatives: An icon slot on Input.
- Why: C7 allows minor visual changes for consistency; one registry input.
- Reversible: yes.

### D-0439 — Onboarding screen labels

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: Title "Welcome", sections "Supplier Profile" and "GST Rates" (CGST/SGST only), button "Save and Continue", shown without the app chrome.
- Alternatives: Show IGST too.
- Why: SPEC-15 §2: onboarding uses the settings layout and fields; the onboarding body takes CGST/SGST.
- Reversible: yes.

### D-0440 — Login card position and errors

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: The login card sits at a fixed top offset with inline errors; only a 401 with code `signed-out` redirects to the login.
- Alternatives: A vertically centred card; redirect on every 401.
- Why: C8: opening the reset panel must not move the card; a wrong password is a 401 too and stays on the form.
- Reversible: yes.

### D-0441 — Funnel shares are display arithmetic; Pending Dispatch is a domain rule

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: Each stage's share of the ordered quantity (one decimal, clamped 0-100) is computed in the web as presentation; Pending Dispatch (`max(0, ordQty - dspQty)`) is `pendingDispatchQty` in packages/domain, served as `funnel.pendingQty` by `dashboard.summary`.
- Alternatives: Compute both in the web; serve the shares too.
- Why: C2 (review of #83): quantities are computed only in the domain; a share of two served values is presentation (A-22).
- Reversible: yes.

### D-0442 — Deviation action row

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: Shows the open-flag count and keeps the legacy `/srv` link.
- Alternatives: Link to `/deviations`.
- Why: INV-60; C7 frozen flows.
- Reversible: yes.

### D-0443 — Search panels and history

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: The filter and saved-search panels open over the result panes; recent and saved searches stay in localStorage under the legacy keys `sensto_recent_searches` and `sensto_saved_searches`.
- Alternatives: Panels that push the panes; server-side history.
- Why: C8; legacy storage, a per-device convenience.
- Reversible: yes.

### D-0444 — No length rule on a new password

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: Change password checks only that fields are filled and the two new entries match.
- Alternatives: The legacy 8-character minimum.
- Why: C11 / INV-80.
- Reversible: yes.

### D-0445 — BHEL portal password controls

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: The field always offers Change; Clear is disabled when nothing is saved.
- Alternatives: Separate Set and Change labels.
- Why: INV-81 (status only); fewest elements.
- Reversible: yes.

### D-0446 — Blank supplier fields stored as null

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: Blank supplier fields are sent as null; "Business Tagline / GC Header" is `invoiceDefaults.description`.
- Alternatives: Empty strings.
- Why: D-0298; the API schema's nullable fields.
- Reversible: yes.

### D-0447 — GSTIN placeholders are plain text

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: GSTIN inputs show "15-character GSTIN" rather than a sample GSTIN.
- Alternatives: The legacy sample value.
- Why: C1: the real-data scan flags GSTIN-shaped strings.
- Reversible: yes.

### D-0448 — Settings Save makes two writes in order

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: Save sends the supplier update, then the settings update, each only when dirty; a partial save shows the error and a second Save sends what is still dirty; no version check.
- Alternatives: Parallel writes; a combined endpoint.
- Why: The SPEC-07 routes are separate; in order, a refused profile stops before the settings write.
- Reversible: yes.

### D-0449 — Shared ButtonGroup built in SPEC-15

- Date: 2026-10-15 · Spec/PR: SPEC-15 PRs 1-5 (#83) · Status: decided
- Decision: The legacy segmented control is a shared `ButtonGroup` in the common registry, built in this PR.
- Alternatives: Wait for SPEC-14.
- Why: Not in SPEC-14's list; settings and the dashboard both need it; the parallel SPEC-14 and SPEC-16 workers did not take it.
- Reversible: yes.

### D-0590 — Settings: state, state code and invoice defaults

- Date: 2026-10-15 · Spec/PR: SPEC-15 E2E FIX-3 (#94) · Status: decided
- Decision: State and State Code use the supplier's columns; Jurisdiction (City), Default Place of Supply and Default HSN are `invoiceDefaults` keys (no migration); a blank one is removed. The supplier's place of supply is labelled "Default Place of Supply", apart from the buyer's.
- Alternatives: New columns.
- Why: No migration in this batch; D-0298 keys the description this way.
- Reversible: yes.
