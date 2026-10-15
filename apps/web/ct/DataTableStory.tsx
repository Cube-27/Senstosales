// A DataTable over 23 synthetic rows, paged and sorted in the page, with buttons above it that switch the table's
// state. The component tests (datatable.spec.ts) measure it.
import { useState } from "react";

import { Button, type Column, DataTable, type DataTableProps } from "../src/components/common/index.ts";

type Row = { number: string; buyer: string; value: number; flagged: boolean };

const ROWS: Row[] = Array.from({ length: 23 }, (_, i) => ({
  number: `PO-${String(i + 1).padStart(4, "0")}`,
  buyer: i % 4 === 0 ? `Example Buyer ${i + 1} with a name far longer than its column` : `Buyer ${i + 1}`,
  value: (i * 7919) % 100_000,
  flagged: i % 5 === 2,
}));

const COLUMNS: Column<Row>[] = [
  { key: "number", header: "PO Number", width: "140px", sortable: true },
  { key: "buyer", header: "Buyer", width: "220px" },
  { key: "value", header: "Value", width: "120px", align: "right", sortable: true, render: (r) => `₹${r.value}` },
  { key: "flag", header: "Flags", width: "80px", render: (r) => (r.flagged ? "Flag" : "") },
];

type State = "ready" | "loading" | "empty" | "error";

function sorted(rows: Row[], sort: DataTableProps<Row>["sort"]): Row[] {
  if (!sort) return rows;
  const key = sort.key === "value" ? "value" : "number";
  const order = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[key] === b[key]) return 0;
    return a[key] < b[key] ? -order : order;
  });
}

export function DataTableStory() {
  const [state, setState] = useState<State>("ready");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<DataTableProps<Row>["sort"]>();
  const all = state === "empty" ? [] : sorted(ROWS, sort);
  const rows = state === "loading" ? undefined : all.slice((page - 1) * pageSize, page * pageSize);
  return (
    <main className="p-6">
      <div className="mb-4 flex gap-2">
        {(["ready", "loading", "empty", "error"] as const).map((s) => (
          <Button key={s} variant="outline" size="sm" onClick={() => setState(s)}>
            Show {s}
          </Button>
        ))}
      </div>
      <div style={{ width: 640 }}>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          total={all.length}
          page={page}
          pageSize={pageSize}
          sort={sort}
          state={state === "empty" ? "ready" : state}
          error="The server is not responding"
          emptyText="No purchase orders found"
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          onSort={(key) => {
            setSort((s) => ({ key, dir: s?.key === key && s.dir === "asc" ? "desc" : "asc" }));
            setPage(1);
          }}
          rowHighlight={(r) => r.flagged}
        />
      </div>
    </main>
  );
}
