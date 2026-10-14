// The Logger port (ARCHITECTURE §4.1): structured levels. Fields never carry a secret, a cookie or a document body
// (INV-81, INV-106); the pino adapter is SPEC-21's.
export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(fields: LogFields, message: string): void;
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
}
