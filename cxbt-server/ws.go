package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	ID      string
	RoomID  string
	Channel string
	Conn    *websocket.Conn
	Send    chan []byte
	Done    chan struct{}
}

var (
	wsHubMu   sync.RWMutex
	wsHubSubs = make(map[string]map[*Client]struct{})
)

func registerClientInHub(c *Client) {
	wsHubMu.Lock()
	defer wsHubMu.Unlock()
	if wsHubSubs[c.Channel] == nil {
		wsHubSubs[c.Channel] = make(map[*Client]struct{})
	}
	wsHubSubs[c.Channel][c] = struct{}{}
}

func unregisterClientFromHub(c *Client) {
	wsHubMu.Lock()
	defer wsHubMu.Unlock()
	if subs, ok := wsHubSubs[c.Channel]; ok {
		delete(subs, c)
		if len(subs) == 0 {
			delete(wsHubSubs, c.Channel)
		}
	}
}

// PublishChannel broadcasts immediately to all local WebSocket subscribers and also publishes to Redis
func PublishChannel(channel string, payload []byte) {
	wsHubMu.RLock()
	subs := wsHubSubs[channel]
	for client := range subs {
		select {
		case client.Send <- payload:
		default:
		}
	}
	wsHubMu.RUnlock()

	if RedisReady && RDB != nil {
		_ = RDB.Publish(Ctx, channel, payload).Err()
	}
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

	roomID := c.Query("roomId")
	playerID := c.Query("playerId")
	channel := "global_channel"
	if roomID != "" {
		channel = "room_channel:" + roomID
	}

	client := &Client{
		ID:      playerID,
		RoomID:  roomID,
		Channel: channel,
		Conn:    conn,
		Send:    make(chan []byte, 256),
		Done:    make(chan struct{}),
	}

	registerClientInHub(client)
	go client.readPump()
	go client.writePump()
}

func (c *Client) readPump() {
	defer func() {
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

		var gameMsg map[string]interface{}
		if err := json.Unmarshal(message, &gameMsg); err == nil {
			msgType, _ := gameMsg["type"].(string)

			if msgType == "hit" && c.RoomID != "" {
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
				var attID uint
				fmt.Sscanf(c.ID, "%d", &attID)
				HandleHit(c.RoomID, attID, targetID, damage)
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
				HandleObjectiveAction(c.RoomID, redDelta, blueDelta)
				continue
			}


			if msgType == "chat" {
				sender, _ := gameMsg["userId"].(string)
				text, _ := gameMsg["message"].(string)
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
