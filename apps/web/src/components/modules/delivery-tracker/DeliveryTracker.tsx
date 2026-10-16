import { fmtCount, fmtDate, fmtMoney, fmtMoneyCompactSpaced, type RouteOutput } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useDownload } from "../../../hooks/useDownload.ts";
import { useListSearch } from "../../../hooks/useListSearch.ts";
import { useSearchText } from "../../../hooks/useSearchText.ts";
import { api, apiQuery } from "../../../lib/api.ts";
import { AlertTriangle, CalendarIcon, Clock, Plus, TrendingDown } from "../../../lib/icons.ts";
import { todayIst } from "../../../lib/today.ts";
import {
  Badge,
  type Column,
  DataTable,
  DownloadButton,
  ListToolbar,
  PageHeader,
  qtyColumn,
  StatCard,
  StatCardRow,
  tableQuery,
} from "../../common/index.ts";
import { anyFilter, CLEARED, isActive, toggleChip, toggleStatus } from "./chips.ts";
import { type TrackerStatus, type TrackerSearch, trackerFilters } from "./search.ts";
import { SmartFilterChips } from "./SmartFilterChips.tsx";
import { TrackerFilters } from "./TrackerFilters.tsx";

type Lot = RouteOutput<"deliveryTracker.list">["items"][number];

/** The Days Overdue badge: overdue, today or due in some days, in the legacy screen's words. */
function DaysToDue({ days }: { readonly days: number | null }) {
  if (days === null) return <span className="role-metadata">—</span>;
  if (days < 0) return <Badge color="error">{-days}d overdue</Badge>;
  if (days === 0) return <Badge color="success">Today</Badge>;
  return <Badge color="warning">Due in {days}d</Badge>;
}

const money = (m: Lot["rate"]) => fmtMoney(m, { gemc: false });

/** The shared date width less 4px, so the largest pending value shows whole at 1366 (N-TRK-VAL). */
const TRACKER_DATE_WIDTH = "112px";

/**
 * Widths from the measured content (D-0630): at 1366 the other columns leave PO / Material its header's width.
 */
const COLUMNS: Column<Lot>[] = [
  {
    key: "poNumber",
    header: "PO / Material",
    width: "auto",
    minWidth: 112,
    sortable: true,
    title: (l) => `${l.poNumber} · ${l.materialCode ?? ""} · ${l.description}`,
    render: (l) => (
      <span className="flex min-w-0 items-center gap-2">
        <Link to="/po/$id" params={{ id: l.poId }} className="shrink-0 role-reference-number hover:underline">
          {l.poNumber}
        </Link>
        <Link
          to="/dc/create"
          search={{ po: l.poId }}
          aria-label={`Create DC for PO ${l.poNumber}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-accent hover:bg-primary/20"
        >
          <Plus className="size-3" aria-hidden />
        </Link>
        <span className="truncate role-helper-text">
          {l.materialCode ?? "—"} · {l.description}
        </span>
      </span>
    ),
  },
  {
    key: "lotNo",
    header: "Lot",
    width: "60px",
    render: (l) => <span className="rounded-md bg-surface-sunken px-2 py-1 role-metadata">L{l.lotNo}</span>,
  },
  {
    key: "delyDate",
    header: "Due Date",
    width: TRACKER_DATE_WIDTH,
    sortable: true,
    render: (l) => fmtDate(l.delyDate),
  },
  {
    key: "entryAllowDate",
    header: "Entry Date",
    width: TRACKER_DATE_WIDTH,
    sortable: true,
    render: (l) => fmtDate(l.entryAllowDate),
  },
  qtyColumn<Lot>("ordQty", "Ord", (l) => l.ordQty, { sortable: true, width: "76px" }),
  qtyColumn<Lot>("dspQty", "Dsp", (l) => l.dspQty, { sortable: true, width: "76px" }),
  qtyColumn<Lot>("rcdQty", "Rcd", (l) => l.rcdQty, { sortable: true, width: "76px" }),
  qtyColumn<Lot>("balanceQty", "Bal", (l) => l.balanceQty, { width: "76px" }),
  { key: "rate", header: "Unit Price", width: "124px", align: "right", render: (l) => money(l.rate) },
  {
    key: "pendingValue",
    header: "Pending Value",
    width: "136px",
    align: "right",
    sortable: true,
    render: (l) => money(l.pendingValue),
  },
  { key: "daysToDue", header: "Days Overdue", width: "124px", render: (l) => <DaysToDue days={l.daysToDue} /> },
];

/** The three counting cards, each also a status toggle (D-0240). */
const STATUS_CARDS = [
  { status: "overdue", title: "Overdue", count: "overdueCount", Icon: AlertTriangle, color: "error" },
  { status: "due-soon", title: "Due This Week", count: "dueSoonCount", Icon: Clock, color: "warning" },
  {
    status: "due-this-month",
    title: "Due This Month",
    count: "dueThisMonthCount",
    Icon: CalendarIcon,
    color: "primary",
  },
] as const;

/** The stat cards; the three counts double as status toggles. */
function TrackerStats({ search, onToggle }: Readonly<{ search: TrackerSearch; onToggle(s: TrackerStatus): void }>) {
  const stats = useQuery(apiQuery("deliveryTracker.stats", { query: trackerFilters(search) })).data;
  return (
    <StatCardRow>
      {STATUS_CARDS.map(({ status, title, count, Icon, color }) => (
        <StatCard
          key={status}
          title={title}
          value={stats ? fmtCount(stats[count]) : "—"}
          icon={<Icon className="size-4" />}
          color={color}
          onClick={() => onToggle(status)}
          isActive={search.status === status}
        />
      ))}
      <StatCard
        title="Pending Value"
        value={stats ? fmtMoneyCompactSpaced(stats.pendingValue) : "—"}
        icon={<TrendingDown className="size-4" />}
        color="primary"
      />
    </StatCardRow>
  );
}

/**
 * `/delivery-tracker` (SPEC-17 §2): the scheduled lots with the stat cards, smart chips, More Filters and the Excel
 * download of what the screen shows (SPEC-13). Overdue lots are highlighted.
 */
export function DeliveryTracker() {
  const list = useListSearch<TrackerSearch>();
  const { search, setFilters } = list;
  const filters = trackerFilters(search);
  const lots = useQuery(
    apiQuery("deliveryTracker.list", {
      query: { ...filters, page: search.page, pageSize: search.pageSize, sort: search.sort, dir: search.dir },
    }),
  );
  const searchBox = useSearchText(search.q, (q) => setFilters({ q }));
  const download = useDownload();
  const today = todayIst();

  const exportFile = () =>
    download.run(() =>
      api.request("deliveryTracker.export", { query: { ...filters, sort: search.sort, dir: search.dir } }),
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Delivery Tracker"
        subtitle="Monitor delivery schedules, track overdue items, and manage upcoming due dates"
      />
      <TrackerStats search={search} onToggle={(status) => setFilters(toggleStatus(status, search))} />
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <ListToolbar search={{ ...searchBox, placeholder: "Search POs, materials..." }}>
          <TrackerFilters
            search={search}
            onChange={setFilters}
            onClear={() => setFilters(CLEARED)}
            canClear={anyFilter(search)}
          />
          <DownloadButton busy={download.busy} onClick={() => void exportFile()}>
            Download
          </DownloadButton>
        </ListToolbar>
        <SmartFilterChips
          isActive={(chip) => isActive(chip, search, today)}
          onToggle={(chip) => setFilters(toggleChip(chip, search, today))}
          onClear={() => setFilters(CLEARED)}
        />
        <DataTable
          columns={COLUMNS}
          rows={lots.data?.items}
          {...tableQuery(lots)}
          {...list.table}
          emptyText="No delivery items found for the selected filters"
          rowHighlight={(l) => l.overdue}
        />
      </div>
    </div>
  );
}
