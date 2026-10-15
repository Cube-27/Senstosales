# SenstoSales

A supplier-side ERP for BHEL purchase orders: upload POs and SRVs, create DCs and invoices, and track quantities.

> **Status: early implementation.** Progress is tracked in [docs/plans/ACTIVE.md](docs/plans/ACTIVE.md).

**Agents: read CLAUDE.md before changing anything.**

## What it does

Planned for v1 (see the specs; nothing below is claimed until its tests pass):

- Import BHEL purchase orders (POs) and stores receipt vouchers (SRVs) from their HTML pages, or sync them from the portal.
- Create delivery challans (DCs), invoices and guarantee certificates, and download them as Excel.
- Track ordered, dispatched, received, accepted and rejected quantities per PO item, by financial year.
- Highlight reconciliation issues (quantity mismatches, over-dispatch, unknown document numbers) without blocking work.
- Runs locally as a Windows desktop app; designed so it can later be self-hosted on Cloudflare.

## Documentation

| Document                                         | Purpose                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | The single design reference                                         |
| [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) | Owner decisions still open, each with a recommended default         |
| [docs/specs/](docs/specs/README.md)              | Implementation specs in build order, each with a PR plan            |
| [docs/DECISIONS.md](docs/DECISIONS.md)           | Decisions log: rules, cross-cutting entries, index of open items    |
| [docs/decisions/](docs/decisions)                | Decisions made during implementation, one file per spec             |
| [docs/plans/ACTIVE.md](docs/plans/ACTIVE.md)     | Current implementation state                                        |
| [docs/INVARIANTS.md](docs/INVARIANTS.md)         | Testable invariants, each with what enforces it                     |
| [docs/ENGINEERING.md](docs/ENGINEERING.md)       | Engineering principles for agents                                   |
| [CLAUDE.md](CLAUDE.md)                           | Rules for coding agents, and every command                          |
| [CONTRIBUTING.md](CONTRIBUTING.md)               | Checks, pull requests, decisions                                    |
| [.claude/skills/](.claude/skills/)               | Agent procedures: `run-plan`, `implement-pr`, `review-pr`, `pickup` |

## Stack

TypeScript (pnpm monorepo), Hono, Drizzle over SQLite, Vite + React, Tauri 2

## Getting started

You need: Node 26+ and pnpm 11.

```sh
pnpm install
pnpm hooks     # once per clone
pnpm verify
pnpm start     # build the web UI and run the app at http://127.0.0.1:<port>; Ctrl+C stops it
```

Every other command, including the checks CI runs, is in [CLAUDE.md §7](CLAUDE.md#7-commands).

## Repository layout

```
packages/    domain rules, schemas, db, parsers, documents, scraper (added as the specs land)
apps/        api, web, desktop
docs/        architecture, open questions, specs, decisions, tracker, invariants
tools/       repo checks and the agent orchestrator scripts
.github/     CI workflows and the pull request template
.claude/     agent skills
```

## License

[AGPL-3.0-only](LICENSE). Third-party attributions: [NOTICE](NOTICE).
