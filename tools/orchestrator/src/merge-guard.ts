// PreToolUse guard (run by guards.ts): deny a Bash or PowerShell command that merges a pull request directly.
//
// `tools/orchestrator/merge_pr.sh` is the only sanctioned merge path: it merges on a passing CI wait, pinned to the
// head commit, after the implementor's tracker commit. Agents have merged their own PRs anyway, so this hook denies
// `gh pr merge` (including `--auto`), REST calls to the merge endpoint (`pulls/<n>/merge`, any client) and the
// GraphQL merge mutations. The command string is all the hook sees, so `merge_pr.sh`'s own `gh` call is not a tool
// call and passes. This guards against mistakes, not against an agent set on evading it (aliases, scripts written to
// disk, a quoted here-document piped to a shell).
//
const REASON =
  "merge guard: agents don't merge PRs directly. Comment READY <sha7> on the PR and stop; the orchestrator merges" +
  " with tools/orchestrator/merge_pr.sh after the tracker commit (CLAUDE.md section 3, /implement-pr section 6).";

// GitHub REST "Merge a pull request": PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge. The end also matches
// before one trailing newline.
const PULLS_MERGE = /(?:^|\/)pulls\/[^/\s]+\/merge\/?(?:\?\S*)?(?=\n?(?![\s\S]))/;
// GitHub GraphQL mutations that merge a pull request or schedule its merge.
const MERGE_MUTATIONS = /\b(?:mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)\b/;
// Fallback for text the tokenizer can't split (unbalanced quotes, a trailing backslash).
const GH_PR_MERGE_TEXT = /\bgh(?:\.exe)?\s+pr\s+merge\b/;

// Bash and PowerShell control operators and grouping; each starts a new command.
const SEPARATORS = new Set(";&|()<>\n`");
const WHITESPACE = new Set(" \t\r");
// gh flags placed between `pr` and `merge` that take a value.
const GH_VALUE_FLAGS = new Set(["-R", "--repo"]);
// Shells whose `-c`/`-Command`/`/c` flag takes a command string (`bash -c`, `pwsh -Command`, `cmd /c`). The flag
// counts only after a shell, since `grep -c`, `rg -c` and `git -c` take no command.
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "pwsh", "powershell", "cmd"]);
const SHELL_COMMAND_FLAGS = new Set(["-c", "-command", "/c"]);
// Commands whose next argument is itself a command string.
const EVAL_COMMANDS = new Set(["iex", "invoke-expression"]);
const MAX_NESTING = 3;
// Bodies that the shell passes on as literal text, never runs: a bash here-document with a quoted delimiter
// (`<<'EOF'`, Bash manual "Here Documents": no expansion in the body) and a PowerShell single-quoted here-string
// (`@'...'@`, about_Quoting_Rules). Unquoted ones expand `$(...)`, so they stay in. The delimiter line must end at a
// newline or the end of the text; a carriage return does not end it.
const QUOTED_HEREDOC = /(<<-?[ \t]*(['"])(\w+)\2[^\n]*)\n[\s\S]*?(?<=\n)[ \t]*\3[ \t]*(?=\n|(?![\s\S]))/g;
const LITERAL_HERE_STRING = /@'\r?\n[\s\S]*?\r?\n'@/g;

class TokenizeError extends Error {}

// Line continuations join a command split across lines: a bash backslash-newline is removed, a PowerShell
// backtick-newline reads as a space. CodeAnt on #10: both passed `gh pr <continuation> merge`.
const LINE_CONTINUATION = /\\\r?\n/g;
const BACKTICK_CONTINUATION = /`\r?\n/g;

const withoutLiteralBodies = (command: string): string =>
  command
    .replace(QUOTED_HEREDOC, "$1")
    .replace(LITERAL_HERE_STRING, "''")
    .replace(LINE_CONTINUATION, "")
    .replace(BACKTICK_CONTINUATION, " ");

type Lexer = { tokens: string[]; token: string; quoted: boolean };

function endToken(lexer: Lexer): void {
  if (lexer.token || lexer.quoted) lexer.tokens.push(lexer.token);
  lexer.token = "";
  lexer.quoted = false;
}

/** Reads a quoted string starting after the opening quote at TEXT[i]; returns the index after the closing quote. */
function readQuoted(text: string, start: number, lexer: Lexer): number {
  const quote = text[start - 1];
  lexer.quoted = true;
  for (let i = start; i < text.length; i++) {
    const char = text[i]!;
    if (char === quote) return i + 1;
    // Inside double quotes a backslash escapes only `"` and `\`; anywhere else it stays.
    if (char === "\\" && quote === '"') {
      const next = text[++i];
      if (next === undefined) break;
      lexer.token += next === '"' || next === "\\" ? next : `\\${next}`;
    } else {
      lexer.token += char;
    }
  }
  throw new TokenizeError("No closing quotation");
}

/**
 * Words and separator runs, as POSIX shell quoting splits them: quotes join, a backslash escapes the next character,
 * and a run of separator characters is one token. Throws on an unclosed quote or a trailing backslash.
 */
function tokenize(command: string): string[] {
  const text = withoutLiteralBodies(command);
  const lexer: Lexer = { tokens: [], token: "", quoted: false };
  for (let i = 0; i < text.length;) {
    const char = text[i]!;
    if (SEPARATORS.has(char)) {
      endToken(lexer);
      let end = i;
      while (end < text.length && SEPARATORS.has(text[end]!)) end++;
      lexer.tokens.push(text.slice(i, end));
      i = end;
    } else if (WHITESPACE.has(char)) {
      endToken(lexer);
      i++;
    } else if (char === "'" || char === '"') {
      i = readQuoted(text, i + 1, lexer);
    } else if (char === "\\") {
      if (i + 1 >= text.length) throw new TokenizeError("No escaped character");
      lexer.token += text[i + 1];
      i += 2;
    } else {
      lexer.token += char;
      i++;
    }
  }
  endToken(lexer);
  return lexer.tokens;
}

const isSeparator = (token: string): boolean => token !== "" && [...token].every((char) => SEPARATORS.has(char));

function segments(tokens: string[]): string[][] {
  const result: string[][] = [[]];
  for (const token of tokens) {
    if (isSeparator(token)) result.push([]);
    else result.at(-1)!.push(token);
  }
  return result;
}

/** A token as a command name: its last path part, lower-cased, without `.exe`. */
const program = (token: string): string =>
  token
    .split(/[\\/]/)
    .at(-1)!
    .toLowerCase()
    .replace(/\.exe$/, "");

function ghPositionals(args: string[]): string[] {
  const positionals: string[] = [];
  let skipValue = false;
  for (const arg of args) {
    if (skipValue) skipValue = false;
    else if (GH_VALUE_FLAGS.has(arg)) skipValue = true;
    else if (!arg.startsWith("-")) positionals.push(arg);
  }
  return positionals;
}

const runsGhPrMerge = (segment: string[]): boolean =>
  segment.some((token, index) => {
    if (program(token) !== "gh") return false;
    const [first, second] = ghPositionals(segment.slice(index + 1));
    return first === "pr" && second === "merge";
  });

const callsMergeApi = (segment: string[]): boolean =>
  segment.some((token) => PULLS_MERGE.test(token) || MERGE_MUTATIONS.test(token));

function nestedCommands(segment: string[]): string[] {
  const nested: string[] = [];
  let afterShell = false;
  for (let i = 0; i + 1 < segment.length; i++) {
    const marker = segment[i]!;
    afterShell ||= SHELLS.has(program(marker));
    if (EVAL_COMMANDS.has(program(marker)) || (afterShell && SHELL_COMMAND_FLAGS.has(marker.toLowerCase()))) {
      nested.push(segment[i + 1]!);
    }
  }
  // Command substitution inside a double-quoted string (`"$(...)"`, `` "`...`" ``) still runs.
  return [...nested, ...segment.filter((token) => token.includes("$(") || token.includes("`"))];
}

function mergesDirectly(command: string, depth = 0): boolean {
  let tokens: string[];
  try {
    tokens = tokenize(command);
  } catch (error) {
    if (!(error instanceof TokenizeError)) throw error;
    return GH_PR_MERGE_TEXT.test(command) || callsMergeApi(command.split(/\s+/).filter(Boolean));
  }
  return segments(tokens).some(
    (segment) =>
      runsGhPrMerge(segment) ||
      callsMergeApi(segment) ||
      (depth < MAX_NESTING && nestedCommands(segment).some((inner) => mergesDirectly(inner, depth + 1))),
  );
}

/** The reason to deny COMMAND, or undefined to allow it. */
export const mergeDenial = (command: string): string | undefined => (mergesDirectly(command) ? REASON : undefined);
