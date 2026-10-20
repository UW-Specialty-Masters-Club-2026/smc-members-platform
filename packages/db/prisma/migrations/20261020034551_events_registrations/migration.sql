-- CreateTable
CREATE TABLE `events` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `summary` VARCHAR(280) NOT NULL,
    `details` TEXT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NULL,
    `location` VARCHAR(200) NOT NULL,
    `capacity` INTEGER NULL,
    `waitlist_enabled` BOOLEAN NOT NULL DEFAULT true,
    `registration_open` BOOLEAN NOT NULL DEFAULT true,
    `registration_closes_at` DATETIME(3) NULL,
    `published_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `events_slug_key`(`slug`),
    INDEX `events_status_starts_at_idx`(`status`, `starts_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registrations` (
    `id` VARCHAR(191) NOT NULL,
    `event_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `status` ENUM('CONFIRMED', 'WAITLISTED', 'CANCELLED') NOT NULL,
    `registered_at` DATETIME(3) NOT NULL,
    `confirmed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `registrations_event_id_status_registered_at_idx`(`event_id`, `status`, `registered_at`),
    INDEX `registrations_member_id_status_idx`(`member_id`, `status`),
    UNIQUE INDEX `registrations_event_id_member_id_key`(`event_id`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `members`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `registrations` ADD CONSTRAINT `registrations_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
