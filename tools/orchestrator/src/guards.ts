// Claude Code PreToolUse hook for Bash and PowerShell: runs every guard on the command, in one node process.
//
// Reads the hook JSON on stdin. Exits 2 with the first guard's reason on stderr to deny, 0 to allow. Input it can't
// read is denied; any other error exits 1, which the hook command in .claude/settings.json also turns into a deny.
import { readFileSync } from "node:fs";

import { mergeDenial } from "./merge-guard.ts";
import { pathDenial } from "./path-guard.ts";

const GUARDS = [mergeDenial, pathDenial];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The hook input's command, or "" for a tool without one. Throws on input that isn't hook JSON. */
function commandOf(payload: string): string {
  const data: unknown = JSON.parse(payload);
  if (!isObject(data)) throw new Error("hook input is not a JSON object");
  const command = isObject(data["tool_input"]) ? data["tool_input"]["command"] : undefined;
  return typeof command === "string" ? command : "";
}

/** The reason to deny the hook input, or undefined to allow it. */
function denial(payload: string): string | undefined {
  let command: string;
  try {
    command = commandOf(payload);
  } catch (error) {
    return `guard: unreadable hook input (${(error as Error).message}); denying.`;
  }
  for (const guard of GUARDS) {
    const reason = guard(command);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

// exitCode, not process.exit(): stderr to a pipe can be asynchronous, and exit() could drop the reason.
const reason = denial(readFileSync(0, "utf8"));
if (reason !== undefined) {
  process.stderr.write(`${reason}\n`);
  process.exitCode = 2;
}
