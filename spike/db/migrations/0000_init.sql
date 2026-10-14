CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`action` text NOT NULL,
	`entity_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_single_running_uq` ON `job` (`status`) WHERE status = 'running';--> statement-breakpoint
CREATE TABLE `po` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_number` text NOT NULL,
	`po_date` text NOT NULL,
	`po_value_u5` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `po_supplier_number_uq` ON `po` (`supplier_id`,`po_number`);--> statement-breakpoint
CREATE TABLE `po_item` (
	`id` text PRIMARY KEY NOT NULL,
	`po_id` text NOT NULL,
	`po_item_no` integer NOT NULL,
	`ord_qty_m` integer NOT NULL,
	`rate_u5` integer NOT NULL,
	FOREIGN KEY (`po_id`) REFERENCES `po`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `po_item_po_no_uq` ON `po_item` (`po_id`,`po_item_no`);--> statement-breakpoint
CREATE INDEX `po_item_po_idx` ON `po_item` (`po_id`);