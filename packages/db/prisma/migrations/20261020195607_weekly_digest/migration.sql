-- CreateTable
CREATE TABLE `news_posts` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `tag` VARCHAR(40) NULL,
    `title` VARCHAR(160) NOT NULL,
    `summary` VARCHAR(600) NOT NULL,
    `body` TEXT NULL,
    `link_url` VARCHAR(500) NULL,
    `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `apply_email` VARCHAR(320) NULL,
    `apply_checklist` JSON NULL,
    `published_at` DATETIME(3) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `news_posts_slug_key`(`slug`),
    INDEX `news_posts_status_published_at_idx`(`status`, `published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `news_openings` (
    `id` VARCHAR(191) NOT NULL,
    `news_post_id` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `openings` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `news_openings_news_post_id_position_key`(`news_post_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `digest_settings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `paused` BOOLEAN NOT NULL DEFAULT false,
    `paused_until` DATETIME(3) NULL,
    `paused_reason` VARCHAR(300) NULL,
    `updated_by_id` VARCHAR(64) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weekly_digests` (
    `id` VARCHAR(191) NOT NULL,
    `week_key` VARCHAR(10) NOT NULL,
    `issue_number` INTEGER NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENDING', 'SENT', 'PARTIALLY_FAILED', 'REJECTED', 'EXPIRED', 'SKIPPED') NOT NULL DEFAULT 'DRAFT',
    `window_start` DATETIME(3) NOT NULL,
    `window_end` DATETIME(3) NOT NULL,
    `content_snapshot` JSON NULL,
    `summary_text` VARCHAR(300) NULL,
    `summary_source` ENUM('TEMPLATE', 'AI') NULL,
    `subject` VARCHAR(200) NULL,
    `html` MEDIUMTEXT NULL,
    `text` MEDIUMTEXT NULL,
    `recipient_count_preview` INTEGER NULL,
    `send_not_before` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `approved_at` DATETIME(3) NULL,
    `rejected_by_id` VARCHAR(191) NULL,
    `rejected_at` DATETIME(3) NULL,
    `reject_reason` VARCHAR(500) NULL,
    `skip_reason` VARCHAR(300) NULL,
    `sending_started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `run_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `weekly_digests_week_key_key`(`week_key`),
    UNIQUE INDEX `weekly_digests_issue_number_key`(`issue_number`),
    INDEX `weekly_digests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `digest_batches` (
    `id` VARCHAR(191) NOT NULL,
    `digest_id` VARCHAR(191) NOT NULL,
    `batch_no` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'SENDING', 'SUBMITTED', 'RETRY_SCHEDULED', 'UNKNOWN', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `recipient_count` INTEGER NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NULL,
    `mailgun_message_id` VARCHAR(255) NULL,
    `last_error` VARCHAR(1000) NULL,
    `submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `digest_batches_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    UNIQUE INDEX `digest_batches_digest_id_batch_no_key`(`digest_id`, `batch_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `digest_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `digest_id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `week_key` VARCHAR(10) NOT NULL,
    `idempotency_key` VARCHAR(120) NOT NULL,
    `batch_id` VARCHAR(191) NULL,
    `status` ENUM('QUEUED', 'SUBMITTED', 'DELIVERED', 'TEMP_FAILED', 'FAILED', 'COMPLAINED', 'UNSUBSCRIBED', 'SKIPPED') NOT NULL DEFAULT 'QUEUED',
    `mailgun_message_id` VARCHAR(255) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error_code` VARCHAR(20) NULL,
    `last_error_message` VARCHAR(1000) NULL,
    `last_event_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `digest_deliveries_idempotency_key_key`(`idempotency_key`),
    INDEX `digest_deliveries_digest_id_status_idx`(`digest_id`, `status`),
    INDEX `digest_deliveries_batch_id_idx`(`batch_id`),
    UNIQUE INDEX `digest_deliveries_digest_id_member_id_key`(`digest_id`, `member_id`),
    UNIQUE INDEX `digest_deliveries_week_key_member_id_key`(`week_key`, `member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mailgun_webhook_events` (
    `id` VARCHAR(191) NOT NULL,
    `signature_token` VARCHAR(100) NOT NULL,
    `event_id` VARCHAR(100) NOT NULL,
    `event_type` VARCHAR(40) NOT NULL,
    `delivery_id` VARCHAR(40) NULL,
    `payload` JSON NOT NULL,
    `received_at` DATETIME(3) NOT NULL,
    `processed_at` DATETIME(3) NULL,

    UNIQUE INDEX `mailgun_webhook_events_signature_token_key`(`signature_token`),
    UNIQUE INDEX `mailgun_webhook_events_event_id_key`(`event_id`),
    INDEX `mailgun_webhook_events_delivery_id_idx`(`delivery_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `job_key` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `run_at` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 5,
    `locked_at` DATETIME(3) NULL,
    `locked_by` VARCHAR(64) NULL,
    `last_error` TEXT NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `jobs_job_key_key`(`job_key`),
    INDEX `jobs_status_run_at_idx`(`status`, `run_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `news_posts` ADD CONSTRAINT `news_posts_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `members`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `news_openings` ADD CONSTRAINT `news_openings_news_post_id_fkey` FOREIGN KEY (`news_post_id`) REFERENCES `news_posts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_digests` ADD CONSTRAINT `weekly_digests_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_digests` ADD CONSTRAINT `weekly_digests_rejected_by_id_fkey` FOREIGN KEY (`rejected_by_id`) REFERENCES `members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `digest_batches` ADD CONSTRAINT `digest_batches_digest_id_fkey` FOREIGN KEY (`digest_id`) REFERENCES `weekly_digests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `digest_deliveries` ADD CONSTRAINT `digest_deliveries_digest_id_fkey` FOREIGN KEY (`digest_id`) REFERENCES `weekly_digests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `digest_deliveries` ADD CONSTRAINT `digest_deliveries_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `digest_deliveries` ADD CONSTRAINT `digest_deliveries_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `digest_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
