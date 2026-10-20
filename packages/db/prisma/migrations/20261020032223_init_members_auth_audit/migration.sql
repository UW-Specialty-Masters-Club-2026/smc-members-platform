-- CreateTable
CREATE TABLE `members` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `role` ENUM('MEMBER', 'ORGANIZER', 'ADMIN') NOT NULL DEFAULT 'MEMBER',
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `email_verified_at` DATETIME(3) NULL,
    `news_opt_in` BOOLEAN NOT NULL DEFAULT false,
    `news_opt_in_updated_at` DATETIME(3) NULL,
    `email_suppressed_reason` ENUM('UNSUBSCRIBED', 'COMPLAINED', 'HARD_BOUNCE') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `members_email_key`(`email`),
    INDEX `members_status_news_opt_in_email_verified_at_idx`(`status`, `news_opt_in`, `email_verified_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `magic_link_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `purpose` ENUM('SIGNUP', 'LOGIN') NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `magic_link_tokens_token_hash_key`(`token_hash`),
    INDEX `magic_link_tokens_member_id_created_at_idx`(`member_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `member_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_token_hash_key`(`token_hash`),
    INDEX `sessions_member_id_idx`(`member_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `run_id` VARCHAR(64) NOT NULL,
    `actor_type` ENUM('SYSTEM', 'MEMBER', 'ADMIN', 'WEBHOOK') NOT NULL,
    `actor_id` VARCHAR(64) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(50) NULL,
    `entity_id` VARCHAR(64) NULL,
    `result` ENUM('SUCCESS', 'FAILURE', 'SKIPPED', 'DENIED') NOT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_run_id_idx`(`run_id`),
    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `magic_link_tokens` ADD CONSTRAINT `magic_link_tokens_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
