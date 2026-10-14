#!/bin/bash
# The `tools` CI job, also run locally by `pnpm check:tools`: Python lint and format, the tool tests, shell syntax.
set -euo pipefail
uvx ruff check tools
uvx ruff format --check tools
uv run --with pytest pytest tools/tests
for f in tools/*.sh tools/orchestrator/*.sh; do bash -n "$f"; done
