import { deleteBlock } from "@senstosales/domain";
import type { RouteOutput, zPoStatus } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtMoney, fmtMoneyCompact, fmtQty } from "@senstosales/schemas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { z } from "zod";

import { useListSearch } from "../../../hooks/useListSearch.ts";
import { useSearchText } from "../../../hooks/useSearchText.ts";
import { api, apiQuery } from "../../../lib/api.ts";
import {
  AlertCircle,
  Delete,
  DeliveryChallan,
  FolderOpen,
  IndianRupee,
  Invoice,
  Link2,
  Monitor,
  MoreHorizontal,
  Package,
  Plus,
  Upload,
} from "../../../lib/icons.ts";
import { rangeQuery } from "../../../lib/search.ts";
import { uploadHtml } from "../../../lib/upload.ts";
import { getPlatform } from "../../../platform/index.ts";
import {
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  FileUploadModal,
  FolderImport,
  ListFilters,
  ListToolbar,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatCard,
  StatCardRow,
  useToast,
} from "../../common/index.ts";
import { LinkedDocsPopover } from "./LinkedDocsPopover.tsx";
import { StatusCell } from "./status.tsx";
import { SupplyProgress } from "./SupplyProgress.tsx";
import type { PoSearch } from "./search.ts";

type Row = RouteOutput<"po.list">["items"][number];
type PoStatus = z.output<typeof zPoStatus>;

/** The legacy status toggle; a second click on the chosen status goes back to All. */
const STATUS_FILTERS: readonly { readonly id: PoStatus | undefined; readonly label: string }[] = [
  { id: undefined, label: "All" },
  { id: "Pending", label: "Pending" },
  { id: "Delivered", label: "Delivered" },
  { id: "Closed", label: "Closed" },
];

/** INV-35: why a PO cannot be deleted, as the legacy list said it, or `null` when it can be. */
export function deleteBlockedReason({ dcCount, invoiceCount }: Pick<Row, "dcCount" | "invoiceCount">): string | null {
  if (deleteBlock("po", { dcs: dcCount, invoices: invoiceCount }) === null) return null;
  const parts = [
    invoiceCount > 0 && `${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"}`,
    dcCount > 0 && `${dcCount} delivery challan${dcCount === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return `Cannot delete - linked to ${parts.join(" and ")}`;
}

const qtyColumn = (key: "ordQty" | "balanceQty" | "rcdQty" | "rejQty", header: string, sortable = true) =>
  ({
    key,
    header,
    width: "90px",
    align: "right",
    sortable,
    render: (row: Row) => <span className="tabular-nums">{fmtQty(row[key])}</span>,
  }) satisfies Column<Row>;

/** BHEL pages the user picks for upload. */
const pickPages = async () => (await getPlatform()).pickFiles({ accept: ".html,.htm", multiple: true });

/** The API's list query from the URL's search. */
const listQuery = ({ page, pageSize, sort, dir, status, gemc, ...ranges }: PoSearch) => ({
  page,
  pageSize,
  sort,
  dir,
  status,
  gemc,
  ...rangeQuery(ranges),
});

function RowActions({ row, onDelete }: { readonly row: Row; onDelete(row: Row): void }) {
  const blocked = deleteBlockedReason(row);
  const links = row.dcCount + row.invoiceCount + row.srvCount;
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="icon" title="Create DC" aria-label={`Create DC for PO ${row.poNumber}`} asChild>
        <Link to="/dc/create" search={{ po: row.id }}>
          <DeliveryChallan className="text-accent" aria-hidden />
        </Link>
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" title="More actions" aria-label={`More actions for PO ${row.poNumber}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1">
          <div className="flex flex-col">
            <Button variant="ghost" size="sm" className="justify-start" asChild>
              <Link to="/invoice/create" search={{ po: row.id }}>
                <Invoice aria-hidden />
                Create Invoice
              </Link>
            </Button>
            <LinkedDocsPopover
              poId={row.id}
              trigger={
                <Button variant="ghost" size="sm" className="justify-start" title="View linked documents">
                  <Link2 aria-hidden />
                  Linked Chain ({links})
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-error"
              disabled={blocked !== null}
              title={blocked ?? `Delete PO ${row.poNumber}`}
              onClick={() => onDelete(row)}
            >
              <Delete aria-hidden />
              Delete
            </Button>
            {blocked && <span className="px-3 pb-1 role-helper-text">{blocked}</span>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function columns(onDelete: (row: Row) => void): Column<Row>[] {
  return [
    {
      key: "poNumber",
      header: "Reference",
      width: "120px",
      sortable: true,
      title: (row) => row.poNumber,
      render: (row) => (
        <Link to="/po/$id" params={{ id: row.id }} className="role-reference-link">
          {row.poNumber}
        </Link>
      ),
    },
    { key: "poDate", header: "Date", width: "96px", sortable: true, render: (row) => fmtDate(row.poDate) },
    {
      key: "isGemc",
      header: "Tags",
      width: "70px",
      render: (row) => (
        <Badge color="primary" size="sm" className={row.isGemc ? undefined : "invisible"} aria-hidden={!row.isGemc}>
          GEMC
        </Badge>
      ),
    },
    {
      key: "itemCount",
      header: "Items",
      width: "64px",
      align: "right",
      sortable: true,
      render: (row) => fmtCount(row.itemCount),
    },
    qtyColumn("ordQty", "Ordered"),
    qtyColumn("balanceQty", "Pending", false),
    {
      key: "dspQty",
      header: "Dispatched",
      width: "130px",
      align: "right",
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center justify-end gap-2 tabular-nums">
          {fmtQty(row.dspQty)}
          <SupplyProgress ordQty={row.ordQty} dspQty={row.dspQty} rcdQty={row.rcdQty} />
        </span>
      ),
    },
    qtyColumn("rcdQty", "Received"),
    // Accepted is shown as received (INV-09).
    { ...qtyColumn("rcdQty", "Accepted", false), key: "acceptedQty" },
    qtyColumn("rejQty", "Rejected"),
    {
      key: "poValue",
      header: "Value",
      width: "120px",
      align: "right",
      sortable: true,
      render: (row) => (row.poValue === null ? "—" : fmtMoney(row.poValue, { gemc: row.isGemc })),
    },
    {
      key: "status",
      header: "Status",
      width: "104px",
      sortable: true,
      render: (row) => <StatusCell status={row.status} />,
    },
    {
      key: "openFlagCount",
      header: "Flags",
      width: "64px",
      // The badge keeps its slot when there is nothing to flag (C8, INV-71).
      render: (row) => (
        <Badge
          color="warning"
          size="sm"
          className={row.openFlagCount === 0 ? "invisible" : undefined}
          title={`${row.openFlagCount} open flag${row.openFlagCount === 1 ? "" : "s"}`}
        >
          {fmtCount(row.openFlagCount)}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "96px",
      align: "right",
      render: (row) => <RowActions row={row} onDelete={onDelete} />,
    },
  ];
}

/** `/po` (SPEC-16 §2): the legacy PO list, leading with quantity columns (INV-65). */
export function POList() {
  const list = useListSearch<PoSearch>();
  const { search, setFilters } = list;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = listQuery(search);
  const rows = useQuery(apiQuery("po.list", { query }));
  const { page: _p, pageSize: _s, sort: _o, dir: _d, ...filters } = query;
  const stats = useQuery(apiQuery("po.stats", { query: filters }));
  const searchBox = useSearchText(search.q, (q) => setFilters({ q }));

  const [files, setFiles] = useState<readonly File[]>([]);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("po.") });

  async function confirmDelete(row: Row) {
    setBusy(true);
    try {
      await api.request("po.delete", { params: { id: row.id } });
      toast("PO deleted", `PO ${row.poNumber} has been deleted successfully.`, "success");
      setDeleting(null);
      await refresh();
    } catch (error) {
      toast("Delete failed", error instanceof Error ? error.message : "Failed to delete purchase order", "error");
    } finally {
      setBusy(false);
    }
  }

  const s = stats.data;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage procurement contracts and track materials"
        action={
          <>
            <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/po/ingest-bhel" })}>
              <Monitor aria-hidden />
              Ingest BHEL
            </Button>
            <Button size="sm" onClick={() => void navigate({ to: "/po/create" })}>
              <Plus aria-hidden />
              Create
            </Button>
          </>
        }
      />
      <StatCardRow>
        <StatCard title="Active Orders" value={s ? fmtCount(s.count) : "—"} icon={<Package className="size-4" />} />
        <StatCard
          title="Total Value"
          value={s ? fmtMoneyCompact(s.poValue) : "—"}
          icon={<IndianRupee className="size-4" />}
          color="success"
        />
        <StatCard
          title="Total Shipped"
          value={s ? fmtQty(s.dspQty) : "—"}
          icon={<DeliveryChallan className="size-4" />}
          color="warning"
        />
        <StatCard
          title="Total Rejected"
          value={s ? fmtQty(s.rejQty) : "—"}
          icon={<AlertCircle className="size-4" />}
          color="error"
        />
      </StatCardRow>
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <ListToolbar search={{ ...searchBox, placeholder: "Search orders..." }}>
          <div role="group" aria-label="Status" className="flex items-center gap-1 rounded-lg bg-surface-sunken/50 p-1">
            {STATUS_FILTERS.map((option) => (
              <Button
                key={option.label}
                size="sm"
                variant={search.status === option.id ? "default" : "ghost"}
                aria-pressed={search.status === option.id}
                className="h-7"
                onClick={() => setFilters({ status: search.status === option.id ? undefined : option.id })}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <ListFilters dateLabel="PO Date" value={search} onChange={setFilters} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal aria-hidden />
                More
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-2">
              <div className="flex flex-col gap-1">
                <Button
                  variant={search.gemc ? "default" : "ghost"}
                  size="sm"
                  className="justify-start"
                  aria-pressed={search.gemc === true}
                  onClick={() => setFilters({ gemc: search.gemc ? undefined : true })}
                >
                  GEMC only
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => void pickPages().then((picked) => picked && setFiles(picked))}
                >
                  <Upload aria-hidden />
                  Upload PO HTML
                </Button>
                <Button variant="ghost" size="sm" className="justify-start" onClick={() => setImporting(true)}>
                  <FolderOpen aria-hidden />
                  Import Folders
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </ListToolbar>
        <DataTable
          columns={columns(setDeleting)}
          rows={rows.data?.items}
          total={rows.data?.total ?? 0}
          state={rows.isError ? "error" : rows.isFetching ? "loading" : "ready"}
          error={rows.error?.message}
          emptyText="No purchase orders found."
          rowHighlight={(row) => row.openFlagCount > 0}
          {...list.table}
        />
      </div>
      <FolderImport
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() =>
          void queryClient.invalidateQueries({ predicate: (q) => /^(po|srv)\./.test(String(q.queryKey[0])) })
        }
      />
      <FileUploadModal
        open={files.length > 0}
        files={files}
        title="Import PO Data"
        onUpload={(file) => uploadHtml("po.upload", file)}
        onClose={() => {
          setFiles([]);
          void refresh();
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void confirmDelete(deleting)}
        title="Delete Purchase Order"
        warningText={
          deleting
            ? `This will permanently remove PO ${deleting.poNumber} and all its line items. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete PO"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
