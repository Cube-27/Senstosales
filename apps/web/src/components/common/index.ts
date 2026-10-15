// The shared-component registry (ARCHITECTURE §12.3, INV-66): screens import shared UI from here only.
// `validate-imports` fails deep imports past this file and local copies of its exports.
export { AppChrome } from "./AppChrome.tsx";
export { type DetailTab, DetailTabs, type DetailTabsProps } from "./DetailTabs.tsx";
export { ListToolbar, type ListToolbarProps } from "./ListToolbar.tsx";
export { PageHeader, type PageHeaderProps } from "./PageHeader.tsx";
export { StatCard, type StatCardProps, StatCardRow, type StatColor } from "./StatCard.tsx";
export { type ToastApi, type ToastType, useToast } from "./Toast.tsx";
