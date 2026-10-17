-- =============================================================================
-- 创想兵团 (AvatarStar / cxbt-server) MySQL 8 全量数据库表结构定义 (16张核心实体表)
-- 与 models.go / db.go GORM AutoMigrate 1:1 严格对齐
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `cxbt` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `cxbt`;

-- 1. 用户账号表 (User)
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `username` varchar(191) NOT NULL,
  `password` longtext NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_username` (`username`),
  KEY `idx_users_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. 玩家角色主表 (SavedCharacter)
CREATE TABLE IF NOT EXISTS `saved_characters` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `version` bigint DEFAULT '1',
  `name` varchar(191) NOT NULL,
  `job_id` varchar(64) DEFAULT 'guardian',
  `appearance` json DEFAULT NULL,
  `level` bigint DEFAULT '1',
  `exp` bigint DEFAULT '0',
  `coins` bigint DEFAULT '100000',
  `cash` bigint DEFAULT '5000',
  `gems` bigint DEFAULT '200',
  `rating` bigint DEFAULT '1200',
  `power` bigint DEFAULT '1500',
  `sign_in_streak` bigint DEFAULT '0',
  `last_sign_in_date` varchar(32) DEFAULT NULL,
  `online_claim_count` bigint DEFAULT '0',
  `equipped_weapons` varchar(500) DEFAULT NULL,
  `active_wing` varchar(64) DEFAULT NULL,
  `active_pet` varchar(64) DEFAULT NULL,
  `quickbar_json` text,
  `luck_draw_pos` bigint DEFAULT '0',
  `luck_draw_stamina` bigint DEFAULT '100',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_saved_characters_user_id` (`user_id`),
  KEY `idx_saved_characters_name` (`name`),
  KEY `idx_saved_characters_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. 好友关系表 (Friend)
CREATE TABLE IF NOT EXISTS `friends` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `friend_id` bigint unsigned DEFAULT NULL,
  `friend_name` varchar(191) DEFAULT NULL,
  `status` varchar(32) DEFAULT 'Accepted',
  PRIMARY KEY (`id`),
  KEY `idx_friends_user_id` (`user_id`),
  KEY `idx_friends_friend_id` (`friend_id`),
  KEY `idx_friends_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. 公会表 (Guild)
CREATE TABLE IF NOT EXISTS `guilds` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `name` varchar(191) DEFAULT NULL,
  `notice` varchar(500) DEFAULT NULL,
  `level` bigint DEFAULT '1',
  `owner_id` bigint unsigned DEFAULT NULL,
  `owner_name` varchar(191) DEFAULT NULL,
  `member_count` bigint DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_guilds_name` (`name`),
  KEY `idx_guilds_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 5. 公会成员表 (GuildMember)
CREATE TABLE IF NOT EXISTS `guild_members` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `guild_id` bigint unsigned DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `username` varchar(191) DEFAULT NULL,
  `role` varchar(32) DEFAULT NULL,
  `contribution` bigint DEFAULT '100',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_guild_members_user_id` (`user_id`),
  KEY `idx_guild_members_guild_id` (`guild_id`),
  KEY `idx_guild_members_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 6. 邮件表 (Mail)
CREATE TABLE IF NOT EXISTS `mails` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `receiver_id` bigint unsigned DEFAULT NULL,
  `sender_id` bigint unsigned DEFAULT NULL,
  `sender_name` varchar(191) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `content` text,
  `is_read` tinyint(1) DEFAULT '0',
  `is_claimed` tinyint(1) DEFAULT '0',
  `reward_coins` bigint DEFAULT '0',
  `reward_gems` bigint DEFAULT '0',
  `attachment` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_mails_receiver_id` (`receiver_id`),
  KEY `idx_mails_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 7. 背包与装备表 (Inventory)
CREATE TABLE IF NOT EXISTS `inventories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `item_id` varchar(191) DEFAULT NULL,
  `item_name` varchar(191) DEFAULT NULL,
  `category` varchar(64) DEFAULT NULL,
  `count` bigint DEFAULT '1',
  `enhance_level` bigint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_inventories_user_id` (`user_id`),
  KEY `idx_inventories_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 8. 装备部位强化表 (ItemEnhancement)
CREATE TABLE IF NOT EXISTS `item_enhancements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `slot_key` varchar(64) DEFAULT NULL,
  `slot_name` varchar(128) DEFAULT NULL,
  `level` bigint DEFAULT '0',
  `bonus_power` bigint DEFAULT '0',
  `bonus_hp` bigint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_item_enhancements_user_id` (`user_id`),
  KEY `idx_item_enhancements_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 9. 玩家任务进度表 (PlayerMission)
CREATE TABLE IF NOT EXISTS `player_missions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `mission_code` varchar(64) DEFAULT NULL,
  `title` varchar(191) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `progress` bigint DEFAULT '0',
  `target` bigint DEFAULT '1',
  `reward_coins` bigint DEFAULT '5000',
  `reward_exp` bigint DEFAULT '200',
  `reward_gems` bigint DEFAULT '20',
  `claimed` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_player_missions_user_id` (`user_id`),
  KEY `idx_player_missions_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 10. 拍卖行挂单表 (AuctionListing)
CREATE TABLE IF NOT EXISTS `auction_listings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `seller_id` bigint unsigned DEFAULT NULL,
  `seller_name` varchar(191) DEFAULT NULL,
  `item_id` varchar(191) DEFAULT NULL,
  `item_name` varchar(191) DEFAULT NULL,
  `category` varchar(64) DEFAULT NULL,
  `price_coins` bigint DEFAULT '1000',
  `status` varchar(32) DEFAULT 'Active',
  PRIMARY KEY (`id`),
  KEY `idx_auction_listings_seller_id` (`seller_id`),
  KEY `idx_auction_listings_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 11. 历史战绩结算表 (MatchRecord)
CREATE TABLE IF NOT EXISTS `match_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `username` varchar(191) DEFAULT NULL,
  `room_id` varchar(64) DEFAULT NULL,
  `mode_name` varchar(64) DEFAULT NULL,
  `map_name` varchar(64) DEFAULT NULL,
  `result` varchar(32) DEFAULT NULL,
  `kills` bigint DEFAULT '0',
  `deaths` bigint DEFAULT '0',
  `reward_coins` bigint DEFAULT '0',
  `reward_exp` bigint DEFAULT '0',
  `rating_delta` bigint DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_match_records_user_id` (`user_id`),
  KEY `idx_match_records_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 12. 聊天消息记录表 (ChatMessage)
CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `channel` varchar(64) DEFAULT NULL,
  `sender` varchar(191) DEFAULT NULL,
  `message` varchar(500) DEFAULT NULL,
  `msg_type` varchar(32) DEFAULT 'chat',
  PRIMARY KEY (`id`),
  KEY `idx_chat_messages_channel` (`channel`),
  KEY `idx_chat_messages_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 13. 实时活跃房间同步表 (BattleRoomRecord, 房间无人时自动删除)
CREATE TABLE IF NOT EXISTS `battle_room_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `room_id` varchar(128) NOT NULL,
  `name` varchar(191) DEFAULT NULL,
  `password` varchar(128) DEFAULT NULL,
  `max_players` bigint DEFAULT '16',
  `balance_teams` tinyint(1) DEFAULT '1',
  `mode_id` varchar(64) DEFAULT NULL,
  `mode_name` varchar(64) DEFAULT NULL,
  `map_id` varchar(64) DEFAULT NULL,
  `map_name` varchar(128) DEFAULT NULL,
  `host_id` bigint unsigned DEFAULT NULL,
  `host_name` varchar(191) DEFAULT NULL,
  `state` varchar(32) DEFAULT 'Waiting',
  `player_count` bigint DEFAULT '1',
  `players_json` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_battle_room_records_room_id` (`room_id`),
  KEY `idx_battle_room_records_host_id` (`host_id`),
  KEY `idx_battle_room_records_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 14. 战场反作弊与卡BUG举报表 (PlayerReport)
CREATE TABLE IF NOT EXISTS `player_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `reporter_id` varchar(64) DEFAULT NULL,
  `target_id` varchar(64) DEFAULT NULL,
  `target_name` varchar(191) DEFAULT NULL,
  `reason_type` bigint DEFAULT '0',
  `reason_label` varchar(191) DEFAULT NULL,
  `content` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_player_reports_reporter_id` (`reporter_id`),
  KEY `idx_player_reports_target_id` (`target_id`),
  KEY `idx_player_reports_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 15. 玩家有奖调研与反馈表 (PlayerFeedback)
CREATE TABLE IF NOT EXISTS `player_feedbacks` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `user_id` varchar(64) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `content` text,
  PRIMARY KEY (`id`),
  KEY `idx_player_feedbacks_user_id` (`user_id`),
  KEY `idx_player_feedbacks_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 16. 战场投票踢人记录表 (VoteKickRecord)
CREATE TABLE IF NOT EXISTS `vote_kick_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime(3) DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT NULL,
  `deleted_at` datetime(3) DEFAULT NULL,
  `room_id` varchar(128) DEFAULT NULL,
  `initiator` varchar(191) DEFAULT NULL,
  `target_id` varchar(64) DEFAULT NULL,
  `target_name` varchar(191) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vote_kick_records_room_id` (`room_id`),
  KEY `idx_vote_kick_records_target_id` (`target_id`),
  KEY `idx_vote_kick_records_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
