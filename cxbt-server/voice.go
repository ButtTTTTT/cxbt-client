package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type VoiceParticipant struct {
	UserID      string  `json:"userId"`
	Username    string  `json:"username"`
	Team        string  `json:"team"`
	RoomID      string  `json:"roomId"`
	MicEnabled  bool    `json:"micEnabled"`
	Deafened    bool    `json:"deafened"`
	Speaking    bool    `json:"speaking"`
	Volume      float64 `json:"volume"`
	Mode        string  `json:"mode"`        // "ptt" (按住说话) or "free" (自由麦)
	ChannelMode string  `json:"channelMode"` // "all" (全房语音) or "team" (队内语音)
	UpdatedAt   int64   `json:"updatedAt"`
}

var (
	voiceMu    sync.RWMutex
	voiceRooms = make(map[string]map[string]*VoiceParticipant) // roomKey -> userId -> participant

	reportCooldownMu sync.Mutex
	reportLastTime   = make(map[string]time.Time)
)

func normalizeVoiceRoomKey(roomID string) string {
	if roomID == "" {
		return "global"
	}
	return roomID
}

func UpsertVoiceParticipant(p VoiceParticipant) []*VoiceParticipant {
	roomKey := normalizeVoiceRoomKey(p.RoomID)
	p.RoomID = roomKey
	p.UpdatedAt = time.Now().UnixMilli()
	if p.Mode == "" {
		p.Mode = "ptt"
	}
	if p.ChannelMode == "" {
		p.ChannelMode = "all"
	}

	voiceMu.Lock()
	if voiceRooms[roomKey] == nil {
		voiceRooms[roomKey] = make(map[string]*VoiceParticipant)
	}
	cp := p
	voiceRooms[roomKey][p.UserID] = &cp
	list := make([]*VoiceParticipant, 0, len(voiceRooms[roomKey]))
	for _, item := range voiceRooms[roomKey] {
		list = append(list, item)
	}
	voiceMu.Unlock()
	return list
}

func RemoveVoiceParticipant(roomID, userID string) []*VoiceParticipant {
	if userID == "" {
		return nil
	}
	roomKey := normalizeVoiceRoomKey(roomID)
	voiceMu.Lock()
	if roomMap, ok := voiceRooms[roomKey]; ok {
		delete(roomMap, userID)
		if len(roomMap) == 0 {
			delete(voiceRooms, roomKey)
			voiceMu.Unlock()
			return []*VoiceParticipant{}
		}
		list := make([]*VoiceParticipant, 0, len(roomMap))
		for _, item := range roomMap {
			list = append(list, item)
		}
		voiceMu.Unlock()
		return list
	}
	voiceMu.Unlock()
	return []*VoiceParticipant{}
}

func GetVoiceParticipants(roomID string) []*VoiceParticipant {
	roomKey := normalizeVoiceRoomKey(roomID)
	voiceMu.RLock()
	defer voiceMu.RUnlock()
	roomMap := voiceRooms[roomKey]
	if roomMap == nil {
		return []*VoiceParticipant{}
	}
	list := make([]*VoiceParticipant, 0, len(roomMap))
	for _, item := range roomMap {
		list = append(list, item)
	}
	return list
}

// HandleWsVoiceMessage processes real-time voice signaling, state, and audio chunks over WebSocket
func HandleWsVoiceMessage(c *Client, msgType string, gameMsg map[string]interface{}, rawMessage []byte) bool {
	switch msgType {
	case "voice_join", "voice_state":
		userID, _ := gameMsg["userId"].(string)
		if userID == "" {
			if uidNum, ok := gameMsg["userId"].(float64); ok {
				userID = fmt.Sprintf("%.0f", uidNum)
			} else {
				userID = c.ID
			}
		}
		if userID == "" {
			userID = "guest"
		}
		username, _ := gameMsg["username"].(string)
		if username == "" {
			username = "战士#" + userID
		}
		team, _ := gameMsg["team"].(string)
		if team == "" {
			team = "red"
		}
		micEnabled, _ := gameMsg["micEnabled"].(bool)
		deafened, _ := gameMsg["deafened"].(bool)
		speaking, _ := gameMsg["speaking"].(bool)
		volume, _ := gameMsg["volume"].(float64)
		mode, _ := gameMsg["mode"].(string)
		channelMode, _ := gameMsg["channelMode"].(string)

		roster := UpsertVoiceParticipant(VoiceParticipant{
			UserID:      userID,
			Username:    username,
			Team:        team,
			RoomID:      c.RoomID,
			MicEnabled:  micEnabled,
			Deafened:    deafened,
			Speaking:    speaking,
			Volume:      volume,
			Mode:        mode,
			ChannelMode: channelMode,
		})

		PublishChannelJSON(c.Channel, map[string]interface{}{
			"type":         "voice_state",
			"userId":       userID,
			"username":     username,
			"team":         team,
			"roomId":       normalizeVoiceRoomKey(c.RoomID),
			"micEnabled":   micEnabled,
			"deafened":     deafened,
			"speaking":     speaking,
			"volume":       volume,
			"mode":         mode,
			"channelMode":  channelMode,
			"participants": roster,
			"timestamp":    time.Now().UnixMilli(),
		})
		return true

	case "voice_leave":
		userID, _ := gameMsg["userId"].(string)
		if userID == "" {
			userID = c.ID
		}
		roster := RemoveVoiceParticipant(c.RoomID, userID)
		PublishChannelJSON(c.Channel, map[string]interface{}{
			"type":         "voice_leave",
			"userId":       userID,
			"roomId":       normalizeVoiceRoomKey(c.RoomID),
			"participants": roster,
			"timestamp":    time.Now().UnixMilli(),
		})
		return true

	case "voice_webrtc_signal":
		// Relay WebRTC SDP offer/answer/ICE candidates to target peer or room
		targetUserID, _ := gameMsg["targetUserId"].(string)
		wsHubMu.RLock()
		subs := wsHubSubs[c.Channel]
		for peer := range subs {
			if peer == c {
				continue
			}
			if targetUserID != "" && peer.ID != "" && peer.ID != targetUserID {
				continue
			}
			select {
			case peer.Send <- rawMessage:
			default:
			}
		}
		wsHubMu.RUnlock()
		return true

	case "voice_audio_chunk":
		// Real-time PCM16 / Opus voice audio relay across room peers (with optional server loopback for self-test)
		loopback, _ := gameMsg["loopback"].(bool)
		wsHubMu.RLock()
		subs := wsHubSubs[c.Channel]
		for peer := range subs {
			if peer == c && !loopback {
				continue
			}
			select {
			case peer.Send <- rawMessage:
			default:
			}
		}
		wsHubMu.RUnlock()
		return true

	case "vote_kick":
		// Ported 1:1 from scripts/voteKick.lua
		PublishChannel(c.Channel, rawMessage)
		return true
	}

	return false
}

func RegisterVoiceAndLuaRoutes(r *gin.Engine) {
	// Dedicated voice WebSocket endpoint alias
	r.GET("/ws/voice", ServeWs)

	api := r.Group("/api")

	// Live room voice roster query
	api.GET("/voice/room/:roomId", func(c *gin.Context) {
		roomID := c.Param("roomId")
		participants := GetVoiceParticipants(roomID)
		speakingCount := 0
		for _, p := range participants {
			if p.Speaking && p.MicEnabled {
				speakingCount++
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"roomId":        normalizeVoiceRoomKey(roomID),
			"participants":  participants,
			"totalCount":    len(participants),
			"speakingCount": speakingCount,
			"status":        "online",
		})
	})

	// Update voice state via HTTP REST
	api.POST("/voice/state", func(c *gin.Context) {
		var req VoiceParticipant
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.UserID == "" {
			req.UserID = "guest"
		}
		roster := UpsertVoiceParticipant(req)
		channel := "global_channel"
		if req.RoomID != "" && req.RoomID != "global" {
			channel = "room_channel:" + req.RoomID
		}
		PublishChannelJSON(channel, map[string]interface{}{
			"type":         "voice_state",
			"userId":       req.UserID,
			"username":     req.Username,
			"team":         req.Team,
			"roomId":       normalizeVoiceRoomKey(req.RoomID),
			"micEnabled":   req.MicEnabled,
			"deafened":     req.Deafened,
			"speaking":     req.Speaking,
			"volume":      req.Volume,
			"mode":         req.Mode,
			"channelMode":  req.ChannelMode,
			"participants": roster,
			"timestamp":    time.Now().UnixMilli(),
		})
		c.JSON(http.StatusOK, gin.H{
			"status":       "ok",
			"participants": roster,
		})
	})

	// Ported 1:1 from AvatarStar_cache/scripts/voteKick.lua: VoteKickByCid & rpc.safecall("player_report")
	api.POST("/battle/vote-kick", func(c *gin.Context) {
		var req struct {
			RoomID       string `json:"roomId"`
			Initiator    string `json:"initiator"`
			TargetID     string `json:"targetId"`
			TargetName   string `json:"targetName"`
			Reason       string `json:"reason"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.Reason == "" {
			req.Reason = "挂机/消极比赛"
		}
		if DB != nil {
			_ = DB.Create(&VoteKickRecord{
				RoomID:     req.RoomID,
				Initiator:  req.Initiator,
				TargetID:   req.TargetID,
				TargetName: req.TargetName,
				Reason:     req.Reason,
			}).Error
		}
		channel := "global_channel"
		if req.RoomID != "" {
			channel = "room_channel:" + req.RoomID
		}
		payload, _ := json.Marshal(map[string]interface{}{
			"type":       "vote_kick",
			"roomId":     req.RoomID,
			"initiator":  req.Initiator,
			"targetId":   req.TargetID,
			"targetName": req.TargetName,
			"reason":     req.Reason,
			"timestamp":  time.Now().UnixMilli(),
		})
		PublishChannel(channel, payload)
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"message": fmt.Sprintf("已发起对【%s】的投票踢人（原因：%s），等待队友表决", req.TargetName, req.Reason),
		})
	})

	api.POST("/battle/report", func(c *gin.Context) {
		var req struct {
			ReporterID string `json:"reporterId"`
			TargetID   string `json:"targetId"`
			TargetName string `json:"targetName"`
			ReasonType int    `json:"type"` // 1: 外挂作弊 (UI_inGame_jubao_waigua), 0: 卡BUG (UI_inGame_jubao_kabug)
			Content    string `json:"content"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		key := req.ReporterID
		if key == "" {
			key = c.ClientIP()
		}
		// 15s cooldown check matching voteKick.lua: GetMatchedUTF8Text("msgbox_common_jubao_guoyupinfan," .. 15)
		reportCooldownMu.Lock()
		last, exists := reportLastTime[key]
		if exists && time.Since(last) < 15*time.Second {
			left := int(15 - time.Since(last).Seconds())
			reportCooldownMu.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":  fmt.Sprintf("举报过于频繁，请等待 %d 秒后再试", left),
				"cdLeft": left,
			})
			return
		}
		reportLastTime[key] = time.Now()
		reportCooldownMu.Unlock()

		reasonLabel := "利用地图/卡BUG (UI_inGame_jubao_kabug)"
		if req.ReasonType == 1 {
			reasonLabel = "疑似使用外挂 (UI_inGame_jubao_waigua)"
		}
		if DB != nil {
			_ = DB.Create(&PlayerReport{
				ReporterID:  key,
				TargetID:    req.TargetID,
				TargetName:  req.TargetName,
				ReasonType:  req.ReasonType,
				ReasonLabel: reasonLabel,
				Content:     req.Content,
			}).Error
		}
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"message": fmt.Sprintf("举报已提交至战星反作弊系统：目标【%s】，类型【%s】", req.TargetName, reasonLabel),
		})
	})

	// Ported 1:1 from AvatarStar_cache/scripts/resposeQuestion.lua
	api.POST("/battle/feedback", func(c *gin.Context) {
		var req struct {
			UserID  string `json:"userId"`
			Title   string `json:"title"`
			Content string `json:"content"`
		}
		_ = c.ShouldBindJSON(&req)
		if DB != nil {
			_ = DB.Create(&PlayerFeedback{
				UserID:  req.UserID,
				Title:   req.Title,
				Content: req.Content,
			}).Error
		}
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"message": "感谢您的宝贵建议，创想兵团研发组已收到您的反馈！",
		})
	})
}
