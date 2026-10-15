import { fmtInstantDateTime, type RouteOutput } from "@senstosales/schemas";

import { History } from "../../../lib/icons.ts";
import { titleCase } from "../../../lib/text.ts";
import { Badge, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../common/index.ts";
import { moduleOf } from "./modules.ts";

export type AuditRow = RouteOutput<"audit.list">["items"][number];

export interface LogDetailDialogProps {
  /** The row shown; closed while null. */
  readonly entry: AuditRow | null;
  onClose(): void;
}

/** The legacy Log Details dialog: the event, when and by whom, and the row's changed values. */
export function LogDetailDialog({ entry, onClose }: LogDetailDialogProps) {
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3">
          <History className="size-4 text-accent" aria-hidden />
          <DialogTitle>Log Details</DialogTitle>
          <DialogDescription className="sr-only">
            The audit entry: event, time, actor and changed values
          </DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-1.5 border-b border-border/50 pb-4">
              <p className="role-field-label">Event Class</p>
              <h3 className="role-section-title">{titleCase(entry.action)}</h3>
              <code className="role-helper-text">{entry.action}</code>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-1.5">
                <p className="role-field-label">Occurrence</p>
                <span className="role-table-cell tabular-nums">{fmtInstantDateTime(entry.at)}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="role-field-label">Initiated By</p>
                <span className="role-helper-text">{entry.actor}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="role-field-label">Diagnostic Payload</p>
                <Badge>{moduleOf(entry.entityType).label}</Badge>
              </div>
              <pre
                data-testid="payload"
                className="max-h-[300px] overflow-auto rounded-lg border border-border/70 bg-surface-sunken/40 p-4 role-metadata"
              >
                {JSON.stringify(
                  {
                    entityType: entry.entityType,
                    entityId: entry.entityId,
                    before: entry.before,
                    after: entry.after,
                    jobId: entry.jobId,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
