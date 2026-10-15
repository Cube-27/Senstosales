CREATE INDEX `dc_po_id_idx` ON `dc` (`po_id`);--> statement-breakpoint
CREATE INDEX `dc_item_dc_id_idx` ON `dc_item` (`dc_id`);--> statement-breakpoint
CREATE INDEX `dc_item_po_item_id_idx` ON `dc_item` (`po_item_id`);--> statement-breakpoint
CREATE INDEX `invoice_po_id_idx` ON `invoice` (`po_id`);--> statement-breakpoint
CREATE INDEX `invoice_item_invoice_id_idx` ON `invoice_item` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `reconciliation_issue_po_id_idx` ON `reconciliation_issue` (`po_id`);--> statement-breakpoint
CREATE INDEX `srv_po_id_idx` ON `srv` (`po_id`);--> statement-breakpoint
CREATE INDEX `srv_item_resolved_dc_id_idx` ON `srv_item` (`resolved_dc_id`);--> statement-breakpoint
CREATE INDEX `srv_item_resolved_invoice_id_idx` ON `srv_item` (`resolved_invoice_id`);