// Claude Code PreToolUse hook: deny a Bash or PowerShell command that holds an MSYS drive path such as /c/Projects.
//
// The Bash tool runs Git Bash with MSYS_NO_PATHCONV=1 and MSYS2_ARG_CONV_EXCL=*, so MSYS path conversion is off. A
// native Windows program (git, node, vp, pnpm) then reads /c/Projects/x as C:\c\Projects\x: agents created stray
// worktrees and folders under C:/c/ that way (docs/plans/RECURRING.md). A drive path counts when /<letter>/ starts
// the command or follows whitespace, a quote, `=` or `:` (which also catches a mangled C:/c/...), so URLs, sed
// expressions like s/c/d/ and relative paths pass. This guards against mistakes, not against evasion.
import { guard } from "./hook-input.ts";

const MSYS_DRIVE_PATH = /(?:^|[\s'"=:])\/[A-Za-z]\//;

const REASON =
  "path guard: MSYS drive paths like /c/Projects/... reach native Windows programs as C:/c/Projects/... (path" +
  " conversion is off in this shell); write C:/Projects/... instead. Create worktrees with" +
  " tools/orchestrator/new_worktree.sh.";

guard("path guard", (command) => (MSYS_DRIVE_PATH.test(command) ? REASON : undefined));
