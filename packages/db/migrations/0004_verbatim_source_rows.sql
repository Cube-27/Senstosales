CREATE TABLE `__new_srv_item` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`srv_id` text NOT NULL,
	`po_item_id` text,
	`row_no` integer NOT NULL,
	`material_code` text,
	`po_item_no` integer NOT NULL,
	`sub_item_no` text,
	`lot_no` integer,
	`srv_item_no` integer NOT NULL,
	`rev_no` text,
	`division` text,
	`pmir_no` text,
	`unit` text,
	`ord_qty_m` integer NOT NULL,
	`challan_qty_m` integer,
	`rcd_qty_m` integer,
	`accepted_qty_m` integer,
	`rej_qty_m` integer,
	`challan_no` text,
	`challan_date` text,
	`invoice_no` text,
	`invoice_date` text,
	`finance_date` text,
	`cnote_no` text,
	`cnote_date` text,
	`raw_row_json` text,
	`resolved_dc_id` text,
	`resolved_invoice_id` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`srv_id`) REFERENCES `srv`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_srv_item`("id", "supplier_id", "srv_id", "po_item_id", "row_no", "material_code", "po_item_no", "lot_no", "srv_item_no", "ord_qty_m", "rcd_qty_m", "accepted_qty_m", "rej_qty_m", "challan_no", "challan_date", "invoice_no", "invoice_date", "resolved_dc_id", "resolved_invoice_id") SELECT "id", "supplier_id", "srv_id", "po_item_id", ROW_NUMBER() OVER (PARTITION BY "srv_id" ORDER BY "id"), "material_code", "po_item_no", "lot_no", "srv_item_no", "ord_qty_m", "rcd_qty_m", "accepted_qty_m", "rej_qty_m", "challan_no", "challan_date", "invoice_no", "invoice_date", "resolved_dc_id", "resolved_invoice_id" FROM `srv_item`;--> statement-breakpoint
DROP TABLE `srv_item`;--> statement-breakpoint
ALTER TABLE `__new_srv_item` RENAME TO `srv_item`;--> statement-breakpoint
CREATE INDEX `srv_item_srv_id_idx` ON `srv_item` (`srv_id`);--> statement-breakpoint
CREATE INDEX `srv_item_po_item_id_idx` ON `srv_item` (`po_item_id`);--> statement-breakpoint
CREATE INDEX `srv_item_resolved_dc_id_idx` ON `srv_item` (`resolved_dc_id`);--> statement-breakpoint
CREATE INDEX `srv_item_resolved_invoice_id_idx` ON `srv_item` (`resolved_invoice_id`);--> statement-breakpoint
ALTER TABLE `po_item` ADD `mtrl_cat` text;--> statement-breakpoint
ALTER TABLE `po_item` ADD `item_value_u5` integer;--> statement-breakpoint
ALTER TABLE `po_lot` ADD `raw_row_json` text;--> statement-breakpoint
CREATE INDEX `reconciliation_issue_scope_idx` ON `reconciliation_issue` (`scope_type`,`scope_id`);