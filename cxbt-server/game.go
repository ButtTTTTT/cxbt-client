package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Position struct {
	X   float64 `json:"x"`
	Y   float64 `json:"y"`
	Z   float64 `json:"z"`
	Yaw float64 `json:"yaw"`
}

type PlayerState struct {
	UserID   uint     `json:"userId"`
	Team     string   `json:"team"`
	HP       int      `json:"hp"`
	MaxHP    int      `json:"maxHp"`
	Ammo     int      `json:"ammo"`
	IsAlive  bool     `json:"isAlive"`
	Kills    int      `json:"kills"`
	Deaths   int      `json:"deaths"`
	Position Position `json:"position"`
}

type GameState struct {
	RoomID    string               `json:"roomId"`
	ScoreRed  int                  `json:"scoreRed"`
	ScoreBlue int                  `json:"scoreBlue"`
	StartTime time.Time            `json:"startTime"`
	Duration  time.Duration        `json:"duration"`
	Players   map[uint]*PlayerState `json:"players"`
	Over      bool                 `json:"over"`
}

var (
	activeGamesMu sync.Mutex
	activeGames   = make(map[string]context.CancelFunc)
)

// StartGameLoop ticks 20 times per second for game state auth
func StartGameLoop(roomID string) {
	activeGamesMu.Lock()
	if prevCancel, exists := activeGames[roomID]; exists {
		prevCancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	activeGames[roomID] = cancel
	activeGamesMu.Unlock()

	defer func() {
		activeGamesMu.Lock()
		delete(activeGames, roomID)
		activeGamesMu.Unlock()
	}()

	ticker := time.NewTicker(50 * time.Millisecond) // 20 tick/s
	defer ticker.Stop()

	lastBroadcastSec := -1

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			state, ok := GetGameFromStore(roomID)
			if !ok {
				return
			}

			if state.Over {
				cancel()
				return
			}

			elapsed := time.Since(state.StartTime)
			remaining := state.Duration - elapsed
			if remaining <= 0 {
				state.Over = true
				EndGame(roomID, &state)
				return
			}

			remSec := int(remaining.Seconds())
			if remSec != lastBroadcastSec {
				lastBroadcastSec = remSec
				PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
					"type":       "tick",
					"time_left":  remSec,
					"score_red":  state.ScoreRed,
					"score_blue": state.ScoreBlue,
				})
			}
		}
	}
}

// EndGame processes results, gives EXP/Coins, records MatchRecord in MySQL 8, and cleans up
func EndGame(roomID string, state *GameState) {
	winner := "draw"
	if state.ScoreRed > state.ScoreBlue {
		winner = "red"
	} else if state.ScoreBlue > state.ScoreRed {
		winner = "blue"
	}

	room, hasRoom := GetRoomFromStore(roomID)
	modeName := "团队竞技"
	mapName := "训练场"
	if hasRoom {
		if room.ModeName != "" {
			modeName = room.ModeName
		}
		if room.MapName != "" {
			mapName = room.MapName
		}
	}

	for _, p := range state.Players {
		var char SavedCharacter
		if err := DB.Where("user_id = ?", p.UserID).First(&char).Error; err == nil {
			expGain := 120 + p.Kills*30
			coinGain := 500 + p.Kills*100
			ratingDelta := 5
			resultStr := "Draw"

			if winner == p.Team {
				expGain += 180
				coinGain += 700
				ratingDelta = 25
				resultStr = "Victory"
			} else if winner != "draw" {
				ratingDelta = -10
				resultStr = "Defeat"
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

			DB.Create(&MatchRecord{
				UserID:      p.UserID,
				Username:    char.Name,
				RoomID:      roomID,
				ModeName:    modeName,
				MapName:     mapName,
				Result:      resultStr,
				Kills:       p.Kills,
				Deaths:      p.Deaths,
				RewardCoins: coinGain,
				RewardExp:   expGain,
				RatingDelta: ratingDelta,
			})

			advanceMissionProgress(p.UserID, "daily_battle", 1)
			if p.Kills > 0 {
				advanceMissionProgress(p.UserID, "daily_kills", p.Kills)
			}
		}
	}

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":       "game_over",
		"winner":     winner,
		"score_red":  state.ScoreRed,
		"score_blue": state.ScoreBlue,
	})

	if hasRoom {
		room.State = "Waiting"
		SaveRoomToStore(room)
	}

	DeleteGameFromStore(roomID)
}

func HandleBotKill(roomID string, team string) {
	state, ok := GetGameFromStore(roomID)
	if !ok || state.Over {
		return
	}
	if team == "blue" {
		state.ScoreBlue++
	} else {
		state.ScoreRed++
	}
	SaveGameToStore(roomID, state)

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":       "tick",
		"time_left":  int((state.Duration - time.Since(state.StartTime)).Seconds()),
		"score_red":  state.ScoreRed,
		"score_blue": state.ScoreBlue,
	})
}

// HandleHit processes a shot from an attacker to a target
func HandleHit(roomID string, attackerID uint, targetID uint, damage int) {
	state, ok := GetGameFromStore(roomID)
	if !ok {
		return
	}

	target, exists := state.Players[targetID]
	attacker, aExists := state.Players[attackerID]

	if !exists || !aExists || !target.IsAlive || target.Team == attacker.Team {
		return
	}

	target.HP -= damage
	if target.HP <= 0 {
		target.HP = 0
	}

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":   "health_update",
		"userId": targetID,
		"hp":     target.HP,
	})

	if target.HP <= 0 {
		target.IsAlive = false
		target.Deaths++
		attacker.Kills++

		if attacker.Team == "red" {
			state.ScoreRed++
		} else {
			state.ScoreBlue++
		}

		PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
			"type":   "kill",
			"killer": fmt.Sprint(attackerID),
			"victim": fmt.Sprint(targetID),
		})

		go func(rID string, uID uint) {
			time.Sleep(5 * time.Second)
			st, ok2 := GetGameFromStore(rID)
			if !ok2 {
				return
			}
			if p, ok3 := st.Players[uID]; ok3 {
				if p.MaxHP <= 0 {
					p.MaxHP = 3201
				}
				p.HP = p.MaxHP
				p.IsAlive = true
				p.Ammo = 30
				SaveGameToStore(rID, st)
				PublishChannelJSON("room_channel:"+rID, map[string]interface{}{
					"type":   "respawn",
					"userId": uID,
					"hp":     p.HP,
				})
			}
		}(roomID, targetID)
	}

	SaveGameToStore(roomID, state)
}
