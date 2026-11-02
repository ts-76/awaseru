ALTER TABLE `polls` ADD `owner_id` text;--> statement-breakpoint
CREATE INDEX `polls_owner_created_id` ON `polls` (`owner_id`,`created_at`,`id`);