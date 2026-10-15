// Watching the sidecar (ADR 0001). It prints one `SENSTO_PORT=<port>` line once startup has finished; a failed start
// writes a plain message to stderr and exits without it. Whatever it last said on stderr is what the shell shows.

interface Lines {
  on(event: "data", listener: (line: string) => void): unknown;
}

/** The parts of plugin-shell's `Command` the shell listens to. */
export interface SidecarOutput {
  readonly stdout: Lines;
  readonly stderr: Lines;
  on(event: "close", listener: (payload: { code: number | null }) => void): unknown;
}

export type Startup =
  | { readonly kind: "ready"; readonly port: number }
  | { readonly kind: "exited"; readonly message: string };

export interface SidecarWatch {
  /** The port line, or the exit that came before it. */
  readonly startup: Promise<Startup>;
  /** The message to show when the sidecar exits, whenever that is. */
  readonly exit: Promise<string>;
}

const PORT_LINE = /^SENSTO_PORT=([1-9]\d{0,4})$/;
const UNEXPLAINED_EXIT = "SenstoSales stopped unexpectedly.";

function parsePort(line: string): number | null {
  const digits = PORT_LINE.exec(line.trim())?.[1];
  if (digits === undefined) return null;
  const port = Number(digits);
  return port <= 65_535 ? port : null;
}

export function watchSidecar(command: SidecarOutput): SidecarWatch {
  let message = UNEXPLAINED_EXIT;
  // Node prints a crash as the error line followed by indented stack frames; the error line is the message.
  command.stderr.on("data", (line) => {
    const text = line.trimEnd();
    if (text && !/^\s/.test(text)) message = text;
  });
  const exit = new Promise<string>((resolve) => command.on("close", () => resolve(message)));
  const startup = new Promise<Startup>((resolve) => {
    command.stdout.on("data", (line) => {
      const port = parsePort(line);
      if (port !== null) resolve({ kind: "ready", port });
    });
    void exit.then((text) => resolve({ kind: "exited", message: text }));
  });
  return { startup, exit };
}
