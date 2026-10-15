import type { IsoDate } from "@senstosales/domain";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useDownload } from "../../../hooks/useDownload.ts";
import { useListSearch } from "../../../hooks/useListSearch.ts";
import { useSearchText } from "../../../hooks/useSearchText.ts";
import { api, apiQuery } from "../../../lib/api.ts";
import { searchText } from "../../../lib/search.ts";
import { cn } from "../../../lib/cn.ts";
import { todayIst } from "../../../lib/today.ts";
import {
  Button,
  ButtonGroup,
  DataTable,
  DatePicker,
  DownloadButton,
  Input,
  tableQuery,
  PageHeader,
  type Selection,
} from "../../common/index.ts";
import { PENDING_COLUMNS, type PendingRow, RECONCILIATION_COLUMNS, type ReconciliationRow } from "./columns.tsx";
import { defaultRange, pendingSort, reconciliationSort, type ReportsSearch } from "./search.ts";

type Row = PendingRow | ReconciliationRow;
type Tab = "pending" | "reconciliation";
type Range = { readonly from: IsoDate; readonly to: IsoDate };

/** Daily-dispatch is dropped (A-16, INV-87): two tabs. */
const TABS = [
  { id: "pending", label: "Items Summary" },
  { id: "reconciliation", label: "Audit Ledger" },
] as const;

/**
 * The selected rows, by PO item, with each one's PO: export-selected takes the POs (SPEC-13 §2, EC-43), and a row
 * selected on another page is no longer on screen to ask.
 */
function useRowSelection(rows: readonly Row[] | undefined) {
  const [selected, setSelected] = useState<ReadonlyMap<string, string>>(new Map());
  const selection: Selection<Row> = {
    rowKey: (r) => r.poItemId,
    selected: new Set(selected.keys()),
    onChange: (keys) => {
      const poOf = new Map([...selected, ...(rows ?? []).map((r) => [r.poItemId, r.poId] as const)]);
      const kept = [...keys].flatMap((key) => {
        const po = poOf.get(key);
        return po === undefined ? [] : [[key, po] as const];
      });
      setSelected(new Map(kept));
    },
  };
  return { selection, poIds: [...new Set(selected.values())], clear: () => setSelected(new Map()) };
}

/** Both tabs' lists for the search; only the open tab's is read. */
function useReportRows(search: ReportsSearch, tab: Tab, range: Range) {
  const query = {
    page: search.page,
    pageSize: search.pageSize,
    dir: search.dir,
    ...range,
    q: searchText(search.q),
  };
  const pending = useQuery({
    ...apiQuery("reports.pending", { query: { ...query, sort: pendingSort(search.sort) } }),
    enabled: tab === "pending",
  });
  const reconciliation = useQuery({
    ...apiQuery("reports.reconciliation", { query: { ...query, sort: reconciliationSort(search.sort) } }),
    enabled: tab === "reconciliation",
  });
  return { pending, reconciliation, active: tab === "pending" ? pending : reconciliation };
}

/** Download: the selected rows' POs (export-selected, then the selection clears), else the tab's workbook. */
function exportRequest(tab: Tab, search: ReportsSearch, range: Range, poIds: readonly string[]) {
  if (poIds.length > 0) return api.request("reports.exportSelected", { body: { poIds: [...poIds] } });
  // As legacy, the workbook covers the range in the tab's sort; the search box narrows only the screen.
  const query = { ...range, dir: search.dir };
  return tab === "pending"
    ? api.request("reports.pendingExport", { query: { ...query, sort: pendingSort(search.sort) } })
    : api.request("reports.reconciliationExport", { query: { ...query, sort: reconciliationSort(search.sort) } });
}

interface ReportActionsProps {
  readonly searchBox: ReturnType<typeof useSearchText>;
  readonly range: Range;
  /** A range chosen by the user: Reset shows. */
  readonly rangeSet: boolean;
  onDate(key: keyof Range, value: IsoDate | ""): void;
  onReset(): void;
  readonly selectedCount: number;
  readonly busy: boolean;
  onDownload(): void;
}

/** The header's search, date range, Reset (kept in its slot, INV-71) and Download. */
function ReportActions(p: ReportActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={p.searchBox.value}
        onChange={(e) => p.searchBox.onChange(e.target.value)}
        placeholder="Search report..."
        aria-label="Search report..."
        className="h-8 w-56"
      />
      <DatePicker value={p.range.from} onChange={(v) => p.onDate("from", v)} aria-label="From" className="w-40" />
      <span className="px-1 role-metadata">to</span>
      <DatePicker value={p.range.to} onChange={(v) => p.onDate("to", v)} aria-label="To" className="w-40" />
      <Button
        variant="ghost"
        size="sm"
        title="Reset to last 1 day"
        onClick={p.onReset}
        className={cn("h-8 px-2", !p.rangeSet && "invisible")}
      >
        Reset
      </Button>
      <DownloadButton busy={p.busy} onClick={p.onDownload} className="w-36">
        {p.selectedCount > 0 ? `Download (${p.selectedCount})` : "Download"}
      </DownloadButton>
    </div>
  );
}

/**
 * `/reports` (SPEC-17 §2): the legacy Operations Insights screen. Two tabs over the report lists, a search box, the
 * date range with Reset, and Download: the tab's workbook for the range, or the selected rows' POs (export-selected).
 */
export function Reports() {
  const list = useListSearch<ReportsSearch>();
  const { search, setFilters } = list;
  const navigate = useNavigate();
  const tab: Tab = search.tab ?? "pending";
  const defaults = defaultRange(todayIst());
  const range = { from: search.from ?? defaults.from, to: search.to ?? defaults.to };
  const { pending, reconciliation, active } = useReportRows(search, tab, range);
  const picked = useRowSelection(active.data?.items);
  const searchBox = useSearchText(search.q, (q) => setFilters({ q }));
  const download = useDownload();

  const showTab = (next: Tab): void => {
    if (next === tab) return;
    picked.clear();
    const shown = next === "pending" ? undefined : next;
    void navigate({
      to: "/reports",
      search: (prev) => ({ ...prev, tab: shown, sort: undefined, q: undefined, page: 1 }),
      replace: true,
    });
  };

  const exportFile = (): Promise<void> =>
    download.run(async () => {
      const file = await exportRequest(tab, search, range, picked.poIds);
      if (picked.poIds.length > 0) picked.clear();
      return file;
    });

  const table = {
    ...list.table,
    ...tableQuery(active),
    emptyText: "No data found for this period",
    selection: picked.selection,
  } as const;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Operations Insights"
        subtitle="Historical analysis and reconciliation registers"
        action={
          <ReportActions
            searchBox={searchBox}
            range={range}
            rangeSet={search.from !== undefined || search.to !== undefined}
            onDate={(key, value) => setFilters({ ...range, [key]: value === "" ? defaults[key] : value })}
            onReset={() => setFilters({ from: undefined, to: undefined })}
            selectedCount={picked.selection.selected.size}
            busy={download.busy}
            onDownload={() => void exportFile()}
          />
        }
      />
      <div className="flex items-center gap-3">
        <ButtonGroup label="Report" options={TABS} value={tab} onChange={showTab} />
      </div>
      {tab === "pending" ? (
        <DataTable columns={PENDING_COLUMNS} rows={pending.data?.items} {...table} />
      ) : (
        <DataTable columns={RECONCILIATION_COLUMNS} rows={reconciliation.data?.items} {...table} />
      )}
    </div>
  );
}
