// The dashboard (SPEC-15 PR 4): the legacy stat cards, the action rows and recent activity, and the Supply Chain
// Funnel, for the chosen period. The open-flag count is the action row the legacy deviation count was (INV-60); no
// insights (INV-87). While a period loads the previous one stays on screen, and before the first answer every value
// shows as 0, so nothing changes size (C8).
import type { DashboardRange } from "@senstosales/domain";
import { fmtCount, fmtDate, fmtMoneyCompact, fmtQty, type RouteOutput, zMoney, zQty } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { apiQuery } from "../../../lib/api.ts";
import { cn } from "../../../lib/cn.ts";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  DeliveryChallan,
  type Icon,
  Invoice,
  Package,
  PurchaseOrder,
  StoreReceipt,
  Wallet,
} from "../../../lib/icons.ts";
import { ButtonGroup, PageHeader, StatCard, StatCardRow, useToast } from "../../common/index.ts";
import { DOC } from "../documents.ts";
import { sharePct } from "./funnel.ts";

type Range = DashboardRange;
type Summary = RouteOutput<"dashboard.summary">;
type Activity = RouteOutput<"dashboard.activity">[number];

// The current FY first and by default, so the screen is never empty for want of this month's POs (owner, 2026-10-15).
const RANGES = [
  { id: "fy", label: "This FY" },
  { id: "month", label: "Month" },
  { id: "30d", label: "30 Days" },
  { id: "all", label: "All" },
] as const satisfies ReadonlyArray<{ id: Range; label: string }>;

/** Before the first answer every value shows as 0, as legacy did with no summary. */
const NO_MONEY = zMoney.decode("0");
const NO_QTY = zQty.decode("0");
const EMPTY: Summary = {
  poValue: NO_MONEY,
  invoicedValue: NO_MONEY,
  avgLeadTimeDays: null,
  overdueCount: 0,
  uninvoicedDcCount: 0,
  openFlagCount: 0,
  pendingDispatchValue: NO_MONEY,
  funnel: { ordQty: NO_QTY, dspQty: NO_QTY, invoicedQty: NO_QTY, rcdQty: NO_QTY, pendingQty: NO_QTY },
};

const ROW =
  "group flex items-center justify-between border-b border-border/50 bg-surface px-4 py-3 transition-colors duration-200 last:border-b-0 hover:bg-primary/5";
const TILE = "flex size-9 items-center justify-center rounded-sm";

export function DashboardScreen() {
  const [range, setRange] = useState<Range>("fy");
  const { error: showError } = useToast();
  const summary = useQuery({
    ...apiQuery("dashboard.summary", { query: { range } }),
    meta: { onError: (error) => showError("Failed to load summary", error.message) },
  });
  const activity = useQuery(apiQuery("dashboard.activity"));

  const s = summary.data ?? EMPTY;
  const refreshing = summary.isFetching;
  const label = RANGES.find((r) => r.id === range)?.label ?? RANGES[0].label;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Dashboard"
        subtitle={`Supply chain overview - ${label}`}
        action={
          <>
            <span
              className={cn(
                "flex w-28 items-center justify-center gap-1.5 rounded-full px-2 py-1 role-field-label",
                refreshing ? "bg-warning/10 text-warning" : "bg-success/10 text-success",
              )}
            >
              <span className={cn("inline-flex size-2 rounded-full", refreshing ? "bg-warning" : "bg-success")} />
              {refreshing ? "Refreshing" : "Live"}
            </span>
            <ButtonGroup label="Period" options={RANGES} value={range} onChange={setRange} />
          </>
        }
      />

      <StatCardRow>
        <StatCard title="PO Value" value={fmtMoneyCompact(s.poValue)} icon={<Wallet className="size-4" />} />
        <StatCard
          title="Invoiced"
          value={fmtMoneyCompact(s.invoicedValue)}
          icon={<Invoice className="size-4" />}
          color="success"
        />
        <StatCard title="Lead Time" value={`${s.avgLeadTimeDays ?? 0}d`} icon={<Clock className="size-4" />} />
        <StatCard
          title="Overdue"
          value={fmtCount(s.overdueCount)}
          icon={<AlertTriangle className="size-4" />}
          color={s.overdueCount > 0 ? "error" : "success"}
          to="/delivery-tracker"
        />
      </StatCardRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section
          aria-labelledby="recent-activity"
          className="overflow-hidden rounded-md border border-border bg-surface shadow-card lg:col-span-8"
        >
          <div className="border-b border-border px-4 py-3">
            <h2 id="recent-activity" className="role-heading-md">
              Recent Activity
            </h2>
            <p className="mt-0.5 role-helper-text">Latest updates from your workflow</p>
          </div>
          <ActionRow
            icon={Package}
            title="DCs await invoice creation"
            subtitle={`${fmtCount(s.uninvoicedDcCount)} ${s.uninvoicedDcCount === 1 ? "challan" : "challans"} pending billing`}
            action="Create Invoice"
            to="/invoice/create"
          />
          <ActionRow
            icon={AlertCircle}
            title="SRVs with deviations detected"
            subtitle={`${fmtCount(s.openFlagCount)} ${s.openFlagCount === 1 ? "item" : "items"} need review`}
            action="Review"
            to="/srv"
            alert
          />
          <ActionRow
            icon={PurchaseOrder}
            title="POs have items ready to dispatch"
            subtitle={`${fmtMoneyCompact(s.pendingDispatchValue)} value pending`}
            action="Create DC"
            to="/dc/create"
          />
          <RecentDocuments items={activity.data} />
        </section>

        <Funnel funnel={s.funnel} />
      </div>
    </div>
  );
}

function ActionRow({
  icon: RowIcon,
  title,
  subtitle,
  action,
  to,
  alert = false,
}: {
  readonly icon: Icon;
  readonly title: string;
  readonly subtitle: string;
  readonly action: string;
  readonly to: "/invoice/create" | "/srv" | "/dc/create";
  readonly alert?: boolean;
}) {
  return (
    <Link to={to} className={ROW}>
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn(TILE, alert ? "bg-error/15" : "bg-primary/10")}>
          <RowIcon className={cn("size-5", alert ? "text-error" : "text-accent")} />
        </div>
        <div className="min-w-0">
          <div className="truncate role-field-value">{title}</div>
          <div className="role-helper-text">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("role-ui-label", alert ? "text-error" : "text-accent")}>{action}</span>
        <ArrowUpRight className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

/** The legacy tile colour per document type. */
const TONE: Record<Activity["type"], string> = {
  po: "bg-primary/10 text-accent",
  dc: "bg-success/10 text-success",
  invoice: "bg-warning/10 text-warning",
};

/** The legacy shows the four latest documents. */
const RECENT = 4;
/** One activity row's height: every slot keeps it, filled or not, so loading moves nothing (C8). */
const SLOT = "h-[61px]";

function RecentDocuments({ items }: { readonly items: readonly Activity[] | undefined }) {
  const shown = items?.slice(0, RECENT) ?? [];
  const fillers = Array.from({ length: RECENT - shown.length }, (_, i) =>
    i === 0 && items?.length === 0 ? (
      <div key="empty" className={cn(SLOT, "flex items-center justify-center role-empty-text")}>
        No recent activity
      </div>
    ) : (
      <div key={`filler-${i}`} aria-hidden="true" className={SLOT} />
    ),
  );
  return (
    <>
      {shown.map((item) => {
        const doc = DOC[item.type];
        return (
          <Link key={`${item.type}-${item.id}`} to={doc.page} params={{ id: item.id }} className={cn(ROW, SLOT)}>
            <div className="flex items-center gap-3">
              <div className={cn(TILE, TONE[item.type])}>
                <doc.icon className="size-5" />
              </div>
              <div>
                <div className="role-field-value">
                  {doc.label} {item.number}
                </div>
                <div className="role-helper-text">{item.date === null ? "N/A" : fmtDate(item.date)}</div>
              </div>
            </div>
            <ArrowUpRight className="size-5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        );
      })}
      {fillers}
    </>
  );
}

const STAGES = [
  { key: "ordQty", title: "Ordered", subtitle: "Total PO quantity", icon: PurchaseOrder, success: false },
  { key: "dspQty", title: "Dispatched", subtitle: "Via Delivery Challans", icon: DeliveryChallan, success: true },
  { key: "invoicedQty", title: "Invoiced", subtitle: "Payment pending", icon: Invoice, success: false },
  { key: "rcdQty", title: "Accepted", subtitle: "Confirmed via SRV", icon: StoreReceipt, success: true },
] as const;

function Funnel({ funnel }: { readonly funnel: Summary["funnel"] }) {
  const pending = funnel.pendingQty;
  return (
    <section
      aria-labelledby="funnel"
      className="overflow-hidden rounded-md border border-border bg-surface shadow-card lg:col-span-4"
    >
      <div className="border-b border-border px-4 py-3">
        <h2 id="funnel" className="role-heading-md">
          Supply Chain Funnel
        </h2>
        <p className="mt-0.5 role-helper-text">Order fulfillment pipeline</p>
      </div>
      {STAGES.map((stage, i) => {
        const share = sharePct(funnel[stage.key], funnel.ordQty);
        return (
          <div key={stage.key} className="border-b border-border/50 bg-surface px-4 py-3 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cn(TILE, stage.success ? "bg-success/10 text-success" : "bg-primary/10 text-accent")}>
                  <stage.icon className="size-5" />
                </div>
                <div>
                  <div className="role-field-value">{stage.title}</div>
                  <div className="role-helper-text">{stage.subtitle}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="role-reference-number">{fmtQty(funnel[stage.key])}</div>
                {/* The first stage is the whole; its share slot stays empty, not removed (C8). */}
                <div className="min-h-4 role-reference-number-sm">{i === 0 ? "" : share.text}</div>
              </div>
            </div>
            <div className="mt-2 pl-[52px]">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={cn("h-1.5 rounded-full", stage.success ? "bg-success" : "bg-primary")}
                  style={{ width: `${share.width}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex justify-between border-t border-border bg-surface-sunken px-4 py-3">
        <span className="role-helper-text">Pending Dispatch</span>
        <span className="role-reference-number-sm">
          {fmtQty(pending)} units{funnel.ordQty > 0 ? `(${sharePct(pending, funnel.ordQty).text})` : ""}
        </span>
      </div>
    </section>
  );
}
