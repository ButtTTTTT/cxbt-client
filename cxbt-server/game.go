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

func StopGameLoop(roomID string) {
	activeGamesMu.Lock()
	if cancel, exists := activeGames[roomID]; exists {
		cancel()
		delete(activeGames, roomID)
	}
	activeGamesMu.Unlock()
}

func EnsurePlayerInGameState(roomID string, userID uint, defaultTeam string) GameState {
	if defaultTeam == "" {
		defaultTeam = "red"
	}
	state, ok := GetGameFromStore(roomID)
	needLoop := false
	if !ok {
		state = GameState{
			RoomID:    roomID,
			ScoreRed:  0,
			ScoreBlue: 0,
			StartTime: time.Now(),
			Duration:  10 * time.Minute,
			Players:   make(map[uint]*PlayerState),
		}
		needLoop = true
	}
	if state.Players == nil {
		state.Players = make(map[uint]*PlayerState)
	}

	if room, rOk := GetRoomFromStore(roomID); rOk {
		for id, rp := range room.Players {
			t := rp.Team
			if t == "" {
				t = "red"
			}
			if existing, pOk := state.Players[id]; !pOk {
				state.Players[id] = &PlayerState{
					UserID:  id,
					Team:    t,
					HP:      3201,
					MaxHP:   3201,
					Ammo:    30,
					IsAlive: true,
				}
			} else if existing.Team != t {
				existing.Team = t
			}
		}
	}

	if userID > 0 {
		if _, pOk := state.Players[userID]; !pOk {
			state.Players[userID] = &PlayerState{
				UserID:  userID,
				Team:    defaultTeam,
				HP:      3201,
				MaxHP:   3201,
				Ammo:    30,
				IsAlive: true,
			}
		}
	}

	SaveGameToStore(roomID, state)
	if needLoop {
		activeGamesMu.Lock()
		_, running := activeGames[roomID]
		activeGamesMu.Unlock()
		if !running {
			go StartGameLoop(roomID)
		}
	}
	return state
}

// StartGameLoop ticks twice per second for game state auth (eliminates 20Hz map cloning)
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

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	lastBroadcastSec := -1

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			roomStoreMu.RLock()
			room, hasRoom := memRooms[roomID]
			playerCount := 0
			if hasRoom {
				playerCount = len(room.Players)
			}
			roomStoreMu.RUnlock()

			if !hasRoom || playerCount == 0 {
				DeleteRoomFromStore(roomID)
				DeleteGameFromStore(roomID)
				return
			}

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
					"players":    state.Players,
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

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":       "game_over",
		"winner":     winner,
		"score_red":  state.ScoreRed,
		"score_blue": state.ScoreBlue,
		"players":    state.Players,
	})

	if hasRoom {
		if len(room.Players) == 0 {
			DeleteRoomFromStore(roomID)
		} else {
			room.State = "Waiting"
			SaveRoomToStore(room)
		}
	}

	stateSnap := cloneGameState(*state)
	DeleteGameFromStore(roomID)

	go func(st GameState, rID, mName, mpName, win string) {
		for _, p := range st.Players {
			var char SavedCharacter
			if err := DB.Where("user_id = ?", p.UserID).First(&char).Error; err == nil {
				expGain := 120 + p.Kills*30
				coinGain := 500 + p.Kills*100
				ratingDelta := 5
				resultStr := "Draw"

				if win == p.Team {
					expGain += 180
					coinGain += 700
					ratingDelta = 25
					resultStr = "Victory"
				} else if win != "draw" {
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
				SetCachedCharacter(char)

				DB.Create(&MatchRecord{
					UserID:      p.UserID,
					Username:    char.Name,
					RoomID:      rID,
					ModeName:    mName,
					MapName:     mpName,
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
	}(stateSnap, roomID, modeName, mapName, winner)
}

func HandleBotKill(roomID string, team string) {
	state := EnsurePlayerInGameState(roomID, 0, team)
	if state.Over {
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
		"players":    state.Players,
	})
}

func HandleObjectiveAction(roomID string, redDelta int, blueDelta int, rawMsg map[string]interface{}) {
	state := EnsurePlayerInGameState(roomID, 0, "red")
	if state.Over {
		return
	}
	if redDelta > 0 {
		state.ScoreRed += redDelta
	}
	if blueDelta > 0 {
		state.ScoreBlue += blueDelta
	}
	SaveGameToStore(roomID, state)

	if rawMsg != nil {
		rawMsg["score_red"] = state.ScoreRed
		rawMsg["score_blue"] = state.ScoreBlue
		PublishChannelJSON("room_channel:"+roomID, rawMsg)
	}

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":       "tick",
		"time_left":  int((state.Duration - time.Since(state.StartTime)).Seconds()),
		"score_red":  state.ScoreRed,
		"score_blue": state.ScoreBlue,
		"players":    state.Players,
	})
}

func HandleHit(roomID string, attackerID uint, targetID uint, damage int, weaponName string, crit bool) {
	HandleHitWithExtra(roomID, attackerID, targetID, damage, weaponName, crit, nil)
}

// HandleHitWithExtra processes a shot/skill hit in-place under lock without cloning maps on every hit
func HandleHitWithExtra(roomID string, attackerID uint, targetID uint, damage int, weaponName string, crit bool, extra map[string]interface{}) {
	if attackerID == 0 || targetID == 0 || attackerID == targetID {
		return
	}

	gameStoreMu.RLock()
	stCheck, hasGame := memGames[roomID]
	hasBoth := false
	if hasGame && stCheck.Players != nil {
		_, okA := stCheck.Players[attackerID]
		_, okT := stCheck.Players[targetID]
		hasBoth = okA && okT
	}
	gameStoreMu.RUnlock()

	if !hasBoth {
		EnsurePlayerInGameState(roomID, attackerID, "red")
		EnsurePlayerInGameState(roomID, targetID, "blue")
	}

	attackerName := fmt.Sprintf("战士#%d", attackerID)
	victimName := fmt.Sprintf("战士#%d", targetID)
	roomStoreMu.RLock()
	if room, rOk := memRooms[roomID]; rOk && room.Players != nil {
		if ap, ok := room.Players[attackerID]; ok && ap.Username != "" {
			attackerName = ap.Username
		}
		if vp, ok := room.Players[targetID]; ok && vp.Username != "" {
			victimName = vp.Username
		}
	}
	roomStoreMu.RUnlock()

	if weaponName == "" {
		weaponName = "战术武器"
	}
	if damage <= 0 {
		damage = 100
	}

	gameStoreMu.Lock()
	state, ok := memGames[roomID]
	if !ok || state.Players == nil {
		gameStoreMu.Unlock()
		return
	}
	target, exists := state.Players[targetID]
	attacker, aExists := state.Players[attackerID]
	if !exists || !aExists || !target.IsAlive {
		gameStoreMu.Unlock()
		return
	}

	target.HP -= damage
	if target.HP <= 0 {
		target.HP = 0
	}
	currentHP := target.HP
	died := false
	var scoreRed, scoreBlue, attackerKills, targetDeaths int
	var playersSnap map[uint]*PlayerState

	if target.HP <= 0 {
		died = true
		target.IsAlive = false
		target.Deaths++
		attacker.Kills++
		if attacker.Team == "blue" {
			state.ScoreBlue++
		} else {
			state.ScoreRed++
		}
		scoreRed = state.ScoreRed
		scoreBlue = state.ScoreBlue
		attackerKills = attacker.Kills
		targetDeaths = target.Deaths
		playersSnap = cloneGameState(state).Players
	}
	memGames[roomID] = state
	gameStoreMu.Unlock()

	healthMsg := map[string]interface{}{
		"type":         "health_update",
		"userId":       targetID,
		"attackerId":   attackerID,
		"attackerName": attackerName,
		"hp":           currentHP,
		"damage":       damage,
		"crit":         crit,
	}
	if extra != nil {
		if kb, ok := extra["knockback"]; ok {
			healthMsg["knockback"] = kb
		}
		if se, ok := extra["statusEffect"]; ok {
			healthMsg["statusEffect"] = se
		}
		if st, ok := extra["statusText"]; ok {
			healthMsg["statusText"] = st
		}
		if sc, ok := extra["statusColor"]; ok {
			healthMsg["statusColor"] = sc
		}
	}
	PublishChannelJSON("room_channel:"+roomID, healthMsg)

	if died {
		PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
			"type":       "kill",
			"killer":     fmt.Sprint(attackerID),
			"killerId":   attackerID,
			"killerName": attackerName,
			"victim":     fmt.Sprint(targetID),
			"victimId":   targetID,
			"victimName": victimName,
			"weaponName": weaponName,
			"score_red":  scoreRed,
			"score_blue": scoreBlue,
			"kills":      attackerKills,
			"deaths":     targetDeaths,
			"players":    playersSnap,
		})

		go func(rID string, uID uint) {
			time.Sleep(3 * time.Second)
			gameStoreMu.Lock()
			st, ok2 := memGames[rID]
			if !ok2 || st.Players == nil {
				gameStoreMu.Unlock()
				return
			}
			p, ok3 := st.Players[uID]
			if !ok3 {
				gameStoreMu.Unlock()
				return
			}
			if p.MaxHP <= 0 {
				p.MaxHP = 3201
			}
			p.HP = p.MaxHP
			p.IsAlive = true
			p.Ammo = 30
			respawnHP := p.HP
			memGames[rID] = st
			gameStoreMu.Unlock()

			PublishChannelJSON("room_channel:"+rID, map[string]interface{}{
				"type":   "respawn",
				"userId": uID,
				"hp":     respawnHP,
			})
		}(roomID, targetID)
	}
}

func HandleHealOrRespawn(roomID string, userID uint, hp int) {
	if roomID == "" || userID == 0 {
		return
	}
	if hp <= 0 {
		hp = 3201
	}

	gameStoreMu.Lock()
	state, ok := memGames[roomID]
	if !ok || state.Players == nil || state.Players[userID] == nil {
		gameStoreMu.Unlock()
		state = EnsurePlayerInGameState(roomID, userID, "red")
		gameStoreMu.Lock()
		state, ok = memGames[roomID]
	}
	if !ok || state.Players == nil {
		gameStoreMu.Unlock()
		return
	}
	p, exists := state.Players[userID]
	if !exists {
		gameStoreMu.Unlock()
		return
	}
	if p.MaxHP <= 0 || hp > p.MaxHP {
		p.MaxHP = hp
	}
	p.HP = hp
	p.IsAlive = true
	newHP := p.HP
	memGames[roomID] = state
	gameStoreMu.Unlock()

	PublishChannelJSON("room_channel:"+roomID, map[string]interface{}{
		"type":   "health_update",
		"userId": userID,
		"hp":     newHP,
		"damage": 0,
		"crit":   false,
	})
}
