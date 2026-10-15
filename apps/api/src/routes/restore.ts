// Backups in Settings (SPEC-21 §2): the list and restore. Backup now starts the `backup` job through `jobs.start`.
import type { Handlers } from "../app.ts";
import type { RestoreService } from "../services/restore.ts";

export const restoreRoutes = (restore: RestoreService) =>
  ({
    "backups.list": () => restore.list(),
    "backups.restore": ({ body }) => restore.restore(body.name),
  }) satisfies Handlers;
