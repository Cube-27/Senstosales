// The shared-component registry (ARCHITECTURE §12.3, INV-66): screens import shared UI from here only.
// `validate-imports` fails deep imports past this file and local copies of its exports.
export { AppChrome } from "./AppChrome.tsx";
export { Autocomplete, type AutocompleteOption, type AutocompleteProps } from "./Autocomplete.tsx";
export { ButtonGroup, type ButtonGroupOption, type ButtonGroupProps } from "./ButtonGroup.tsx";
export { qtyColumn } from "./columns.tsx";
export { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog.tsx";
export { type Column, DataTable, type DataTableProps, type Selection, tableQuery } from "./DataTable.tsx";
export { DownloadButton, type DownloadButtonProps } from "./DownloadButton.tsx";
export { DatePicker, type DatePickerProps } from "./DatePicker.tsx";
export { type DetailTab, DetailTabs, type DetailTabsProps } from "./DetailTabs.tsx";
export { ExcelButton } from "./ExcelButton.tsx";
export {
  FileUploadModal,
  type FileUploadModalProps,
  startUpload,
  type UploadOutcome,
  type UploadRun,
} from "./FileUploadModal.tsx";
export { FolderImport, type FolderImportProps } from "./FolderImport.tsx";
export { FormDialog, type FormDialogProps } from "./FormDialog.tsx";
export { FormField, type FormFieldProps } from "./FormField.tsx";
export { GlobalSearchDialog, type GlobalSearchDialogProps } from "./GlobalSearchDialog.tsx";
export { InfoField, type InfoFieldProps } from "./InfoField.tsx";
export { JobProgress, type JobProgressProps } from "./JobProgress.tsx";
export { ListFilters, type ListFiltersProps, type RangeFilters } from "./ListFilters.tsx";
export { ListToolbar, type ListToolbarProps } from "./ListToolbar.tsx";
export { PageHeader, type PageHeaderProps } from "./PageHeader.tsx";
export { Pagination, type PaginationProps } from "./Pagination.tsx";
export { QueryState, type QueryStateProps } from "./QueryState.tsx";
export { QuantityInput, type QuantityInputProps } from "./QuantityInput.tsx";
export { StatCard, type StatCardProps, StatCardRow, type StatColor } from "./StatCard.tsx";
export { type Status, StatusBadge, type StatusBadgeProps } from "./StatusBadge.tsx";
export { type ToastApi, type ToastType, useToast } from "./Toast.tsx";

// Primitives: shadcn/ui components in components/ui, restyled to the globals.css tokens (D-0015).
export { Badge, type BadgeProps } from "../ui/badge.tsx";
export { Button, type ButtonProps } from "../ui/button.tsx";
export { Calendar } from "../ui/calendar.tsx";
export { Checkbox } from "../ui/checkbox.tsx";
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog.tsx";
export { Input } from "../ui/input.tsx";
export { Label } from "../ui/label.tsx";
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
export { Textarea } from "../ui/textarea.tsx";
