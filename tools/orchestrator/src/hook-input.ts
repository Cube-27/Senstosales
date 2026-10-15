// Shared runner for the PreToolUse guard hooks (merge-guard.ts, path-guard.ts).
//
// Reads the hook JSON on stdin. Exits 2 with the reason on stderr to deny, 0 to allow. Input it can't read is denied;
// any other error exits 1, which the hook command in .claude/settings.json also turns into a deny.
import { readFileSync } from "node:fs";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The hook input's command, or "" for a tool without one. Throws on input that isn't hook JSON. */
function commandOf(payload: string): string {
  const data: unknown = JSON.parse(payload);
  if (!isObject(data)) throw new Error("hook input is not a JSON object");
  const command = isObject(data["tool_input"]) ? data["tool_input"]["command"] : undefined;
  return typeof command === "string" ? command : "";
}

/** Runs the guard NAME on the hook input: DENIAL returns the reason to deny a command, or undefined to allow it. */
/** The reason to deny the hook input, or undefined to allow it. */
function denialOf(name: string, payload: string, denial: (command: string) => string | undefined): string | undefined {
  let command: string;
  try {
    command = commandOf(payload);
  } catch (error) {
    return `${name}: unreadable hook input (${(error as Error).message}); denying.`;
  }
  return denial(command);
}

/** Runs the guard NAME on the hook input on stdin: DENIAL returns the reason to deny a command, or undefined. */
export function guard(name: string, denial: (command: string) => string | undefined): void {
  const reason = denialOf(name, readFileSync(0, "utf8"), denial);
  // exitCode, not process.exit(): stderr to a pipe can be asynchronous, and exit() could drop the reason.
  if (reason !== undefined) {
    process.stderr.write(`${reason}\n`);
    process.exitCode = 2;
  }
}
