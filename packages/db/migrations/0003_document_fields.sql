ALTER TABLE `dc` ADD `invoice_number` text;--> statement-breakpoint
ALTER TABLE `dc` ADD `invoice_date` text;--> statement-breakpoint
ALTER TABLE `dc_item` ADD `packets` integer;--> statement-breakpoint
ALTER TABLE `invoice_item` ADD `hsn` text;--> statement-breakpoint
ALTER TABLE `invoice_item` ADD `packets` integer;