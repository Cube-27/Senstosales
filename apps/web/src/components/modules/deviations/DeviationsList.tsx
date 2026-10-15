import { fmtFlagType, fmtInstantDateTime } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useListSearch } from "../../../hooks/useListSearch.ts";
import { useSearchText } from "../../../hooks/useSearchText.ts";
import { apiQuery } from "../../../lib/api.ts";
import { cn } from "../../../lib/cn.ts";
import { CheckCircle, ExternalLink, Refresh, X } from "../../../lib/icons.ts";
import { Badge, Button, Checkbox, type Column, DataTable, ListToolbar, PageHeader } from "../../common/index.ts";
import { type FlagRow, issueText, SCOPE_LABEL } from "./issue.ts";
import { ResolveDialog } from "./ResolveDialog.tsx";
import type { DeviationsSearch } from "./search.ts";

const refLink = "inline-flex max-w-full items-center gap-1 role-reference-number hover:underline";

function columns(onResolve: (flag: FlagRow) => void): Column<FlagRow>[] {
  return [
    {
      key: "type",
      header: "Type",
      width: "150px",
      render: (f) => <Badge color={f.type === "QTY_MISMATCH" ? "error" : "warning"}>{fmtFlagType(f.type)}</Badge>,
    },
    {
      key: "poNumber",
      header: "PO",
      width: "160px",
      title: (f) => f.poNumber,
      render: (f) => (
        <Link to="/po/$id" params={{ id: f.poId }} className={refLink}>
          <span className="truncate">{f.poNumber}</span>
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      ),
    },
    {
      key: "document",
      header: "Document",
      width: "156px",
      render: (f) =>
        f.srvId === null ? (
          <span className="role-helper-text">{SCOPE_LABEL[f.scopeType]}</span>
        ) : (
          <Link to="/srv/$id" params={{ id: f.srvId }} className={refLink}>
            <span className="truncate">SRV {f.srvNumber}</span>
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        ),
    },
    { key: "issue", header: "Issue", width: "380px", title: issueText, render: issueText },
    {
      key: "expected",
      header: "Expected",
      width: "96px",
      align: "right",
      render: (f) => <span className="tabular-nums">{f.details.expected ?? "—"}</span>,
    },
    {
      key: "actual",
      header: "Actual",
      width: "96px",
      align: "right",
      render: (f) => <span className="text-error tabular-nums">{f.details.actual}</span>,
    },
    {
      key: "openedAt",
      header: "Detected",
      width: "168px",
      render: (f) => <span className="role-helper-text">{fmtInstantDateTime(f.openedAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "96px",
      render: (f) =>
        f.status === "open" ? <Badge color="warning">Open</Badge> : <Badge color="success">Resolved</Badge>,
    },
    {
      key: "resolve",
      header: "",
      width: "140px",
      align: "right",
      render: (f) =>
        f.status === "open" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve(f)}
            className="text-success hover:bg-success/10 hover:text-success"
          >
            <CheckCircle aria-hidden />
            Resolve
          </Button>
        ),
    },
  ];
}

/**
 * `/deviations` (SPEC-17 §2): the reconciliation flags, open ones unless Show resolved is ticked, each with its type
 * in plain words (INV-58), links to its PO and SRV, and Resolve (acknowledge, INV-59). Open flags are highlighted.
 */
export function DeviationsList() {
  const list = useListSearch<DeviationsSearch>();
  const { search, setFilters } = list;
  const query = {
    page: search.page,
    pageSize: search.pageSize,
    dir: search.dir,
    q: search.q?.trim() || undefined,
    type: search.type,
    poId: search.poId,
    status: search.resolved ? undefined : ("open" as const),
  };
  const flags = useQuery(apiQuery("flags.list", { query }));
  const searchBox = useSearchText(search.q, (q) => setFilters({ q }));
  const [resolving, setResolving] = useState<FlagRow | null>(null);
  const cols = useMemo(() => columns(setResolving), []);
  const filtered = search.q !== undefined || search.resolved !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Deviations"
        subtitle="Review ingestion discrepancies, verify real mismatches, and close stale flags."
      />
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <ListToolbar search={{ ...searchBox, placeholder: "Search PO, SRV, type, qty..." }}>
          <label className="flex items-center gap-2 whitespace-nowrap role-helper-text">
            <Checkbox
              checked={search.resolved === true}
              onCheckedChange={(checked) => setFilters({ resolved: checked === true || undefined })}
              className="size-4"
            />
            Show resolved
          </label>
          <Button variant="outline" size="sm" onClick={() => void flags.refetch()}>
            <Refresh className={cn(flags.isFetching && "animate-spin")} aria-hidden />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!filtered}
            onClick={() => setFilters({ q: undefined, resolved: undefined })}
          >
            <X aria-hidden />
            Clear
          </Button>
        </ListToolbar>
        <DataTable
          columns={cols}
          rows={flags.data?.items}
          total={flags.data?.total ?? 0}
          {...list.table}
          state={flags.isError ? "error" : flags.isFetching ? "loading" : "ready"}
          error={flags.error?.message}
          emptyText="No deviations found for the current filters"
          rowHighlight={(f) => f.status === "open"}
        />
      </div>
      <ResolveDialog flag={resolving} onClose={() => setResolving(null)} />
    </div>
  );
}
