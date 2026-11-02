CREATE TABLE `polls` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`slots` text NOT NULL,
	`status` text NOT NULL,
	`selected_slot` text,
	`revision` integer NOT NULL,
	`admin_hash` text NOT NULL,
	`create_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `polls_create_key_unique` ON `polls` (`create_key`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_id` text NOT NULL,
	`name` text NOT NULL,
	`comment` text NOT NULL,
	`answers` text NOT NULL,
	`edit_hash` text NOT NULL,
	`revision` integer NOT NULL,
	`request_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `responses_request_key_unique` ON `responses` (`request_key`);