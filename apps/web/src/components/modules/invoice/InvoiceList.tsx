import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtMoney, fmtMoneyCompact } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useListSearch } from "../../../hooks/useListSearch.ts";
import { useSearchText } from "../../../hooks/useSearchText.ts";
import { api, apiQuery } from "../../../lib/api.ts";
import { useDownload } from "../../../lib/download.ts";
import { Delete, FileText, IndianRupee, Invoice, Package, Receipt } from "../../../lib/icons.ts";
import { rangeQuery } from "../../../lib/search.ts";
import {
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  ListFilters,
  ListToolbar,
  PageHeader,
  qtyColumn,
  StatCard,
  StatCardRow,
  tableQuery,
} from "../../common/index.ts";
import { ListHeaderActions, useRowDelete } from "../doc-screens.tsx";
import type { InvoiceSearch } from "./search.ts";

type Row = RouteOutput<"invoice.list">["items"][number];

interface Actions {
  readonly busy: string | null;
  onDownload(row: Row): void;
  onDelete(row: Row): void;
}

function columns({ busy, onDownload, onDelete }: Actions): Column<Row>[] {
  return [
    {
      key: "number",
      header: "Invoice #",
      width: "120px",
      sortable: true,
      title: (row) => `${row.number} (FY ${row.financialYear})`,
      render: (row) => (
        <Link to="/invoice/$id" params={{ id: row.id }} className="role-reference-link">
          {row.number}
        </Link>
      ),
    },
    { key: "invoiceDate", header: "Date", width: "96px", sortable: true, render: (row) => fmtDate(row.invoiceDate) },
    {
      key: "dc",
      header: "Linked DCs",
      width: "115px",
      title: (row) => row.dc?.number ?? "Direct",
      render: (row) =>
        row.dc ? (
          <Link to="/dc/$id" params={{ id: row.dc.id }} className="role-reference-link">
            {row.dc.number}
          </Link>
        ) : (
          <span className="role-helper-text">Direct</span>
        ),
    },
    {
      key: "poNumber",
      header: "Linked POs",
      width: "115px",
      sortable: true,
      title: (row) => row.poNumber,
      render: (row) => (
        <Link to="/po/$id" params={{ id: row.poId }} className="role-reference-link">
          {row.poNumber}
        </Link>
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
    qtyColumn<Row>("qty", "Dispatched", (row) => row.qty, { sortable: true }),
    {
      key: "total",
      header: "Value",
      width: "120px",
      align: "right",
      sortable: true,
      render: (row) => <span className="tabular-nums">{fmtMoney(row.total, { gemc: false })}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      width: "96px",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="icon"
            title="Download Invoice"
            aria-label={`Download Invoice ${row.number}`}
            loading={busy === row.id}
            onClick={() => onDownload(row)}
          >
            <FileText aria-hidden />
          </Button>
          {/* The list row knows no SRV links; an SRV-linked invoice is refused by the API with its reason (EC-62). */}
          <Button
            variant="outline"
            size="icon"
            className="text-error"
            title={`Delete Invoice #${row.number}`}
            aria-label={`Delete Invoice #${row.number}`}
            onClick={() => onDelete(row)}
          >
            <Delete aria-hidden />
          </Button>
        </div>
      ),
    },
  ];
}

/** `/invoice` (SPEC-18 §2): the legacy invoice list, its CSV export and each invoice's Excel. */
export function InvoiceList() {
  const list = useListSearch<InvoiceSearch>();
  const { search, setFilters } = list;
  const download = useDownload();
  const { page, pageSize, sort, dir, ...ranges } = search;
  const filters = rangeQuery(ranges);
  const rows = useQuery(apiQuery("invoice.list", { query: { page, pageSize, sort, dir, ...filters } }));
  const stats = useQuery(apiQuery("invoice.stats", { query: filters }));
  const searchBox = useSearchText(search.q, (q) => setFilters({ q }));
  const rowDelete = useRowDelete<Row>({
    noun: "Invoice",
    remove: (row) => api.request("invoice.delete", { params: { id: row.id } }),
    deleted: (row) => `Invoice ${row.number} has been deleted successfully.`,
    resources: ["invoice", "dc", "po"],
  });

  const cols = columns({
    busy: download.busy,
    onDownload: (row) =>
      void download.run(row.id, `Invoice ${row.number}`, () =>
        api.request("invoice.excel", { params: { id: row.id } }),
      ),
    onDelete: rowDelete.ask,
  });

  const s = stats.data;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Invoices"
        subtitle="Manage billing and payment tracking"
        action={
          <ListHeaderActions
            downloading={download.busy === "export"}
            onDownload={() =>
              void download.run("export", "Invoice register", () =>
                api.request("invoice.export", { query: { sort, dir, ...filters } }),
              )
            }
            createTo="/invoice/create"
          />
        }
      />
      <StatCardRow>
        <StatCard title="Total Invoices" value={s ? fmtCount(s.count) : "—"} icon={<Invoice className="size-4" />} />
        <StatCard
          title="Total Value"
          value={s ? fmtMoneyCompact(s.total) : "—"}
          icon={<IndianRupee className="size-4" />}
          color="success"
        />
        <StatCard
          title="Taxable Value"
          value={s ? fmtMoneyCompact(s.taxable) : "—"}
          icon={<Package className="size-4" />}
          color="warning"
        />
        <StatCard
          title="Total Tax"
          value={s ? fmtMoneyCompact(s.tax) : "—"}
          icon={<Receipt className="size-4" />}
          color="success"
        />
      </StatCardRow>
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <ListToolbar search={{ ...searchBox, placeholder: "Search invoices, DC refs..." }}>
          <ListFilters dateLabel="Invoice Date" value={search} onChange={setFilters} />
        </ListToolbar>
        <DataTable
          columns={cols}
          rows={rows.data?.items}
          {...tableQuery(rows)}
          emptyText="No invoices found."
          {...list.table}
        />
      </div>
      <ConfirmDialog
        {...rowDelete.dialog}
        title="Delete Invoice?"
        warningText={
          rowDelete.deleting
            ? `Are you sure you want to delete Invoice #${rowDelete.deleting.number}? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete Invoice"
        variant="danger"
      />
    </div>
  );
}
