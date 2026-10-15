// The shared-component registry (ARCHITECTURE §12.3, INV-66): screens import shared UI from here only.
// `validate-imports` fails deep imports past this file and local copies of its exports.
export { AppChrome } from "./AppChrome.tsx";
export { type DetailTab, DetailTabs, type DetailTabsProps } from "./DetailTabs.tsx";
export { GlobalSearch, GlobalSearchDialog, type GlobalSearchDialogProps } from "./GlobalSearchDialog.tsx";
export { HeaderActions } from "./HeaderActions.tsx";
export { ListToolbar, type ListToolbarProps } from "./ListToolbar.tsx";
export { isNavItemActive, NAV_GROUPS, type NavGroup, type NavItem } from "./navigation.ts";
export { PageHeader, type PageHeaderProps } from "./PageHeader.tsx";
export { SidebarNav } from "./SidebarNav.tsx";
export { StatCard, type StatCardProps, StatCardRow, type StatColor } from "./StatCard.tsx";
export { ThemeToggle } from "./ThemeToggle.tsx";
export { TOAST_MS, type ToastApi, ToastProvider, type ToastType, useToast } from "./Toast.tsx";
