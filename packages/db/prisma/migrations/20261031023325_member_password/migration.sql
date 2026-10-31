-- AlterTable
ALTER TABLE `members` ADD COLUMN `password_hash` VARCHAR(255) NULL,
    ADD COLUMN `password_updated_at` DATETIME(3) NULL;
