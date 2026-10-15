import type { RouteOutput } from "@senstosales/schemas";
import { fmtCount, fmtDate, fmtQty, fmtRate } from "@senstosales/schemas";
import { useMemo } from "react";

import { useClientPage } from "../../../hooks/useClientPage.ts";

import {
  Badge,
  Button,
  type Column,
  DataTable,
  MaterialCell,
  materialTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  qtyColumn,
} from "../../common/index.ts";
import { ManualQtyCell } from "./ManualQtyCell.tsx";
import { StatusCell } from "./status.tsx";

type Detail = RouteOutput<"po.detail">;
type Item = Detail["items"][number];
type Lot = Item["lots"][number];
type Flag = Detail["flags"][number];

const NO_FLAGS: readonly Flag[] = [];

/** A lot's entry-allow cell: the date, or the page's note in its place (INV-46). */
export const entryAllow = (lot: Pick<Lot, "entryAllowDate" | "entryAllowNote">): string =>
  lot.entryAllowDate === null ? (lot.entryAllowNote ?? "—") : fmtDate(lot.entryAllowDate);

/** The item's delivery lots (planning only, spec §3), in a popover over the row. */
function LotsCell({ item }: { readonly item: Item }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2" aria-label={`Lots of item ${item.poItemNo}`}>
          {fmtCount(item.lots.length)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <ul className="max-h-64 divide-y divide-border/40 overflow-y-auto">
          {item.lots.map((lot) => (
            <li key={lot.id} className="flex items-center gap-3 px-3 py-2 role-metadata">
              <span className="w-12 shrink-0">Lot {lot.lotNo}</span>
              <span className="w-20 shrink-0 truncate">{lot.destCode ? `Dest ${lot.destCode}` : ""}</span>
              <span className="w-24 shrink-0">Dly {fmtDate(lot.delyDate)}</span>
              <span className="min-w-0 flex-1 truncate" title={entryAllow(lot)}>
                Entry {entryAllow(lot)}
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums">{fmtQty(lot.delyQty)}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const qty = (key: "ordQty" | "balanceQty" | "rcdQty" | "rejQty", header: string, colKey: string = key) =>
  qtyColumn<Item>(colKey, header, (item) => item[key], { width: "88px" });

function columns(detail: Detail, flagsOf: (id: string) => readonly Flag[]): Column<Item>[] {
  const gemc = detail.po.isGemc;
  return [
    { key: "poItemNo", header: "#", width: "48px", render: (item) => `#${item.poItemNo}` },
    {
      key: "material",
      header: "Material",
      width: "auto",
      title: (item) => materialTitle(item.materialCode, item.description, item.drawingNo),
      render: (item) => <MaterialCell code={item.materialCode} description={item.description} />,
    },
    { key: "unit", header: "Unit", width: "56px", render: (item) => item.unit ?? "—" },
    { key: "rate", header: "Rate", width: "84px", align: "right", render: (item) => fmtRate(item.rate, { gemc }) },
    qty("ordQty", "Ordered"),
    qty("balanceQty", "Pending"),
    {
      key: "dspQty",
      header: "Dispatched",
      width: "104px",
      align: "right",
      render: (item) => (
        <ManualQtyCell
          poId={detail.po.id}
          item={item}
          overlap={flagsOf(item.id).some((f) => f.type === "MANUAL_ADJUSTMENT_OVERLAP")}
        />
      ),
    },
    qty("rcdQty", "Received"),
    // Accepted is shown as received (INV-09).
    qty("rcdQty", "Accepted", "acceptedQty"),
    qty("rejQty", "Rejected"),
    { key: "status", header: "Status", width: "88px", render: (item) => <StatusCell status={item.status} /> },
    {
      key: "flags",
      header: "Flags",
      width: "68px",
      render: (item) => {
        const n = flagsOf(item.id).length;
        return (
          <Badge color="warning" size="sm" className={n === 0 ? "invisible" : undefined} aria-hidden={n === 0}>
            {fmtCount(n)}
          </Badge>
        );
      },
    },
    { key: "lots", header: "Lots", width: "60px", align: "right", render: (item) => <LotsCell item={item} /> },
  ];
}

/**
 * The PO's items (SPEC-16 §2), leading with quantities (INV-65): Cancelled for amended-out items (INV-63), flagged
 * items highlighted (INV-57, INV-60), paged on the client in the shared table's fixed footprint (C8).
 */
export function PODetailItems({ detail }: { readonly detail: Detail }) {
  const flagsOf = useMemo(() => {
    const byItem = new Map<string, Flag[]>();
    for (const f of detail.flags) {
      if (f.scopeType === "po_item") byItem.set(f.scopeId, [...(byItem.get(f.scopeId) ?? []), f]);
    }
    return (id: string) => byItem.get(id) ?? NO_FLAGS;
  }, [detail.flags]);
  const cols = useMemo(() => columns(detail, flagsOf), [detail, flagsOf]);
  const paged = useClientPage(detail.items);
  const { ordQty, dspQty, balanceQty, rcdQty } = detail.po;
  return (
    <section aria-label="Line items" className="flex flex-col gap-2">
      <div className="flex items-center gap-6 px-1">
        <span className="role-section-title">Line Items</span>
        {(
          [
            ["Ordered", ordQty],
            ["Dispatched", dspQty],
            ["Pending", balanceQty],
            ["Received", rcdQty],
          ] as const
        ).map(([label, value]) => (
          <span key={label} className="role-metadata">
            {label} <span className="role-field-value tabular-nums">{fmtQty(value)}</span>
          </span>
        ))}
      </div>
      <DataTable columns={cols} emptyText="No items" rowHighlight={(item) => flagsOf(item.id).length > 0} {...paged} />
    </section>
  );
}
