// The backup files port (SPEC-21 §4, ARCHITECTURE §13.3): the database's copies in `backups/`, named by the backup
// service. A name is a plain file name the service made or read from `list`, never a path from a request (C17).
export interface BackupFiles {
  /** The file names in `backups/`, sorted. */
  list(): Promise<string[]>;
  /** Copies the live database to `name` with the online backup API. A file of that name is replaced only by a
   * complete copy. */
  create(name: string): Promise<void>;
  delete(name: string): Promise<void>;
  /**
   * Copies backup `name` into the live database with the online backup API, then upgrades it if its schema is older
   * (§13.3). A backup that is damaged or newer than this build is refused with a `ValidationError` before the live
   * database is touched.
   */
  restore(name: string): Promise<void>;
}
