CREATE TABLE `app_user` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_changed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_user_username_unique` ON `app_user` (`username`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`job_id` text
);
--> statement-breakpoint
CREATE TABLE `buyer` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`unit_name` text NOT NULL,
	`state` text,
	`state_code` text,
	`gstin` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dc` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_id` text NOT NULL,
	`number` text NOT NULL,
	`dc_date` text NOT NULL,
	`financial_year` text NOT NULL,
	`gc_number` text NOT NULL,
	`gc_date` text NOT NULL,
	`our_ref` text,
	`department_no` text,
	`consignee_name` text,
	`consignee_gstin` text,
	`consignee_address` text,
	`inspection_company` text,
	`eway_bill_no` text,
	`vehicle_no` text,
	`lr_no` text,
	`transporter` text,
	`mode_of_transport` text,
	`remarks` text,
	`supplier_name` text,
	`supplier_address` text,
	`supplier_gstin` text,
	`supplier_contact` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_id`) REFERENCES `po`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dc_supplier_number_fy_uq` ON `dc` (`supplier_id`,`number`,`financial_year`);--> statement-breakpoint
CREATE UNIQUE INDEX `dc_supplier_gc_number_fy_uq` ON `dc` (`supplier_id`,`gc_number`,`financial_year`);--> statement-breakpoint
CREATE TABLE `dc_item` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`dc_id` text NOT NULL,
	`po_item_id` text NOT NULL,
	`dsp_qty_m` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dc_id`) REFERENCES `dc`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_item_id`) REFERENCES `po_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_id` text NOT NULL,
	`dc_id` text,
	`kind` text NOT NULL,
	`number` text NOT NULL,
	`invoice_date` text NOT NULL,
	`financial_year` text NOT NULL,
	`buyer_name` text,
	`buyer_gstin` text,
	`buyer_address` text,
	`buyer_state` text,
	`buyer_state_code` text,
	`place_of_supply` text,
	`buyers_order_date` text,
	`gemc_number` text,
	`gemc_date` text,
	`payment_terms` text,
	`despatch_doc_no` text,
	`srv_no` text,
	`srv_date` text,
	`vehicle_no` text,
	`lr_no` text,
	`transporter` text,
	`destination` text,
	`terms_of_delivery` text,
	`remarks` text,
	`supplier_name` text,
	`supplier_address` text,
	`supplier_gstin` text,
	`supplier_contact` text,
	`cgst_pct_u5` integer NOT NULL,
	`sgst_pct_u5` integer NOT NULL,
	`taxable_u5` integer NOT NULL,
	`cgst_u5` integer NOT NULL,
	`sgst_u5` integer NOT NULL,
	`igst_u5` integer NOT NULL,
	`total_u5` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_id`) REFERENCES `po`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dc_id`) REFERENCES `dc`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_supplier_number_fy_uq` ON `invoice` (`supplier_id`,`number`,`financial_year`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_dc_id_uq` ON `invoice` (`dc_id`);--> statement-breakpoint
CREATE TABLE `invoice_item` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`po_item_id` text NOT NULL,
	`dc_item_id` text,
	`qty_m` integer NOT NULL,
	`rate_u5` integer NOT NULL,
	`taxable_u5` integer NOT NULL,
	`cgst_u5` integer NOT NULL,
	`sgst_u5` integer NOT NULL,
	`igst_u5` integer NOT NULL,
	`total_u5` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoice`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_item_id`) REFERENCES `po_item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dc_item_id`) REFERENCES `dc_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`progress_json` text NOT NULL,
	`error` text,
	`summary_json` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_one_running_uq` ON `job` (`status`) WHERE status = 'running';--> statement-breakpoint
CREATE TABLE `job_event` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`at` text NOT NULL,
	`level` text NOT NULL,
	`document_key` text,
	`message` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `po` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_number` text NOT NULL,
	`po_date` text,
	`buyer_id` text,
	`enquiry` text,
	`quotation` text,
	`order_type` text,
	`bhel_status_code` text,
	`amend_no` integer NOT NULL,
	`po_value_u5` integer,
	`net_po_value_u5` integer,
	`is_gemc` integer NOT NULL,
	`gemc_number` text,
	`remarks` text,
	`raw_header_json` text NOT NULL,
	`status` text NOT NULL,
	`ord_qty_m` integer NOT NULL,
	`dsp_qty_m` integer NOT NULL,
	`rcd_qty_m` integer NOT NULL,
	`rej_qty_m` integer NOT NULL,
	`balance_qty_m` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `po_supplier_po_number_uq` ON `po` (`supplier_id`,`po_number`);--> statement-breakpoint
CREATE TABLE `po_item` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_id` text NOT NULL,
	`po_item_no` integer NOT NULL,
	`material_code` text,
	`description` text,
	`drawing_no` text,
	`unit` text,
	`ord_qty_m` integer NOT NULL,
	`rate_source_u5` integer NOT NULL,
	`rate_u5` integer NOT NULL,
	`po_rcd_qty_m` integer NOT NULL,
	`po_rej_qty_m` integer,
	`cancelled_at` text,
	`manual_dispatched_qty_m` integer DEFAULT 0 NOT NULL,
	`manual_note` text,
	`manual_set_at` text,
	`dsp_qty_m` integer NOT NULL,
	`rcd_qty_m` integer NOT NULL,
	`rej_qty_m` integer NOT NULL,
	`balance_qty_m` integer NOT NULL,
	`uninvoiced_qty_m` integer NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_id`) REFERENCES `po`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "po_item_manual_dispatched_qty_m_check" CHECK("po_item"."manual_dispatched_qty_m" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `po_item_po_item_no_uq` ON `po_item` (`po_id`,`po_item_no`);--> statement-breakpoint
CREATE TABLE `po_lot` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_item_id` text NOT NULL,
	`lot_no` integer NOT NULL,
	`dely_qty_m` integer NOT NULL,
	`dely_date` text,
	`entry_allow_date` text,
	`entry_allow_note` text,
	`dest_code` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_item_id`) REFERENCES `po_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reconciliation_issue` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`type` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`po_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`details_json` text NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`opened_at` text NOT NULL,
	`acknowledged_at` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reconciliation_issue_fingerprint_uq` ON `reconciliation_issue` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `schema_migration` (
	`version` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`applied_at` text NOT NULL,
	`app_version` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secret` (
	`supplier_id` text NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`supplier_id`, `name`),
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_hash_unique` ON `session` (`token_hash`);--> statement-breakpoint
CREATE TABLE `settings` (
	`supplier_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`supplier_id`, `key`),
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_document` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`storage_key` text NOT NULL,
	`sha256` text NOT NULL,
	`doc_date` text,
	`ingested_at` text NOT NULL,
	`job_id` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `srv` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_number` text NOT NULL,
	`po_id` text,
	`srv_number` text NOT NULL,
	`srv_date` text NOT NULL,
	`financial_year` text NOT NULL,
	`raw_header_json` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `srv_supplier_po_number_srv_number_uq` ON `srv` (`supplier_id`,`po_number`,`srv_number`);--> statement-breakpoint
CREATE TABLE `srv_item` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`srv_id` text NOT NULL,
	`po_item_id` text,
	`material_code` text,
	`po_item_no` integer NOT NULL,
	`lot_no` integer NOT NULL,
	`srv_item_no` integer NOT NULL,
	`ord_qty_m` integer NOT NULL,
	`rcd_qty_m` integer,
	`accepted_qty_m` integer,
	`rej_qty_m` integer,
	`challan_no` text,
	`challan_date` text,
	`invoice_no` text,
	`invoice_date` text,
	`resolved_dc_id` text,
	`resolved_invoice_id` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`srv_id`) REFERENCES `srv`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `supplier` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`gstin` text,
	`address` text,
	`state` text,
	`state_code` text,
	`contact` text,
	`email` text,
	`bhel_supplier_code` text,
	`bank_details_json` text NOT NULL,
	`invoice_defaults_json` text NOT NULL
);
