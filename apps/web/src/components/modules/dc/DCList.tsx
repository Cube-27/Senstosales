import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtMoney, fmtMoneyCompact, fmtQty } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useListSearch } from "../../../hooks/useListSearch.ts";
import { useSearchText } from "../../../hooks/useSearchText.ts";
import { api, apiQuery, useInvalidate } from "../../../lib/api.ts";
import { useDownload } from "../../../lib/download.ts";
import { Delete, DeliveryChallan, FileText, IndianRupee, Invoice, Package, Plus } from "../../../lib/icons.ts";
import { rangeQuery } from "../../../lib/search.ts";
import {
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  ExcelButton,
  ListFilters,
  ListToolbar,
  PageHeader,
  qtyColumn,
  StatCard,
  StatCardRow,
  tableQuery,
  useToast,
} from "../../common/index.ts";
import { dcDeleteReason } from "../delete-reasons.ts";
import type { DcSearch } from "./search.ts";

type Row = RouteOutput<"dc.list">["items"][number];

interface RowActionsProps {
  readonly row: Row;
  readonly downloading: boolean;
  onDownload(row: Row): void;
  onDelete(row: Row): void;
}

/** Generate Invoice (kept in its slot once invoiced, C8), the DC's Excel, and delete with its reason (INV-35). */
function RowActions({ row, downloading, onDownload, onDelete }: Readonly<RowActionsProps>) {
  // The list row knows the invoice only; an SRV-linked DC is refused by the API with its reason (EC-62).
  const blocked = dcDeleteReason({ invoice: row.invoice, srvs: [] });
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="icon"
        title="Generate Invoice"
        aria-label={`Generate Invoice for DC ${row.number}`}
        className={row.invoice ? "invisible" : undefined}
        aria-hidden={row.invoice !== null}
        tabIndex={row.invoice ? -1 : undefined}
        asChild
      >
        <Link to="/invoice/create" search={{ dc: row.id }}>
          <Invoice className="text-accent" aria-hidden />
        </Link>
      </Button>
      <Button
        variant="outline"
        size="icon"
        title="Download DC"
        aria-label={`Download DC ${row.number}`}
        loading={downloading}
        onClick={() => onDownload(row)}
      >
        <FileText aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="text-error"
        disabled={blocked !== null}
        title={blocked ?? `Delete DC #${row.number}`}
        aria-label={blocked ?? `Delete DC #${row.number}`}
        onClick={() => onDelete(row)}
      >
        <Delete aria-hidden />
      </Button>
    </div>
  );
}

type Actions = Omit<RowActionsProps, "row" | "downloading"> & { readonly busy: string | null };

function columns(actions: Actions): Column<Row>[] {
  return [
    {
      key: "number",
      header: "Challan #",
      width: "120px",
      sortable: true,
      title: (row) => `${row.number} (FY ${row.financialYear})`,
      render: (row) => (
        <Link to="/dc/$id" params={{ id: row.id }} className="role-reference-link">
          {row.number}
        </Link>
      ),
    },
    { key: "dcDate", header: "Date", width: "96px", sortable: true, render: (row) => fmtDate(row.dcDate) },
    {
      key: "poNumber",
      header: "Linked PO",
      width: "120px",
      sortable: true,
      title: (row) => row.poNumber,
      render: (row) => (
        <Link to="/po/$id" params={{ id: row.poId }} className="role-reference-link">
          {row.poNumber}
        </Link>
      ),
    },
    qtyColumn<Row>("ordQty", "Ordered", (row) => row.ordQty, { sortable: true }),
    qtyColumn<Row>("dspQty", "Dispatched", (row) => row.dspQty, { sortable: true }),
    qtyColumn<Row>("rcdQty", "Received", (row) => row.rcdQty, { sortable: true }),
    {
      key: "value",
      header: "Value",
      width: "120px",
      align: "right",
      sortable: true,
      render: (row) => <span className="tabular-nums">{fmtMoney(row.value, { gemc: false })}</span>,
    },
    {
      key: "openFlagCount",
      header: "Flags",
      width: "64px",
      // The badge keeps its slot when there is nothing to flag (C8, INV-60).
      render: (row) => (
        <Badge
          color="warning"
          size="sm"
          className={row.openFlagCount === 0 ? "invisible" : undefined}
          aria-hidden={row.openFlagCount === 0}
          title={`${row.openFlagCount} open flag${row.openFlagCount === 1 ? "" : "s"}`}
        >
          {fmtCount(row.openFlagCount)}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "130px",
      align: "right",
      render: (row) => <RowActions row={row} downloading={actions.busy === row.id} {...actions} />,
    },
  ];
}

/** `/dc` (SPEC-18 §2): the legacy DC list with a flag badge column, its CSV export and each DC's Excel. */
export function DCList() {
  const list = useListSearch<DcSearch>();
  const { search, setFilters } = list;
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { toast } = useToast();
  const download = useDownload();
  const { page, pageSize, sort, dir, ...ranges } = search;
  const filters = rangeQuery(ranges);
  const rows = useQuery(apiQuery("dc.list", { query: { page, pageSize, sort, dir, ...filters } }));
  const stats = useQuery(apiQuery("dc.stats", { query: filters }));
  const searchBox = useSearchText(search.q, (q) => setFilters({ q }));
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const downloadDc = (row: Row) =>
    void download.run(row.id, `DC ${row.number}`, () => api.request("dc.excel", { params: { id: row.id } }));
  const cols = columns({ busy: download.busy, onDownload: downloadDc, onDelete: setDeleting });

  async function confirmDelete(row: Row) {
    setBusy(true);
    try {
      await api.request("dc.delete", { params: { id: row.id } });
      toast("DC deleted", `DC ${row.number} has been deleted successfully.`, "success");
      setDeleting(null);
      await invalidate("dc", "po");
    } catch (error) {
      toast("Delete failed", error instanceof Error ? error.message : "Failed to delete DC", "error");
    } finally {
      setBusy(false);
    }
  }

  const s = stats.data;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Delivery Challans"
        subtitle="Manage and track all delivery documentation"
        action={
          <>
            <ExcelButton
              loading={download.busy === "export"}
              onClick={() =>
                void download.run("export", "DC list", () =>
                  api.request("dc.export", { query: { sort, dir, ...filters } }),
                )
              }
            >
              <FileText aria-hidden />
              Download
            </ExcelButton>
            <Button size="sm" onClick={() => void navigate({ to: "/dc/create" })}>
              <Plus aria-hidden />
              Create
            </Button>
          </>
        }
      />
      <StatCardRow>
        <StatCard
          title="Active Shipments"
          value={s ? fmtCount(s.count) : "—"}
          icon={<DeliveryChallan className="size-4" />}
        />
        <StatCard
          title="Total Dispatched"
          value={s ? fmtQty(s.dspQty) : "—"}
          icon={<Package className="size-4" />}
          color="warning"
        />
        <StatCard
          title="Total Value"
          value={s ? fmtMoneyCompact(s.value) : "—"}
          icon={<IndianRupee className="size-4" />}
          color="success"
        />
        <StatCard
          title="Total Received"
          value={s ? fmtQty(s.rcdQty) : "—"}
          icon={<DeliveryChallan className="size-4" />}
          color="success"
        />
      </StatCardRow>
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <ListToolbar search={{ ...searchBox, placeholder: "Search DCs, Suppliers or PO Ref..." }}>
          <ListFilters dateLabel="DC Date" value={search} onChange={setFilters} />
        </ListToolbar>
        <DataTable
          columns={cols}
          rows={rows.data?.items}
          {...tableQuery(rows)}
          emptyText="No delivery challans found."
          rowHighlight={(row) => row.openFlagCount > 0}
          {...list.table}
        />
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void confirmDelete(deleting)}
        title="Delete Delivery Challan?"
        warningText={
          deleting ? `Are you sure you want to delete DC #${deleting.number}? This action cannot be undone.` : ""
        }
        confirmLabel="Delete DC"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
