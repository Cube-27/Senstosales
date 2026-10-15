// The search dialog's panes (legacy global search): the result list with recent searches and its empty states, and
// the preview of the chosen hit with its linked documents. DC and invoice numbers carry their FY (INV-24).
import { fmtDate, fmtFy, fmtMoneyCompact, fmtQty, type RouteOutput } from "@senstosales/schemas";

import { cn } from "../../../lib/cn.ts";
import { AlertCircle, ArrowUpRight, Invoice, Search } from "../../../lib/icons.ts";
import { Badge, type BadgeProps, Button } from "../../common/index.ts";
import { DOC } from "../documents.ts";
import { DOC_TYPES, type DocType } from "./filters.ts";
import { dayOf, type RecentSearch } from "./history.ts";

type Hit = RouteOutput<"search.query">[number];
type Fy = NonNullable<Hit["financialYear"]>;

/** A document number with its FY where numbers restart each FY (INV-24): `12 · FY 2025-26`. */
const withFy = (number: string, fy: Fy | null): string => (fy === null ? number : `${number} · ${fmtFy(fy)}`);

/** Where a hit or a linked document opens. */
export interface Target {
  readonly type: DocType;
  readonly id: string;
}

/** The legacy lists the five latest searches. */
const RECENT_SHOWN = 5;

const EMPTY = "flex h-full items-center justify-center px-4 text-center";

export function ResultList({
  hits,
  searching,
  searchable,
  loading,
  selected,
  recent,
  onHover,
  onOpen,
  onRecent,
}: {
  readonly hits: readonly Hit[];
  readonly searching: boolean;
  readonly searchable: boolean;
  readonly loading: boolean;
  readonly selected: number;
  readonly recent: readonly RecentSearch[];
  onHover(index: number): void;
  onOpen(target: Target): void;
  onRecent(recent: RecentSearch): void;
}) {
  if (!searching && recent.length > 0) return <RecentSearches recent={recent} onRecent={onRecent} />;
  if (!searching) {
    return (
      <div className={EMPTY}>
        <p className="role-empty-text">Type to search</p>
      </div>
    );
  }
  if (hits.length === 0) {
    return (
      <div className={EMPTY}>
        <p className="role-empty-text">{loading && searchable ? "" : "No results found"}</p>
      </div>
    );
  }
  return (
    <ul role="listbox" aria-label="Search results">
      {hits.map((hit, i) => {
        const doc = DOC[hit.type];
        const text = withFy(hit.match, hit.financialYear);
        return (
          <li
            key={`${hit.type}-${hit.id}`}
            role="option"
            aria-selected={i === selected}
            onMouseEnter={() => onHover(i)}
            onClick={() => onOpen(hit)}
            className={cn(
              "flex h-11 cursor-pointer items-center gap-3 border-b border-border/50 px-3",
              i === selected ? "bg-primary/10 text-accent" : "text-muted hover:bg-surface-sunken hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded border",
                i === selected ? "border-primary/25 bg-primary/15" : "border-border bg-surface",
              )}
            >
              <doc.icon className="size-3 text-accent" aria-hidden />
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate role-body-text",
                i === selected ? "text-accent" : "text-foreground",
              )}
              title={text}
            >
              <span className="sr-only">{doc.label} </span>
              {text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RecentSearches({
  recent,
  onRecent,
}: {
  readonly recent: readonly RecentSearch[];
  onRecent(recent: RecentSearch): void;
}) {
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-1.5 px-1 text-muted">
        <Search className="size-4" />
        <span className="role-section-title">Recent Searches</span>
      </div>
      {recent.slice(0, RECENT_SHOWN).map((r) => (
        <Button
          type="button"
          variant="ghost"
          key={`${r.query}-${r.timestamp}`}
          onClick={() => onRecent(r)}
          className="mb-1 h-auto w-full flex-col items-stretch gap-0 rounded-md px-3 py-2 text-left text-muted hover:bg-surface hover:text-foreground"
        >
          <div className="truncate role-body-text">{r.query}</div>
          <div className="mt-0.5 role-helper-text">
            {r.filters.types.length < DOC_TYPES.length ? `${r.filters.types.join(", ")} • ` : ""}
            {fmtDate(dayOf(r.timestamp))}
          </div>
        </Button>
      ))}
    </div>
  );
}

const STATUS_COLOR: Record<NonNullable<Hit["status"]>, NonNullable<BadgeProps["color"]>> = {
  Pending: "warning",
  Delivered: "primary",
  Closed: "success",
};

export function Preview({ hit, onOpen }: { readonly hit: Hit | undefined; onOpen(target: Target): void }) {
  if (!hit) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Invoice className="mb-3 size-8 text-tertiary opacity-50" />
        <p className="role-body-text">Select an item to view details</p>
      </div>
    );
  }
  const doc = DOC[hit.type];
  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Badge className="mb-2" color="primary" size="sm">
            {doc.label}
          </Badge>
          <h2 className="role-heading-md">
            {doc.label} {withFy(hit.number, hit.financialYear)}
          </h2>
          <p className="role-page-subtitle">{hit.date === null ? "N/A" : fmtDate(hit.date)}</p>
          {hit.hasFlags && (
            <div className="mt-3 flex items-center gap-2 text-warning">
              <AlertCircle className="size-4" />
              <span className="text-warning role-helper-text">Has discrepancies</span>
            </div>
          )}
        </div>
        {hit.status && (
          <Badge color={STATUS_COLOR[hit.status]} size="sm">
            {hit.status}
          </Badge>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-surface-sunken/50 p-3">
          <p className="mb-1 role-body-text-lg">Quantity</p>
          <p className="role-kpi-lg">{hit.qty === null ? "0" : fmtQty(hit.qty)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-sunken/50 p-3">
          <p className="mb-1 role-body-text-lg">Value</p>
          <p className="role-kpi-lg">{hit.value === null ? "₹0" : fmtMoneyCompact(hit.value)}</p>
        </div>
      </div>

      <div className="mb-6">
        <p className="mb-2 opacity-80 role-page-subtitle">Linked Documents</p>
        <LinkedDocuments hit={hit} onOpen={onOpen} />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="role-helper-text">Press Enter to open</p>
        <Button size="sm" onClick={() => onOpen(hit)}>
          View <ArrowUpRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Which linked documents a hit shows: every kind but its own, DC and invoice numbers with their FY. */
function linkChips(hit: Hit): Array<{ key: string; label: string; target: Target }> {
  const { po, dcs, invoices, srvs } = hit.links;
  const groups: Array<[DocType, string, ReadonlyArray<{ id: string; number: string; financialYear?: Fy | null }>]> = [
    ["po", "PO", po ? [po] : []],
    ["dc", "DC", dcs],
    ["invoice", "INV", invoices],
    ["srv", "SRV", srvs],
  ];
  return groups.flatMap(([type, prefix, docs]) =>
    type === hit.type
      ? []
      : docs.map((d) => ({
          key: `${type}-${d.id}`,
          label: `${prefix} #${withFy(d.number, d.financialYear ?? null)}`,
          target: { type, id: d.id },
        })),
  );
}

function LinkedDocuments({ hit, onOpen }: { readonly hit: Hit; onOpen(target: Target): void }) {
  const chips = linkChips(hit);
  if (chips.length === 0) return <span className="italic role-empty-text">No linked documents</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Button
          key={chip.key}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpen(chip.target)}
          className="bg-primary/10 text-primary hover:bg-primary/20"
        >
          {chip.label}
        </Button>
      ))}
    </div>
  );
}
