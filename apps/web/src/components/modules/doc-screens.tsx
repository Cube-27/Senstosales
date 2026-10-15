// What the DC and invoice screens share: the SRVs linked in a detail subtitle, a list's Download and Create, and a
// list row's confirmed delete.
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useInvalidate } from "../../lib/api.ts";
import { FileText, Plus } from "../../lib/icons.ts";
import { Button, ExcelButton, useToast } from "../common/index.ts";

/** The subtitle's linked SRVs (INV-37), after a separator; nothing when none is linked. */
export function LinkedSrvs({ srvs }: { readonly srvs: readonly { readonly id: string; readonly number: string }[] }) {
  if (srvs.length === 0) return null;
  return (
    <>
      <span className="opacity-40">•</span>
      <span className="inline-flex gap-1">
        SRV:
        {srvs.map((srv) => (
          <Link key={srv.id} to="/srv/$id" params={{ id: srv.id }} className="role-reference-link">
            {srv.number}
          </Link>
        ))}
      </span>
    </>
  );
}

/** A document list's header actions: the list export and the create form. */
export function ListHeaderActions({
  downloading,
  onDownload,
  createTo,
}: Readonly<{ downloading: boolean; onDownload(): void; createTo: "/dc/create" | "/invoice/create" }>) {
  const navigate = useNavigate();
  return (
    <>
      <ExcelButton loading={downloading} onClick={onDownload}>
        <FileText aria-hidden />
        Download
      </ExcelButton>
      <Button size="sm" onClick={() => void navigate({ to: createTo })}>
        <Plus aria-hidden />
        Create
      </Button>
    </>
  );
}

interface RowDelete<Row> {
  /** The document's name in the toast title (`DC deleted`). */
  readonly noun: string;
  /** The API delete of a row. */
  remove(row: Row): Promise<unknown>;
  /** The deleted toast's message. */
  deleted(row: Row): string;
  /** The resources whose queries refetch after a delete. */
  readonly resources: readonly string[];
}

/**
 * A list row's delete behind its confirm dialog: the row asked about, the dialog's props, and a toast either way. A
 * refused delete (409, INV-35) shows the API's reason.
 */
export function useRowDelete<Row>({ noun, remove, deleted, resources }: RowDelete<Row>) {
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(row: Row) {
    setBusy(true);
    try {
      await remove(row);
      toast(`${noun} deleted`, deleted(row), "success");
      await invalidate(...resources);
    } catch (error) {
      toast("Delete failed", error instanceof Error ? error.message : "Delete failed", "error");
    } finally {
      setDeleting(null);
      setBusy(false);
    }
  }

  return {
    deleting,
    ask: setDeleting,
    dialog: {
      open: deleting !== null,
      onClose: () => setDeleting(null),
      onConfirm: () => deleting !== null && void confirm(deleting),
      loading: busy,
    },
  };
}
