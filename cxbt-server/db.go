package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

var (
	DB         *gorm.DB
	RDB        *redis.Client
	RedisReady bool
	Ctx        = context.Background()

	roomStoreMu sync.RWMutex
	memRooms    = make(map[string]RoomConfig)

	gameStoreMu sync.RWMutex
	memGames    = make(map[string]GameState)
)

func getenvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func InitDB() {
	var err error

	// MySQL 8 configuration (supports env override or default server credentials)
	user := getenvDefault("MYSQL_USER", "root")
	password := getenvDefault("MYSQL_PASSWORD", "UnKnnow@lhit.top4191792000")
	host := getenvDefault("MYSQL_HOST", "39.101.142.240:3306")
	dbName := getenvDefault("MYSQL_DB", "cxbt")

	// 1. Connect without dbname to ensure the MySQL 8 database exists
	dsnWithoutDB := fmt.Sprintf("%s:%s@tcp(%s)/?charset=utf8mb4&parseTime=True&loc=Local&timeout=10s", user, password, host)
	tempDB, err := gorm.Open(mysql.Open(dsnWithoutDB), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect to MySQL 8 server (%s): %v", host, err)
	}

	createDBCommand := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;", dbName)
	if err := tempDB.Exec(createDBCommand).Error; err != nil {
		log.Fatalf("failed to create database %s: %v", dbName, err)
	}

	// 2. Connect to the specific MySQL 8 database
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?charset=utf8mb4&parseTime=True&loc=Local&timeout=10s", user, password, host, dbName)
	DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database %s: %v", dbName, err)
	}

	sqlDB, err := DB.DB()
	if err == nil {
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetMaxOpenConns(20)
		sqlDB.SetConnMaxLifetime(2 * time.Minute)
		sqlDB.SetConnMaxIdleTime(30 * time.Second)
	}

	// Drop legacy unique index on saved_characters.name if it exists so multiple users can use any display name
	_ = DB.Exec("ALTER TABLE `saved_characters` DROP INDEX `idx_saved_characters_name`").Error
	_ = DB.Exec("ALTER TABLE `saved_characters` DROP INDEX `name`").Error
	_ = DB.Exec("UPDATE `saved_characters` SET `deleted_at` = NULL WHERE `deleted_at` IS NOT NULL").Error

	// Migrate all MySQL 8 tables
	err = DB.AutoMigrate(
		&User{},
		&SavedCharacter{},
		&Friend{},
		&Guild{},
		&GuildMember{},
		&Mail{},
		&Inventory{},
		&ItemEnhancement{},
		&PlayerMission{},
		&AuctionListing{},
		&MatchRecord{},
		&ChatMessage{},
		&BattleRoomRecord{},
		&PlayerReport{},
		&PlayerFeedback{},
		&VoteKickRecord{},
	)
	if err != nil {
		log.Fatalf("failed to migrate MySQL 8 database: %v", err)
	}

	purgeFakeAndStaleData()
	log.Println("MySQL 8 connected, migrated, and cleaned of fake data.")

	// Initialize Redis
	redisAddr := getenvDefault("REDIS_ADDR", "lhit.top:9992")
	redisPass := getenvDefault("REDIS_PASSWORD", "www.lhit.top")
	RDB = redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		Password:     redisPass,
		DB:           10,
		DialTimeout:  3 * time.Second,
		ReadTimeout:  2 * time.Second,
		WriteTimeout: 2 * time.Second,
	})

	if _, err = RDB.Ping(Ctx).Result(); err != nil {
		log.Printf("WARNING: Redis connection failed (%v), using in-memory room & pubsub store.", err)
		RedisReady = false
	} else {
		RedisReady = true
		log.Println("Redis connected successfully.")
		// Clear stale/fake room:* and game:* keys on server startup so no ghost rooms persist
		if roomKeys, err := RDB.Keys(Ctx, "room:*").Result(); err == nil && len(roomKeys) > 0 {
			_ = RDB.Del(Ctx, roomKeys...).Err()
		}
		if gameKeys, err := RDB.Keys(Ctx, "game:*").Result(); err == nil && len(gameKeys) > 0 {
			_ = RDB.Del(Ctx, gameKeys...).Err()
		}
	}
}

func purgeFakeAndStaleData() {
	// Clear any stale rooms from previous server runs
	_ = DB.Unscoped().Where("1 = 1").Delete(&BattleRoomRecord{}).Error

	// Remove previously seeded fake guilds and fake system auction listings
	_ = DB.Unscoped().Where("name IN ? OR owner_name IN ?",
		[]string{"凌云战神殿", "百变精英团", "创想先驱同盟"},
		[]string{"星际指挥官", "暗影刺客", "蕾欧娜"},
	).Delete(&Guild{}).Error

	_ = DB.Unscoped().Where("seller_id = 0 OR seller_name IN ?",
		[]string{"系统商会", "系统"},
	).Delete(&AuctionListing{}).Error

	// Clean up any automated test/fake users and their characters
	var fakeUsers []User
	if err := DB.Unscoped().Where(
		"username LIKE 'e2e_%' OR username LIKE 'test_%' OR username LIKE 'bot_%' OR username LIKE 'fake_%' OR username LIKE 'auto_%'",
	).Find(&fakeUsers).Error; err == nil && len(fakeUsers) > 0 {
		ids := make([]uint, 0, len(fakeUsers))
		for _, u := range fakeUsers {
			ids = append(ids, u.ID)
		}
		_ = DB.Unscoped().Where("user_id IN ?", ids).Delete(&SavedCharacter{}).Error
		_ = DB.Unscoped().Where("user_id IN ? OR friend_id IN ?", ids, ids).Delete(&Friend{}).Error
		_ = DB.Unscoped().Where("user_id IN ?", ids).Delete(&GuildMember{}).Error
		_ = DB.Unscoped().Where("receiver_id IN ? OR sender_id IN ?", ids, ids).Delete(&Mail{}).Error
		_ = DB.Unscoped().Where("user_id IN ?", ids).Delete(&Inventory{}).Error
		_ = DB.Unscoped().Where("user_id IN ?", ids).Delete(&ItemEnhancement{}).Error
		_ = DB.Unscoped().Where("user_id IN ?", ids).Delete(&PlayerMission{}).Error
		_ = DB.Unscoped().Where("user_id IN ?", ids).Delete(&MatchRecord{}).Error
		_ = DB.Unscoped().Where("id IN ?", ids).Delete(&User{}).Error
	}

	// Clean up orphaned characters whose user no longer exists
	_ = DB.Exec("DELETE FROM `saved_characters` WHERE `user_id` NOT IN (SELECT `id` FROM `users`)").Error
}

// --- Dual In-Memory + Redis + MySQL 8 Store Helpers ---

func SaveRoomToStore(room RoomConfig) {
	if len(room.Players) == 0 {
		DeleteRoomFromStore(room.ID)
		DeleteGameFromStore(room.ID)
		return
	}
	room.UpdatedAt = time.Now().Unix()
	roomStoreMu.Lock()
	memRooms[room.ID] = room
	roomStoreMu.Unlock()

	if RedisReady && RDB != nil {
		if roomJSON, err := json.Marshal(room); err == nil {
			_ = RDB.Set(Ctx, "room:"+room.ID, roomJSON, 0).Err()
		}
	}

	if DB != nil {
		playersBytes, _ := json.Marshal(room.Players)
		rec := BattleRoomRecord{
			RoomID:       room.ID,
			Name:         room.Name,
			Password:     room.Password,
			MaxPlayers:   room.MaxPlayers,
			BalanceTeams: room.BalanceTeams,
			ModeID:       room.ModeID,
			ModeName:     room.ModeName,
			MapID:        room.MapID,
			MapName:      room.MapName,
			HostID:       room.HostID,
			HostName:     room.HostName,
			State:        room.State,
			PlayerCount:  len(room.Players),
			PlayersJSON:  string(playersBytes),
		}
		var existing BattleRoomRecord
		if err := DB.Unscoped().Where("room_id = ?", room.ID).First(&existing).Error; err == nil {
			existing.DeletedAt.Valid = false
			existing.Name = rec.Name
			existing.Password = rec.Password
			existing.MaxPlayers = rec.MaxPlayers
			existing.BalanceTeams = rec.BalanceTeams
			existing.ModeID = rec.ModeID
			existing.ModeName = rec.ModeName
			existing.MapID = rec.MapID
			existing.MapName = rec.MapName
			existing.HostID = rec.HostID
			existing.HostName = rec.HostName
			existing.State = rec.State
			existing.PlayerCount = rec.PlayerCount
			existing.PlayersJSON = rec.PlayersJSON
			_ = DB.Unscoped().Save(&existing).Error
		} else {
			_ = DB.Create(&rec).Error
		}
	}
}

func GetRoomFromStore(roomID string) (RoomConfig, bool) {
	roomStoreMu.RLock()
	room, ok := memRooms[roomID]
	roomStoreMu.RUnlock()
	if ok {
		if len(room.Players) == 0 {
			DeleteRoomFromStore(roomID)
			DeleteGameFromStore(roomID)
			return RoomConfig{}, false
		}
		return room, true
	}

	if RedisReady && RDB != nil {
		if val, err := RDB.Get(Ctx, "room:"+roomID).Result(); err == nil {
			var r RoomConfig
			if json.Unmarshal([]byte(val), &r) == nil {
				if len(r.Players) == 0 {
					DeleteRoomFromStore(roomID)
					DeleteGameFromStore(roomID)
					return RoomConfig{}, false
				}
				roomStoreMu.Lock()
				memRooms[roomID] = r
				roomStoreMu.Unlock()
				return r, true
			}
		}
	}
	return RoomConfig{}, false
}

func GetAllRoomsFromStore() []RoomConfig {
	roomStoreMu.RLock()
	rooms := make([]RoomConfig, 0, len(memRooms))
	emptyIDs := make([]string, 0)
	for id, r := range memRooms {
		if len(r.Players) == 0 {
			emptyIDs = append(emptyIDs, id)
			continue
		}
		rooms = append(rooms, r)
	}
	roomStoreMu.RUnlock()

	for _, id := range emptyIDs {
		DeleteRoomFromStore(id)
		DeleteGameFromStore(id)
	}
	return rooms
}

func DeleteRoomFromStore(roomID string) {
	roomStoreMu.Lock()
	delete(memRooms, roomID)
	roomStoreMu.Unlock()

	if RedisReady && RDB != nil {
		_ = RDB.Del(Ctx, "room:"+roomID).Err()
	}
	if DB != nil {
		_ = DB.Unscoped().Where("room_id = ?", roomID).Delete(&BattleRoomRecord{}).Error
	}
}

func SaveGameToStore(roomID string, state GameState) {
	gameStoreMu.Lock()
	memGames[roomID] = state
	gameStoreMu.Unlock()

	if RedisReady && RDB != nil {
		if stateJSON, err := json.Marshal(state); err == nil {
			_ = RDB.Set(Ctx, "game:"+roomID, stateJSON, 0).Err()
		}
	}
}

func GetGameFromStore(roomID string) (GameState, bool) {
	gameStoreMu.RLock()
	state, ok := memGames[roomID]
	gameStoreMu.RUnlock()
	if ok {
		return state, true
	}

	if RedisReady && RDB != nil {
		if val, err := RDB.Get(Ctx, "game:"+roomID).Result(); err == nil {
			var st GameState
			if json.Unmarshal([]byte(val), &st) == nil {
				gameStoreMu.Lock()
				memGames[roomID] = st
				gameStoreMu.Unlock()
				return st, true
			}
		}
	}
	return GameState{}, false
}

func DeleteGameFromStore(roomID string) {
	gameStoreMu.Lock()
	delete(memGames, roomID)
	gameStoreMu.Unlock()

	if RedisReady && RDB != nil {
		_ = RDB.Del(Ctx, "game:"+roomID).Err()
	}
}

func FlushStore() {
	roomStoreMu.Lock()
	memRooms = make(map[string]RoomConfig)
	roomStoreMu.Unlock()

	gameStoreMu.Lock()
	memGames = make(map[string]GameState)
	gameStoreMu.Unlock()

	if RedisReady && RDB != nil {
		_ = RDB.FlushAll(Ctx).Err()
	}
}
