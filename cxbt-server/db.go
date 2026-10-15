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
	)
	if err != nil {
		log.Fatalf("failed to migrate MySQL 8 database: %v", err)
	}

	seedInitialMySQLData()
	log.Println("MySQL 8 connected and migrated successfully.")

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
		// Load any existing rooms from Redis into memory cache
		keys, err := RDB.Keys(Ctx, "room:*").Result()
		if err == nil {
			for _, key := range keys {
				if val, err := RDB.Get(Ctx, key).Result(); err == nil {
					var room RoomConfig
					if json.Unmarshal([]byte(val), &room) == nil && room.ID != "" {
						roomStoreMu.Lock()
						memRooms[room.ID] = room
						roomStoreMu.Unlock()
					}
				}
			}
		}
	}
}

func seedInitialMySQLData() {
	var guildCount int64
	DB.Model(&Guild{}).Count(&guildCount)
	if guildCount == 0 {
		defaultGuilds := []Guild{
			{Name: "凌云战神殿", Notice: "欢迎各位百变战友加入凌云战神殿，每日组队远征！", Level: 5, OwnerID: 1, OwnerName: "星际指挥官", MemberCount: 12},
			{Name: "百变精英团", Notice: "专注团队竞技与夺旗排位，冲击大元帅军衔！", Level: 4, OwnerID: 2, OwnerName: "暗影刺客", MemberCount: 8},
			{Name: "创想先驱同盟", Notice: "休闲娱乐、造型鉴赏、沙盒建造爱好者聚集地！", Level: 3, OwnerID: 3, OwnerName: "蕾欧娜", MemberCount: 19},
		}
		for _, g := range defaultGuilds {
			DB.Create(&g)
		}
	}

	var auctionCount int64
	DB.Model(&AuctionListing{}).Where("status = ?", "Active").Count(&auctionCount)
	if auctionCount == 0 {
		defaultListings := []AuctionListing{
			{SellerID: 0, SellerName: "系统商会", ItemID: "rifle_02b", ItemName: "黄金突击步枪", Category: "equipment", PriceCoins: 12800, Status: "Active"},
			{SellerID: 0, SellerName: "系统商会", ItemID: "sniper_02c", ItemName: "星耀狙击枪", Category: "equipment", PriceCoins: 15800, Status: "Active"},
			{SellerID: 0, SellerName: "系统商会", ItemID: "twohandgun_01c", ItemName: "雷霆重机枪", Category: "equipment", PriceCoins: 14500, Status: "Active"},
			{SellerID: 0, SellerName: "系统商会", ItemID: "bow_01c", ItemName: "幻影复合弓", Category: "equipment", PriceCoins: 13200, Status: "Active"},
			{SellerID: 0, SellerName: "系统商会", ItemID: "sword_01b", ItemName: "烈焰斩舰刀", Category: "equipment", PriceCoins: 11000, Status: "Active"},
			{SellerID: 0, SellerName: "系统商会", ItemID: "wing_angel", ItemName: "炽天使之翼", Category: "equipment", PriceCoins: 25000, Status: "Active"},
		}
		for _, item := range defaultListings {
			DB.Create(&item)
		}
	}
}

// --- Dual In-Memory + Redis Store Helpers ---

func SaveRoomToStore(room RoomConfig) {
	roomStoreMu.Lock()
	memRooms[room.ID] = room
	roomStoreMu.Unlock()

	if RedisReady && RDB != nil {
		if roomJSON, err := json.Marshal(room); err == nil {
			_ = RDB.Set(Ctx, "room:"+room.ID, roomJSON, 0).Err()
		}
	}
}

func GetRoomFromStore(roomID string) (RoomConfig, bool) {
	roomStoreMu.RLock()
	room, ok := memRooms[roomID]
	roomStoreMu.RUnlock()
	if ok {
		return room, true
	}

	if RedisReady && RDB != nil {
		if val, err := RDB.Get(Ctx, "room:"+roomID).Result(); err == nil {
			var r RoomConfig
			if json.Unmarshal([]byte(val), &r) == nil {
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
	for _, r := range memRooms {
		rooms = append(rooms, r)
	}
	roomStoreMu.RUnlock()
	return rooms
}

func DeleteRoomFromStore(roomID string) {
	roomStoreMu.Lock()
	delete(memRooms, roomID)
	roomStoreMu.Unlock()

	if RedisReady && RDB != nil {
		_ = RDB.Del(Ctx, "room:"+roomID).Err()
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
