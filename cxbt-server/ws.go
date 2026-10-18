package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  65536,
	WriteBufferSize: 65536,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	ID            string
	UID           uint
	RoomID        string
	Channel       string
	Conn          *websocket.Conn
	Send          chan []byte
	Done          chan struct{}
	lastTouchUnix int64
}

var (
	wsHubMu        sync.RWMutex
	wsHubSubs      = make(map[string]map[*Client]struct{})
	wsRoomPlayerMu sync.RWMutex
	wsRoomPlayers  = make(map[string]map[string]int)
)

func GetActiveWSCount(roomID string, playerID string) int {
	if roomID == "" || playerID == "" {
		return 0
	}
	wsRoomPlayerMu.RLock()
	defer wsRoomPlayerMu.RUnlock()
	if m, ok := wsRoomPlayers[roomID]; ok {
		return m[playerID]
	}
	return 0
}

func GetRoomSubCount(roomID string) int {
	if roomID == "" {
		return 0
	}
	wsHubMu.RLock()
	defer wsHubMu.RUnlock()
	return len(wsHubSubs["room_channel:"+roomID])
}

func registerClientInHub(c *Client) {
	wsHubMu.Lock()
	if wsHubSubs[c.Channel] == nil {
		wsHubSubs[c.Channel] = make(map[*Client]struct{})
	}
	wsHubSubs[c.Channel][c] = struct{}{}
	wsHubMu.Unlock()

	if c.RoomID != "" && c.ID != "" {
		wsRoomPlayerMu.Lock()
		if wsRoomPlayers[c.RoomID] == nil {
			wsRoomPlayers[c.RoomID] = make(map[string]int)
		}
		wsRoomPlayers[c.RoomID][c.ID]++
		wsRoomPlayerMu.Unlock()

		var uid uint
		if _, err := fmt.Sscanf(c.ID, "%d", &uid); err == nil && uid > 0 {
			TouchPlayerActivity(uid)
		}
		if room, ok := GetRoomFromStore(c.RoomID); ok {
			for id, p := range room.Players {
				if id == uid || (p.Username != "" && p.Username == c.ID) {
					TouchPlayerActivity(id)
				}
			}
		}
	}
}

func unregisterClientFromHub(c *Client) {
	wsHubMu.Lock()
	if subs, ok := wsHubSubs[c.Channel]; ok {
		delete(subs, c)
		if len(subs) == 0 {
			delete(wsHubSubs, c.Channel)
		}
	}
	wsHubMu.Unlock()

	if c.RoomID != "" && c.ID != "" && c.RoomID != "practice" && c.RoomID != "default-room" {
		wsRoomPlayerMu.Lock()
		if m, ok := wsRoomPlayers[c.RoomID]; ok {
			m[c.ID]--
			if m[c.ID] <= 0 {
				delete(m, c.ID)
			}
			if len(m) == 0 {
				delete(wsRoomPlayers, c.RoomID)
			}
		}
		wsRoomPlayerMu.Unlock()

		roomID := c.RoomID
		playerID := c.ID
		go func() {
			time.Sleep(35 * time.Second)
			if GetActiveWSCount(roomID, playerID) == 0 {
				var uid uint
				if _, err := fmt.Sscanf(playerID, "%d", &uid); err == nil && uid > 0 {
					if !IsPlayerRecentlyActive(uid, 45) {
						RemovePlayerFromRoomAndCleanup(roomID, uid)
					}
				}
			}
		}()
	}
}

// PublishChannel broadcasts immediately to all local WebSocket subscribers in-memory (<0.01ms)
func PublishChannel(channel string, payload []byte) {
	PublishChannelExcept(channel, payload, nil)
}

func PublishChannelExcept(channel string, payload []byte, exclude *Client) {
	wsHubMu.RLock()
	subs := wsHubSubs[channel]
	for client := range subs {
		if exclude != nil && client == exclude {
			continue
		}
		select {
		case client.Send <- payload:
		default:
		}
	}
	wsHubMu.RUnlock()
}

func PublishChannelJSON(channel string, msg interface{}) {
	if data, err := json.Marshal(msg); err == nil {
		PublishChannel(channel, data)
	}
}

func ServeWs(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	if tcpConn, ok := conn.UnderlyingConn().(*net.TCPConn); ok {
		_ = tcpConn.SetNoDelay(true)
	}

	roomID := c.Query("roomId")
	playerID := c.Query("playerId")
	channel := "global_channel"
	if roomID != "" {
		channel = "room_channel:" + roomID
	}

	var parsedUID uint
	if playerID != "" {
		_, _ = fmt.Sscanf(playerID, "%d", &parsedUID)
	}

	client := &Client{
		ID:            playerID,
		UID:           parsedUID,
		RoomID:        roomID,
		Channel:       channel,
		Conn:          conn,
		Send:          make(chan []byte, 1024),
		Done:          make(chan struct{}),
		lastTouchUnix: time.Now().Unix(),
	}

	registerClientInHub(client)
	go client.readPump()
	go client.writePump()

	if roomID != "" && roomID != "practice" && roomID != "default-room" {
		if room, ok := GetRoomFromStore(roomID); ok {
			if data, err := json.Marshal(map[string]interface{}{
				"type": "room_update",
				"room": room,
			}); err == nil {
				select {
				case client.Send <- data:
				default:
				}
			}
		}
		if state, gOk := GetGameFromStore(roomID); gOk {
			remSec := int((state.Duration - time.Since(state.StartTime)).Seconds())
			if remSec < 0 {
				remSec = 0
			}
			if data, err := json.Marshal(map[string]interface{}{
				"type":       "tick",
				"time_left":  remSec,
				"score_red":  state.ScoreRed,
				"score_blue": state.ScoreBlue,
				"players":    state.Players,
			}); err == nil {
				select {
				case client.Send <- data:
				default:
				}
			}
		}
		PublishChannelExcept(channel, mustJSON(map[string]interface{}{
			"type":        "request_sync",
			"requesterId": playerID,
		}), client)
	}
}

func mustJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

var (
	fastTypeSync  = []byte(`"type":"sync"`)
	fastTypeFire  = []byte(`"type":"fire"`)
	fastTypeSkill = []byte(`"type":"skill_cast"`)
	fastTypeEmote = []byte(`"type":"emote"`)
)

func (c *Client) readPump() {
	defer func() {
		if c.ID != "" {
			roster := RemoveVoiceParticipant(c.RoomID, c.ID)
			PublishChannelJSON(c.Channel, map[string]interface{}{
				"type":         "voice_leave",
				"userId":       c.ID,
				"roomId":       normalizeVoiceRoomKey(c.RoomID),
				"participants": roster,
			})
		}
		unregisterClientFromHub(c)
		close(c.Done)
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws error: %v", err)
			}
			break
		}

		if c.UID > 0 {
			nowUnix := time.Now().Unix()
			if nowUnix-c.lastTouchUnix >= 2 {
				c.lastTouchUnix = nowUnix
				TouchPlayerActivity(c.UID)
			}
		}

		// Zero-allocation fast path for high-frequency position/fire/skill/emote packets
		if bytes.Contains(message, fastTypeSync) ||
			bytes.Contains(message, fastTypeFire) ||
			bytes.Contains(message, fastTypeSkill) ||
			bytes.Contains(message, fastTypeEmote) {
			PublishChannelExcept(c.Channel, message, c)
			continue
		}

		var gameMsg map[string]interface{}
		if err := json.Unmarshal(message, &gameMsg); err == nil {
			msgType, _ := gameMsg["type"].(string)
			if c.UID == 0 {
				if uFloat, ok := gameMsg["userId"].(float64); ok && uFloat > 0 {
					c.UID = uint(uFloat)
					TouchPlayerActivity(c.UID)
				} else if aFloat, ok := gameMsg["attackerId"].(float64); ok && aFloat > 0 {
					c.UID = uint(aFloat)
					TouchPlayerActivity(c.UID)
				}
			}

			if msgType == "ping" {
				wsHubMu.RLock()
				onlineCount := len(wsHubSubs[c.Channel])
				wsHubMu.RUnlock()
				pongData := mustJSON(map[string]interface{}{
					"type":        "pong",
					"clientTs":    gameMsg["clientTs"],
					"serverTs":    time.Now().UnixMilli(),
					"onlineCount": onlineCount,
				})
				select {
				case c.Send <- pongData:
				default:
				}
				continue
			}

			// Fallback fast path if JSON had spaces
			if msgType == "sync" || msgType == "fire" || msgType == "skill_cast" || msgType == "emote" {
				PublishChannelExcept(c.Channel, message, c)
				continue
			}

			if HandleWsVoiceMessage(c, msgType, gameMsg, message) {
				continue
			}

			if (msgType == "heal_sync" || msgType == "respawn_sync") && c.RoomID != "" {
				var uid uint
				fmt.Sscanf(c.ID, "%d", &uid)
				if uid == 0 {
					if uFloat, ok := gameMsg["userId"].(float64); ok {
						uid = uint(uFloat)
					} else if uStr, ok := gameMsg["userId"].(string); ok {
						fmt.Sscanf(uStr, "%d", &uid)
					}
				}
				hp := 3201
				if hFloat, ok := gameMsg["hp"].(float64); ok && hFloat > 0 {
					hp = int(hFloat)
				}
				if uid > 0 {
					HandleHealOrRespawn(c.RoomID, uid, hp)
				}
				continue
			}

			if msgType == "hit" && c.RoomID != "" {
				if tStr, ok := gameMsg["targetId"].(string); ok && tStr == "__boss__" {
					PublishChannelExcept(c.Channel, message, c)
					continue
				}
				var targetID uint
				if t, ok := gameMsg["targetId"].(float64); ok {
					targetID = uint(t)
				} else if tStr, ok := gameMsg["targetId"].(string); ok {
					fmt.Sscanf(tStr, "%d", &targetID)
				}
				damage := 100
				if d, ok := gameMsg["damage"].(float64); ok {
					damage = int(d)
				}
				weaponName, _ := gameMsg["weaponName"].(string)
				crit, _ := gameMsg["crit"].(bool)
				var attID uint
				fmt.Sscanf(c.ID, "%d", &attID)
				if attID == 0 {
					if aFloat, ok := gameMsg["attackerId"].(float64); ok {
						attID = uint(aFloat)
					}
				}
				HandleHitWithExtra(c.RoomID, attID, targetID, damage, weaponName, crit, gameMsg)
				continue
			}

			if msgType == "bot_kill" && c.RoomID != "" {
				team, _ := gameMsg["team"].(string)
				if team == "" {
					team = "red"
				}
				HandleBotKill(c.RoomID, team)
				continue
			}

			if msgType == "objective_action" && c.RoomID != "" {
				redDelta := 0
				blueDelta := 0
				if r, ok := gameMsg["redDelta"].(float64); ok {
					redDelta = int(r)
				}
				if b, ok := gameMsg["blueDelta"].(float64); ok {
					blueDelta = int(b)
				}
				HandleObjectiveAction(c.RoomID, redDelta, blueDelta, gameMsg)
				continue
			}

			if msgType == "chat" {
				sender, _ := gameMsg["sender"].(string)
				if sender == "" {
					sender, _ = gameMsg["userId"].(string)
				}
				text, _ := gameMsg["message"].(string)
				if text == "" {
					text, _ = gameMsg["content"].(string)
				}
				chOverride, _ := gameMsg["channel"].(string)
				if sender != "" && text != "" {
					chName := "global"
					if chOverride != "" {
						chName = chOverride
					} else if c.RoomID != "" {
						chName = c.RoomID
					}
					go func(ch, s, m string) {
						DB.Create(&ChatMessage{
							Channel: ch,
							Sender:  s,
							Message: m,
							MsgType: "chat",
						})
					}(chName, sender, text)
					if chOverride == "global" || chOverride == "world" {
						PublishChannel("global_channel", message)
					}
				}
			}
		}

		PublishChannel(c.Channel, message)
	}
}


func (c *Client) writePump() {
	defer func() {
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		}
	}
}
