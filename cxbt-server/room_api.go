package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func QuickMatchHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)

	var req struct {
		ModeID    string   `json:"modeId"`
		ModeName  string   `json:"modeName"`
		MapID     string   `json:"mapId"`
		MapName   string   `json:"mapName"`
		WeaponIds []string `json:"weaponIds"`
	}
	_ = c.ShouldBindJSON(&req)

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

	// 1. Look for waiting rooms
	rooms := GetAllRoomsFromStore()
	for _, room := range rooms {
		if room.State == "Waiting" && len(room.Players) < room.MaxPlayers && room.Password == "" {
			if req.ModeID != "" && room.ModeID != req.ModeID {
				continue
			}
			if room.Players == nil {
				room.Players = make(map[uint]RoomPlayer)
			}
			reds, blues := 0, 0
			for _, p := range room.Players {
				if p.Team == "red" {
					reds++
				} else {
					blues++
				}
			}
			team := "red"
			if blues < reds && room.BalanceTeams {
				team = "blue"
			}
			room.Players[userID] = RoomPlayer{
				UserID:     userID,
				Username:   username,
				Level:      level,
				Team:       team,
				Ready:      false,
				JobID:      char.JobID,
				Appearance: char.Appearance,
				WeaponIds:  req.WeaponIds,
			}
			SaveRoomToStore(room)
			PublishChannelJSON("room_channel:"+room.ID, map[string]interface{}{
				"type":   "join",
				"userId": userID,
				"room":   room,
			})
			c.JSON(http.StatusOK, gin.H{"roomId": room.ID, "room": room, "message": "已匹配进入房间"})
			return
		}
	}

	// 2. If no waiting room exists, auto-create one so QuickMatch always succeeds
	modeID := req.ModeID
	if modeID == "" {
		modeID = "team"
	}
	modeName := req.ModeName
	if modeName == "" {
		modeName = "团队"
	}
	mapID := req.MapID
	if mapID == "" {
		mapID = "level1"
	}
	mapName := req.MapName
	if mapName == "" {
		mapName = "训练场"
	}

	newRoom := RoomConfig{
		ID:           fmt.Sprintf("room-%d", userID),
		Name:         fmt.Sprintf("%s的战局", username),
		Password:     "",
		MaxPlayers:   16,
		BalanceTeams: true,
		ModeID:       modeID,
		ModeName:     modeName,
		MapID:        mapID,
		MapName:      mapName,
		HostID:       userID,
		HostName:     username,
		State:        "Waiting",
		Players: map[uint]RoomPlayer{
			userID: {
				UserID:     userID,
				Username:   username,
				Level:      level,
				Team:       "red",
				Ready:      false,
				JobID:      char.JobID,
				Appearance: char.Appearance,
				WeaponIds:  req.WeaponIds,
			},
		},
	}

	SaveRoomToStore(newRoom)
	c.JSON(http.StatusOK, gin.H{"roomId": newRoom.ID, "room": newRoom, "message": "已为您创建快速匹配战局"})
}

func JoinRoomHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	roomID := c.Param("id")

	var req struct {
		Password  string   `json:"password"`
		WeaponIds []string `json:"weaponIds"`
	}
	_ = c.ShouldBindJSON(&req)

	room, ok := GetRoomFromStore(roomID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.State != "Waiting" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Game already started"})
		return
	}
	if room.Password != "" && room.Password != req.Password {
		c.JSON(http.StatusForbidden, gin.H{"error": "Invalid password"})
		return
	}
	if _, alreadyIn := room.Players[userID]; !alreadyIn && len(room.Players) >= room.MaxPlayers {
		c.JSON(http.StatusForbidden, gin.H{"error": "Room is full"})
		return
	}

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

	reds, blues := 0, 0
	for id, p := range room.Players {
		if id == userID {
			continue
		}
		if p.Team == "red" {
			reds++
		} else {
			blues++
		}
	}
	assignedTeam := "red"
	if blues < reds && room.BalanceTeams {
		assignedTeam = "blue"
	}

	if room.Players == nil {
		room.Players = make(map[uint]RoomPlayer)
	}
	room.Players[userID] = RoomPlayer{
		UserID:     userID,
		Username:   username,
		Level:      level,
		Team:       assignedTeam,
		Ready:      false,
		JobID:      char.JobID,
		Appearance: char.Appearance,
		WeaponIds:  req.WeaponIds,
	}

	SaveRoomToStore(room)
	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":   "join",
		"userId": userID,
		"room":   room,
	})

	c.JSON(http.StatusOK, room)
}

func UpdateRoomHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	roomID := c.Param("id")

	room, ok := GetRoomFromStore(roomID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	if room.HostID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can update room settings"})
		return
	}

	var req RoomConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		room.Name = req.Name
	}
	room.Password = req.Password
	if req.MaxPlayers > 0 {
		room.MaxPlayers = req.MaxPlayers
	}
	room.BalanceTeams = req.BalanceTeams
	if req.ModeID != "" {
		room.ModeID = req.ModeID
	}
	if req.ModeName != "" {
		room.ModeName = req.ModeName
	}
	if req.MapID != "" {
		room.MapID = req.MapID
	}
	if req.MapName != "" {
		room.MapName = req.MapName
	}

	SaveRoomToStore(room)
	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type": "room_update",
		"room": room,
	})

	c.JSON(http.StatusOK, room)
}

func SwitchTeamHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	roomID := c.Param("id")

	var req struct {
		Team string `json:"team"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || (req.Team != "red" && req.Team != "blue") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid team"})
		return
	}

	room, ok := GetRoomFromStore(roomID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	player, exists := room.Players[userID]
	if !exists {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not in room"})
		return
	}

	player.Team = req.Team
	room.Players[userID] = player
	SaveRoomToStore(room)

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":   "room_update",
		"userId": userID,
		"team":   req.Team,
		"room":   room,
	})

	c.JSON(http.StatusOK, room)
}

func LeaveRoomHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	roomID := c.Param("id")

	if room, ok := GetRoomFromStore(roomID); ok {
		delete(room.Players, userID)

		if len(room.Players) == 0 {
			DeleteRoomFromStore(roomID)
		} else {
			if room.HostID == userID {
				for id, p := range room.Players {
					room.HostID = id
					room.HostName = p.Username
					break
				}
			}
			SaveRoomToStore(room)
			PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
				"type":   "leave",
				"userId": userID,
				"room":   room,
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "left"})
}

func StartGameHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	roomID := c.Param("id")

	room, ok := GetRoomFromStore(roomID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID {
		if p, inRoom := room.Players[userID]; inRoom {
			room.HostID = userID
			room.HostName = p.Username
		} else {
			c.JSON(http.StatusForbidden, gin.H{"error": "Only host or room member can start"})
			return
		}
	}

	room.State = "Playing"

	state := GameState{
		RoomID:    roomID,
		ScoreRed:  0,
		ScoreBlue: 0,
		StartTime: time.Now(),
		Duration:  10 * time.Minute,
		Players:   make(map[uint]*PlayerState),
	}
	for id, p := range room.Players {
		state.Players[id] = &PlayerState{
			UserID:  id,
			Team:    p.Team,
			HP:      3201,
			MaxHP:   3201,
			Ammo:    30,
			IsAlive: true,
		}
	}

	SaveRoomToStore(room)
	SaveGameToStore(roomID, state)

	go StartGameLoop(roomID)

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type": "start_game",
	})
	c.JSON(http.StatusOK, gin.H{"status": "started", "room": room})
}

func InviteRoomHandler(c *gin.Context) {
	roomID := c.Param("id")
	userID := uint(0)
	if val, exists := c.Get("userId"); exists {
		userID = val.(uint)
	}

	senderName := fmt.Sprintf("玩家%d", userID)
	var char SavedCharacter
	if err := DB.Where("user_id = ?", userID).First(&char).Error; err == nil && char.Name != "" {
		senderName = char.Name
	}

	roomName := roomID
	if room, ok := GetRoomFromStore(roomID); ok && room.Name != "" {
		roomName = fmt.Sprintf("%s [ID: %s]", room.Name, roomID)
	}

	inviteText := fmt.Sprintf("玩家【%s】邀请大家加入房间 %s！赶快前往练习赛列表加入吧！", senderName, roomName)
	msg := map[string]interface{}{
		"type":    "invite",
		"userId":  "系统广播",
		"message": inviteText,
		"roomId":  roomID,
	}

	DB.Create(&ChatMessage{
		Channel: "global",
		Sender:  "系统广播",
		Message: inviteText,
		MsgType: "invite",
	})

	PublishChannelJSON("global_channel", msg)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": inviteText})
}

func SettleBattleHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)

	var req struct {
		RoomID   string `json:"roomId"`
		ModeName string `json:"modeName"`
		MapName  string `json:"mapName"`
		Kills    int    `json:"kills"`
		Deaths   int    `json:"deaths"`
		Victory  bool   `json:"victory"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// If room was playing and hosted by this user, reset room state to Waiting
	if req.RoomID != "" {
		if room, ok := GetRoomFromStore(req.RoomID); ok && room.HostID == userID {
			room.State = "Waiting"
			SaveRoomToStore(room)
			DeleteGameFromStore(req.RoomID)
		}
	}

	var char SavedCharacter
	if err := DB.Where("user_id = ?", userID).First(&char).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "character not found"})
		return
	}

	kills := req.Kills
	if kills < 0 {
		kills = 0
	}
	expGain := 100 + kills*25
	coinGain := 400 + kills*80
	ratingDelta := 10
	resultStr := "Victory"
	if !req.Victory && kills == 0 && req.Deaths > 0 {
		ratingDelta = -5
		resultStr = "Defeat"
	} else if req.Victory || kills > 0 {
		expGain += 100
		coinGain += 300
		ratingDelta = 20
	}

	char.Exp += expGain
	char.Coins += coinGain
	char.Rating += ratingDelta
	if char.Rating < 100 {
		char.Rating = 100
	}
	for char.Exp >= char.Level*100 {
		char.Exp -= char.Level * 100
		char.Level++
		char.Power += 150
	}
	DB.Save(&char)

	modeName := req.ModeName
	if modeName == "" {
		modeName = "练习赛"
	}
	mapName := req.MapName
	if mapName == "" {
		mapName = "训练场"
	}

	record := MatchRecord{
		UserID:      userID,
		Username:    char.Name,
		RoomID:      req.RoomID,
		ModeName:    modeName,
		MapName:     mapName,
		Result:      resultStr,
		Kills:       kills,
		Deaths:      req.Deaths,
		RewardCoins: coinGain,
		RewardExp:   expGain,
		RatingDelta: ratingDelta,
	}
	DB.Create(&record)

	advanceMissionProgress(userID, "daily_battle", 1)
	if kills > 0 {
		advanceMissionProgress(userID, "daily_kills", kills)
	}

	c.JSON(http.StatusOK, gin.H{
		"character":   char,
		"record":      record,
		"rewardCoins": coinGain,
		"rewardExp":   expGain,
		"ratingDelta": ratingDelta,
	})
}
