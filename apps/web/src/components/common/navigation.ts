// The sidebar's groups and labels, frozen from legacy (INV-67) without the Sourcing entry (`/procurement`, A-16).
import type { LinkProps } from "@tanstack/react-router";

import {
  AlertTriangle,
  AuditLogs,
  Dashboard,
  DeliveryChallan,
  DeliveryTracker,
  type Icon,
  Invoice,
  PurchaseOrder,
  Reports,
  Settings,
  StoreReceipt,
} from "../../lib/icons.ts";

export interface NavItem {
  readonly name: string;
  readonly to: NonNullable<LinkProps["to"]>;
  readonly icon: Icon;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Core",
    items: [
      { name: "Dashboard", to: "/", icon: Dashboard },
      { name: "Purchase Orders", to: "/po", icon: PurchaseOrder },
      { name: "Delivery Challan", to: "/dc", icon: DeliveryChallan },
      { name: "GST Invoices", to: "/invoice", icon: Invoice },
      { name: "Receipts (SRV)", to: "/srv", icon: StoreReceipt },
    ],
  },
  {
    label: "Reports",
    items: [
      { name: "Delivery Tracker", to: "/delivery-tracker", icon: DeliveryTracker },
      { name: "Deviations", to: "/deviations", icon: AlertTriangle },
      { name: "Daily Reports", to: "/reports", icon: Reports },
    ],
  },
  {
    label: "System",
    items: [
      { name: "Audit Logs", to: "/system/ledger", icon: AuditLogs },
      { name: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

/** An item is active on its own path and below it; the dashboard only on `/`. */
export function isNavItemActive(pathname: string, to: string): boolean {
  if (pathname === to) return true;
  return to !== "/" && pathname.startsWith(`${to}/`);
}
