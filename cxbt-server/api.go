package main

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine) {
	api := r.Group("/api")

	api.POST("/auth/register", RegisterHandler)
	api.POST("/auth/login", LoginHandler)
	api.GET("/flush", func(c *gin.Context) {
		FlushStore()
		c.JSON(http.StatusOK, gin.H{"status": "flushed"})
	})

	protected := api.Group("/")
	protected.Use(AuthMiddleware())
	{
		// Character routes
		protected.GET("/character", getCharacterHandler)
		protected.POST("/character", saveCharacterHandler)
		protected.POST("/character/recharge", RechargeHandler)
		protected.POST("/character/online-reward", OnlineRewardHandler)

		// Room & Battle routes
		protected.GET("/rooms", getRoomsHandler)
		protected.POST("/rooms", createRoomHandler)
		protected.PUT("/rooms/:id", UpdateRoomHandler)
		protected.POST("/rooms/:id/team", SwitchTeamHandler)
		protected.POST("/rooms/quickmatch", QuickMatchHandler)
		protected.POST("/rooms/:id/join", JoinRoomHandler)
		protected.POST("/rooms/:id/leave", LeaveRoomHandler)
		protected.POST("/rooms/:id/start", StartGameHandler)
		protected.POST("/rooms/:id/invite", InviteRoomHandler)
		protected.POST("/battle/settle", SettleBattleHandler)

		// Social, Economy & Progression routes (MySQL 8)
		protected.GET("/friends", GetFriendsHandler)
		protected.POST("/friends", AddFriendHandler)
		protected.DELETE("/friends/:id", DeleteFriendHandler)

		protected.GET("/guilds", GetGuildsHandler)
		protected.POST("/guilds", CreateGuildHandler)
		protected.POST("/guilds/:id/join", JoinGuildHandler)
		protected.POST("/guilds/leave", LeaveGuildHandler)

		protected.GET("/mail", GetMailHandler)
		protected.POST("/mail/send", SendMailHandler)
		protected.POST("/mail/:id/read", ReadMailHandler)
		protected.POST("/mail/:id/claim", ClaimMailHandler)

		protected.GET("/missions", GetMissionsHandler)
		protected.POST("/missions/:id/claim", ClaimMissionHandler)

		protected.GET("/enhance", GetEnhancementsHandler)
		protected.POST("/enhance", EnhanceItemHandler)

		protected.GET("/inventory", GetInventoryHandler)
		protected.POST("/shop/buy", BuyItemHandler)

		protected.GET("/auction", GetAuctionHandler)
		protected.POST("/auction/list", CreateAuctionHandler)
		protected.POST("/auction/:id/buy", BuyAuctionHandler)

		protected.GET("/leaderboard", GetLeaderboardHandler)
		protected.POST("/signin", SignInHandler)
		protected.GET("/matches", GetMatchesHandler)
		protected.GET("/chat/history", GetChatHistoryHandler)
		protected.POST("/chat/send", SendChatMessageHandler)
	}
}


func getCharacterHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)

	var char SavedCharacter
	if err := DB.Unscoped().Where("user_id = ?", userID).First(&char).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "character not found"})
		return
	}
	if char.Level <= 0 {
		char.Level = 1
	}
	if char.Power <= 0 {
		char.Power = 1500 + char.Level*150
	}

	c.JSON(http.StatusOK, char)
}

func saveCharacterHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)

	var req SavedCharacter
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var existing SavedCharacter
	err := DB.Unscoped().Where("user_id = ?", userID).First(&existing).Error
	if err == nil {
		existing.DeletedAt.Valid = false
		if req.Name != "" {
			existing.Name = req.Name
		}
		if req.JobID != "" {
			existing.JobID = req.JobID
		}
		existing.Appearance = req.Appearance
		if req.EquippedWeapons != "" {
			existing.EquippedWeapons = req.EquippedWeapons
		}
		if req.ActiveWing != "" {
			existing.ActiveWing = req.ActiveWing
		}
		if req.ActivePet != "" {
			existing.ActivePet = req.ActivePet
		}
		if req.QuickbarJSON != "" {
			existing.QuickbarJSON = req.QuickbarJSON
		}
		if existing.Level <= 0 {
			existing.Level = 1
		}
		if existing.Coins <= 1000 {
			existing.Coins = 100000
		}
		if existing.Cash <= 0 {
			existing.Cash = 5000
		}
		if existing.Gems <= 0 {
			existing.Gems = 200
		}
		if existing.Power <= 0 {
			existing.Power = 1500
		}
		if existing.LuckDrawStamina <= 0 {
			existing.LuckDrawStamina = 100
		}
		if err := DB.Unscoped().Save(&existing).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, existing)
	} else {
		req.UserID = userID
		req.Version = 1
		if req.Level <= 0 {
			req.Level = 1
		}
		if req.Coins <= 0 {
			req.Coins = 100000
		}
		if req.Cash <= 0 {
			req.Cash = 5000
		}
		if req.Gems <= 0 {
			req.Gems = 200
		}
		if req.Rating <= 0 {
			req.Rating = 1200
		}
		if req.Power <= 0 {
			req.Power = 1500
		}
		if req.LuckDrawStamina <= 0 {
			req.LuckDrawStamina = 100
		}
		if err := DB.Create(&req).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, req)
	}
}

func getRoomsHandler(c *gin.Context) {
	if val, exists := c.Get("userId"); exists {
		if uid, ok := val.(uint); ok && uid > 0 {
			TouchPlayerActivity(uid)
		}
	}
	rooms := GetAllRoomsFromStore()
	c.JSON(http.StatusOK, rooms)
}

func createRoomHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	TouchPlayerActivity(userID)

	var req struct {
		RoomConfig
		WeaponIds []string `json:"weaponIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	config := req.RoomConfig
	config.ID = fmt.Sprintf("room-%d", userID)
	config.HostID = userID
	config.State = "Waiting"

	// Remove player from any other rooms before creating this room
	RemovePlayerFromAllOtherRooms(userID, config.ID)

	var char SavedCharacter
	DB.Where("user_id = ?", userID).First(&char)
	username := char.Name
	if username == "" {
		username = fmt.Sprintf("Player%d", userID)
	}
	level := char.Level
	if level <= 0 {
		level = 1
	}
	config.HostName = username

	config.Players = make(map[uint]RoomPlayer)
	config.Players[userID] = RoomPlayer{
		UserID:     userID,
		Username:   username,
		Level:      level,
		Team:       "red",
		Ready:      false,
		JobID:      char.JobID,
		Appearance: char.Appearance,
		WeaponIds:  req.WeaponIds,
	}

	SaveRoomToStore(config)
	c.JSON(http.StatusOK, config)
}

