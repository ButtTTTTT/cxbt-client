package main

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	playerActivityMu sync.RWMutex
	playerLastSeen   = make(map[uint]int64)
	reaperOnce       sync.Once
)

func TouchPlayerActivity(userID uint) {
	if userID == 0 {
		return
	}
	now := time.Now().Unix()
	playerActivityMu.Lock()
	playerLastSeen[userID] = now
	playerActivityMu.Unlock()

	reaperOnce.Do(func() {
		go runRoomReaperLoop()
	})
}

func IsPlayerRecentlyActive(userID uint, maxIdleSec int64) bool {
	playerActivityMu.RLock()
	last, ok := playerLastSeen[userID]
	playerActivityMu.RUnlock()
	if !ok {
		return false
	}
	return (time.Now().Unix() - last) <= maxIdleSec
}

func RemovePlayerFromRoomAndCleanup(roomID string, userID uint) {
	if roomID == "" || userID == 0 {
		return
	}
	room, ok := GetRoomFromStore(roomID)
	if !ok {
		DeleteGameFromStore(roomID)
		StopGameLoop(roomID)
		return
	}

	if _, inRoom := room.Players[userID]; !inRoom {
		if len(room.Players) == 0 {
			DeleteRoomFromStore(roomID)
			DeleteGameFromStore(roomID)
			StopGameLoop(roomID)
		}
		return
	}

	delete(room.Players, userID)
	RemoveVoiceParticipant(roomID, fmt.Sprintf("%d", userID))

	if state, gOk := GetGameFromStore(roomID); gOk {
		delete(state.Players, userID)
		if len(state.Players) == 0 || len(room.Players) == 0 {
			DeleteGameFromStore(roomID)
			StopGameLoop(roomID)
		} else {
			SaveGameToStore(roomID, state)
		}
	}

	if len(room.Players) == 0 {
		DeleteRoomFromStore(roomID)
		DeleteGameFromStore(roomID)
		StopGameLoop(roomID)
		PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
			"type":   "room_closed",
			"roomId": roomID,
		})
		return
	}

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

func RemovePlayerFromAllOtherRooms(userID uint, keepRoomID string) {
	if userID == 0 {
		return
	}
	rooms := GetAllRoomsFromStore()
	for _, r := range rooms {
		if r.ID == keepRoomID {
			continue
		}
		if _, exists := r.Players[userID]; exists {
			RemovePlayerFromRoomAndCleanup(r.ID, userID)
		}
	}
}

func runRoomReaperLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		rooms := GetAllRoomsFromStore()
		for _, r := range rooms {
			if len(r.Players) == 0 {
				DeleteRoomFromStore(r.ID)
				DeleteGameFromStore(r.ID)
				StopGameLoop(r.ID)
				continue
			}
			activeSubs := GetRoomSubCount(r.ID)
			for uid, p := range r.Players {
				uidStr := fmt.Sprintf("%d", uid)
				if GetActiveWSCount(r.ID, uidStr) > 0 || (p.Username != "" && GetActiveWSCount(r.ID, p.Username) > 0) {
					TouchPlayerActivity(uid)
					continue
				}
				// While battle is actively in progress and room channel has connected peers, give a generous grace window
				var idleLimitSec int64 = 35
				if r.State == "Playing" || activeSubs > 0 {
					idleLimitSec = 180
				}
				if !IsPlayerRecentlyActive(uid, idleLimitSec) {
					RemovePlayerFromRoomAndCleanup(r.ID, uid)
				}
			}
		}
	}
}

func QuickMatchHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	TouchPlayerActivity(userID)

	var req struct {
		ModeID    string   `json:"modeId"`
		ModeName  string   `json:"modeName"`
		MapID     string   `json:"mapId"`
		MapName   string   `json:"mapName"`
		WeaponIds []string `json:"weaponIds"`
	}
	_ = c.ShouldBindJSON(&req)

	char, _ := GetCachedCharacter(userID)
	username := char.Name
	if username == "" {
		username = fmt.Sprintf("Player%d", userID)
	}
	level := char.Level
	if level <= 0 {
		level = 1
	}

	// 1. Look for available rooms with space
	rooms := GetAllRoomsFromStore()
	for _, room := range rooms {
		if len(room.Players) < room.MaxPlayers && room.Password == "" {
			if req.ModeID != "" && room.ModeID != req.ModeID {
				continue
			}
			RemovePlayerFromAllOtherRooms(userID, room.ID)
			if room.Players == nil {
				room.Players = make(map[uint]RoomPlayer)
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
			team := "red"
			if blues < reds {
				team = "blue"
			}
			room.Players[userID] = RoomPlayer{
				UserID:     userID,
				Username:   username,
				Level:      level,
				Team:       team,
				Ready:      true,
				JobID:      char.JobID,
				Appearance: char.Appearance,
				WeaponIds:  req.WeaponIds,
			}
			SaveRoomToStore(room)
			EnsurePlayerInGameState(room.ID, userID, team)
			PublishChannelJSON("room_channel:"+room.ID, map[string]interface{}{
				"type":       "join",
				"userId":     userID,
				"username":   username,
				"level":      level,
				"team":       team,
				"jobId":      char.JobID,
				"appearance": char.Appearance,
				"weaponIds":  req.WeaponIds,
				"room":       room,
			})
			c.JSON(http.StatusOK, gin.H{"roomId": room.ID, "room": room, "message": "已匹配进入房间"})
			return
		}
	}

	// 2. If no matching room exists, create one for this player
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
		mapName = "夺宝大厅"
	}

	newRoomID := fmt.Sprintf("room-%d", userID)
	RemovePlayerFromAllOtherRooms(userID, newRoomID)

	newRoom := RoomConfig{
		ID:           newRoomID,
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
				Ready:      true,
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
	TouchPlayerActivity(userID)
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

	if room.Password != "" && room.Password != req.Password {
		c.JSON(http.StatusForbidden, gin.H{"error": "Invalid password"})
		return
	}
	if _, alreadyIn := room.Players[userID]; !alreadyIn && len(room.Players) >= room.MaxPlayers {
		c.JSON(http.StatusForbidden, gin.H{"error": "Room is full"})
		return
	}

	RemovePlayerFromAllOtherRooms(userID, roomID)

	char, _ := GetCachedCharacter(userID)
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
	if blues < reds {
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
		Ready:      true,
		JobID:      char.JobID,
		Appearance: char.Appearance,
		WeaponIds:  req.WeaponIds,
	}

	SaveRoomToStore(room)
	if room.State == "Playing" {
		EnsurePlayerInGameState(roomID, userID, assignedTeam)
	}
	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":       "join",
		"userId":     userID,
		"username":   username,
		"level":      level,
		"team":       assignedTeam,
		"jobId":      char.JobID,
		"appearance": char.Appearance,
		"weaponIds":  req.WeaponIds,
		"room":       room,
	})

	c.JSON(http.StatusOK, room)
}

func UpdateRoomHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	TouchPlayerActivity(userID)
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
	TouchPlayerActivity(userID)
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

	if state, gOk := GetGameFromStore(roomID); gOk {
		if ps, pOk := state.Players[userID]; pOk && ps != nil {
			ps.Team = req.Team
			SaveGameToStore(roomID, state)
		}
	}

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":   "room_update",
		"userId": userID,
		"team":   req.Team,
		"room":   room,
	})

	c.JSON(http.StatusOK, room)
}

func ReadyRoomHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	TouchPlayerActivity(userID)
	roomID := c.Param("id")

	var req struct {
		Ready *bool `json:"ready"`
	}
	_ = c.ShouldBindJSON(&req)

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

	if req.Ready != nil {
		player.Ready = *req.Ready
	} else {
		player.Ready = !player.Ready
	}
	room.Players[userID] = player
	SaveRoomToStore(room)

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":   "room_update",
		"userId": userID,
		"ready":  player.Ready,
		"room":   room,
	})

	c.JSON(http.StatusOK, room)
}

func KickRoomPlayerHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	TouchPlayerActivity(userID)
	roomID := c.Param("id")

	var req struct {
		TargetID     uint   `json:"targetId"`
		TargetUserID uint   `json:"targetUserId"`
		Username     string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	room, ok := GetRoomFromStore(roomID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	if room.HostID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "只有房主可以踢出玩家"})
		return
	}

	targetUID := req.TargetID
	if targetUID == 0 {
		targetUID = req.TargetUserID
	}
	if targetUID == 0 && req.Username != "" {
		for id, p := range room.Players {
			if p.Username == req.Username {
				targetUID = id
				break
			}
		}
	}
	if targetUID == 0 || targetUID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid target player"})
		return
	}

	targetPlayer := room.Players[targetUID]
	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":         "kicked",
		"targetId":     targetUID,
		"targetUserId": targetUID,
		"targetName":   targetPlayer.Username,
		"byHost":       room.HostName,
	})
	RemovePlayerFromRoomAndCleanup(roomID, targetUID)

	updatedRoom, _ := GetRoomFromStore(roomID)
	c.JSON(http.StatusOK, updatedRoom)
}

func WatchRoomHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	TouchPlayerActivity(userID)
	roomID := c.Param("id")

	room, ok := GetRoomFromStore(roomID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	room.WatchCount++
	SaveRoomToStore(room)
	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type": "room_update",
		"room": room,
	})

	c.JSON(http.StatusOK, room)
}

func LeaveRoomHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	roomID := c.Param("id")

	RemovePlayerFromRoomAndCleanup(roomID, userID)
	c.JSON(http.StatusOK, gin.H{"status": "left"})
}

func StartGameHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	TouchPlayerActivity(userID)
	roomID := c.Param("id")

	room, ok := GetRoomFromStore(roomID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// 严格校验房主权限：只有当前房间房主 (room.HostID == userID) 才能发起开始游戏
	if room.HostID != userID {
		// 如果房主已经开始了游戏，允许房间内其他成员同步拉取已开局房间状态进入战场
		if room.State == "Playing" {
			if p, inRoom := room.Players[userID]; inRoom {
				EnsurePlayerInGameState(roomID, userID, p.Team)
			}
			c.JSON(http.StatusOK, gin.H{"status": "started", "room": room})
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "只有房主才能开始游戏"})
		return
	}

	room.State = "Playing"
	if room.MapID == "" || room.MapID == "random" {
		room.MapID = "level1"
		if room.MapName == "" || room.MapName == "随机地图" {
			room.MapName = "夺宝大厅"
		}
	}

	state := GameState{
		RoomID:    roomID,
		ScoreRed:  0,
		ScoreBlue: 0,
		StartTime: time.Now(),
		Duration:  10 * time.Minute,
		Players:   make(map[uint]*PlayerState),
	}
	for id, p := range room.Players {
		TouchPlayerActivity(id)
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
		"room": room,
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

	// Remove player from room when they finish & exit battle; if room is now empty, it closes automatically
	if req.RoomID != "" && req.RoomID != "practice" {
		RemovePlayerFromRoomAndCleanup(req.RoomID, userID)
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
	SetCachedCharacter(char)

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
