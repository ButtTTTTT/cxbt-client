package main

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"

	"gorm.io/gorm"
)

// --- User & Character (MySQL 8) ---
type User struct {
	gorm.Model
	Username string `gorm:"type:varchar(191);uniqueIndex;not null" json:"username"`
	Password string `gorm:"not null" json:"-"`
}

type Appearance struct {
	Gender    int `json:"gender"`
	Hair      int `json:"hair"`
	Eyes      int `json:"eyes"`
	Mouth     int `json:"mouth"`
	Accessory int `json:"accessory"`
}

func (a *Appearance) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, a)
	case string:
		return json.Unmarshal([]byte(v), a)
	default:
		return fmt.Errorf("type assertion failed: %T", value)
	}
}

func (a Appearance) Value() (driver.Value, error) {
	return json.Marshal(a)
}

type SavedCharacter struct {
	gorm.Model
	UserID           uint       `gorm:"uniqueIndex" json:"userId"`
	Version          int        `gorm:"default:1" json:"version"`
	Name             string     `gorm:"type:varchar(191);index;not null" json:"name"`
	JobID            string     `gorm:"type:varchar(64);default:'guardian'" json:"jobId"`
	Appearance       Appearance `gorm:"type:json" json:"appearance"`
	Level            int        `gorm:"default:1" json:"level"`
	Exp              int        `gorm:"default:0" json:"exp"`
	Coins            int        `gorm:"default:100000" json:"coins"`
	Cash             int        `gorm:"default:5000" json:"cash"`
	Gems             int        `gorm:"default:200" json:"gems"`
	Rating           int        `gorm:"default:1200" json:"rating"`
	Power            int        `gorm:"default:1500" json:"power"`
	SignInStreak     int        `gorm:"default:0" json:"signInStreak"`
	LastSignInDate   string     `gorm:"type:varchar(32)" json:"lastSignInDate"`
	OnlineClaimCount int        `gorm:"default:0" json:"onlineClaimCount"`
	EquippedWeapons  string     `gorm:"type:varchar(500)" json:"equippedWeapons"`
	ActiveWing       string     `gorm:"type:varchar(64)" json:"activeWing"`
	ActivePet        string     `gorm:"type:varchar(64)" json:"activePet"`
	QuickbarJSON     string     `gorm:"type:text" json:"quickbarJson"`
	LuckDrawPos      int        `gorm:"default:0" json:"luckDrawPos"`
	LuckDrawStamina  int        `gorm:"default:100" json:"luckDrawStamina"`
}

// --- Social, Economy & Progression Models (MySQL 8) ---
type Friend struct {
	gorm.Model
	UserID     uint   `gorm:"index" json:"userId"`
	FriendID   uint   `gorm:"index" json:"friendId"`
	FriendName string `gorm:"type:varchar(191)" json:"friendName"`
	Status     string `gorm:"type:varchar(32);default:'Accepted'" json:"status"` // "Pending", "Accepted"
}

type Guild struct {
	gorm.Model
	Name        string `gorm:"type:varchar(191);uniqueIndex" json:"name"`
	Notice      string `gorm:"type:varchar(500)" json:"notice"`
	Level       int    `gorm:"default:1" json:"level"`
	OwnerID     uint   `json:"ownerId"`
	OwnerName   string `gorm:"type:varchar(191)" json:"ownerName"`
	MemberCount int    `gorm:"default:1" json:"memberCount"`
}

type GuildMember struct {
	gorm.Model
	GuildID      uint   `gorm:"index" json:"guildId"`
	UserID       uint   `gorm:"uniqueIndex" json:"userId"`
	Username     string `gorm:"type:varchar(191)" json:"username"`
	Role         string `gorm:"type:varchar(32)" json:"role"` // "Member", "Admin", "Owner"
	Contribution int    `gorm:"default:100" json:"contribution"`
}

type Mail struct {
	gorm.Model
	ReceiverID  uint   `gorm:"index" json:"receiverId"`
	SenderID    uint   `json:"senderId"` // 0 if system mail
	SenderName  string `gorm:"type:varchar(191)" json:"senderName"`
	Title       string `gorm:"type:varchar(255)" json:"title"`
	Content     string `gorm:"type:text" json:"content"`
	IsRead      bool   `gorm:"default:false" json:"isRead"`
	IsClaimed   bool   `gorm:"default:false" json:"isClaimed"`
	RewardCoins int    `gorm:"default:0" json:"rewardCoins"`
	RewardGems  int    `gorm:"default:0" json:"rewardGems"`
	Attachment  string `gorm:"type:varchar(255)" json:"attachment"`
}

type Inventory struct {
	gorm.Model
	UserID       uint   `gorm:"index" json:"userId"`
	ItemID       string `gorm:"type:varchar(191)" json:"itemId"`
	ItemName     string `gorm:"type:varchar(191)" json:"itemName"`
	Category     string `gorm:"type:varchar(64)" json:"category"`
	Count        int    `gorm:"default:1" json:"count"`
	EnhanceLevel int    `gorm:"default:0" json:"enhanceLevel"`
}

type ItemEnhancement struct {
	gorm.Model
	UserID     uint   `gorm:"index" json:"userId"`
	SlotKey    string `gorm:"type:varchar(64)" json:"slotKey"`
	SlotName   string `gorm:"type:varchar(128)" json:"slotName"`
	Level      int    `gorm:"default:0" json:"level"`
	BonusPower int    `gorm:"default:0" json:"bonusPower"`
	BonusHP    int    `gorm:"default:0" json:"bonusHp"`
}

type PlayerMission struct {
	gorm.Model
	UserID      uint   `gorm:"index" json:"userId"`
	MissionCode string `gorm:"type:varchar(64)" json:"missionCode"`
	Title       string `gorm:"type:varchar(191)" json:"title"`
	Description string `gorm:"type:varchar(255)" json:"description"`
	Progress    int    `gorm:"default:0" json:"progress"`
	Target      int    `gorm:"default:1" json:"target"`
	RewardCoins int    `gorm:"default:5000" json:"rewardCoins"`
	RewardExp   int    `gorm:"default:200" json:"rewardExp"`
	RewardGems  int    `gorm:"default:20" json:"rewardGems"`
	Claimed     bool   `gorm:"default:false" json:"claimed"`
}

type AuctionListing struct {
	gorm.Model
	SellerID   uint   `gorm:"index" json:"sellerId"`
	SellerName string `gorm:"type:varchar(191)" json:"sellerName"`
	ItemID     string `gorm:"type:varchar(191)" json:"itemId"`
	ItemName   string `gorm:"type:varchar(191)" json:"itemName"`
	Category   string `gorm:"type:varchar(64)" json:"category"`
	PriceCoins int    `gorm:"default:1000" json:"priceCoins"`
	Status     string `gorm:"type:varchar(32);default:'Active'" json:"status"` // "Active", "Sold"
}

type MatchRecord struct {
	gorm.Model
	UserID      uint   `gorm:"index" json:"userId"`
	Username    string `gorm:"type:varchar(191)" json:"username"`
	RoomID      string `gorm:"type:varchar(64)" json:"roomId"`
	ModeName    string `gorm:"type:varchar(64)" json:"modeName"`
	MapName     string `gorm:"type:varchar(64)" json:"mapName"`
	Result      string `gorm:"type:varchar(32)" json:"result"` // "Victory", "Defeat", "Draw"
	Kills       int    `gorm:"default:0" json:"kills"`
	Deaths      int    `gorm:"default:0" json:"deaths"`
	RewardCoins int    `gorm:"default:0" json:"rewardCoins"`
	RewardExp   int    `gorm:"default:0" json:"rewardExp"`
	RatingDelta int    `gorm:"default:0" json:"ratingDelta"`
}

type ChatMessage struct {
	gorm.Model
	Channel string `gorm:"type:varchar(64);index" json:"channel"`
	Sender  string `gorm:"type:varchar(191)" json:"sender"`
	Message string `gorm:"type:varchar(500)" json:"message"`
	MsgType string `gorm:"type:varchar(32);default:'chat'" json:"type"`
}

// --- Room & Game ---
type RoomPlayer struct {
	UserID     uint       `json:"userId"`
	Username   string     `json:"username"`
	Level      int        `json:"level"`
	Team       string     `json:"team"` // "red" or "blue"
	Ready      bool       `json:"ready"`
	JobID      string     `json:"jobId"`
	Appearance Appearance `json:"appearance"`
	WeaponIds  []string   `json:"weaponIds"`
}

type RoomConfig struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	Password     string              `json:"password"`
	MaxPlayers   int                 `json:"maxPlayers"`
	BalanceTeams bool                `json:"balanceTeams"`
	ModeID       string              `json:"modeId"`
	ModeName     string              `json:"modeName"`
	MapID        string              `json:"mapId"`
	MapName      string              `json:"mapName"`
	HostID       uint                `json:"hostId"`
	HostName     string              `json:"hostName"`
	Players      map[uint]RoomPlayer `json:"players"` // mapping UserID -> Player
	State        string              `json:"state"`   // "Waiting", "Playing"
	WatchCount   int                 `json:"watchCount"`
	UpdatedAt    int64               `json:"updatedAt,omitempty"`
}

type BattleRoomRecord struct {
	gorm.Model
	RoomID       string `gorm:"type:varchar(128);uniqueIndex;not null" json:"roomId"`
	Name         string `gorm:"type:varchar(191)" json:"name"`
	Password     string `gorm:"type:varchar(128)" json:"password"`
	MaxPlayers   int    `gorm:"default:16" json:"maxPlayers"`
	BalanceTeams bool   `gorm:"default:true" json:"balanceTeams"`
	ModeID       string `gorm:"type:varchar(64)" json:"modeId"`
	ModeName     string `gorm:"type:varchar(64)" json:"modeName"`
	MapID        string `gorm:"type:varchar(64)" json:"mapId"`
	MapName      string `gorm:"type:varchar(128)" json:"mapName"`
	HostID       uint   `gorm:"index" json:"hostId"`
	HostName     string `gorm:"type:varchar(191)" json:"hostName"`
	State        string `gorm:"type:varchar(32);default:'Waiting'" json:"state"`
	PlayerCount  int    `gorm:"default:1" json:"playerCount"`
	PlayersJSON  string `gorm:"type:text" json:"playersJson"`
}

type PlayerReport struct {
	gorm.Model
	ReporterID  string `gorm:"type:varchar(64);index" json:"reporterId"`
	TargetID    string `gorm:"type:varchar(64);index" json:"targetId"`
	TargetName  string `gorm:"type:varchar(191)" json:"targetName"`
	ReasonType  int    `gorm:"default:0" json:"type"`
	ReasonLabel string `gorm:"type:varchar(191)" json:"reasonLabel"`
	Content     string `gorm:"type:varchar(500)" json:"content"`
}

type PlayerFeedback struct {
	gorm.Model
	UserID  string `gorm:"type:varchar(64);index" json:"userId"`
	Title   string `gorm:"type:varchar(255)" json:"title"`
	Content string `gorm:"type:text" json:"content"`
}

type VoteKickRecord struct {
	gorm.Model
	RoomID     string `gorm:"type:varchar(128);index" json:"roomId"`
	Initiator  string `gorm:"type:varchar(191)" json:"initiator"`
	TargetID   string `gorm:"type:varchar(64);index" json:"targetId"`
	TargetName string `gorm:"type:varchar(191)" json:"targetName"`
	Reason     string `gorm:"type:varchar(255)" json:"reason"`
}


