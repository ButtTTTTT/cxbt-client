package main

import (
	"fmt"
	"math/rand"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	luckDrawMu   sync.Mutex
	userBoardPos = make(map[uint]int)
	userStamina  = make(map[uint]int)
	pdeCrcTable  = [256]uint32{
		0x00000000, 0x04C11DB7, 0x09823B6E, 0x0D4326D9, 0x130476DC, 0x17C56B6B, 0x1A864DB2, 0x1E475005,
		0x2608EDB8, 0x22C9F00F, 0x2F8AD6D6, 0x2B4BCB61, 0x350C9B64, 0x31CD86D3, 0x3C8EA00A, 0x384FBDBD,
		0x4C11DB70, 0x48D0C6C7, 0x4593E01E, 0x4152FDA9, 0x5F15ADAC, 0x5BD4B01B, 0x569796C2, 0x52568B75,
		0x6A1936C8, 0x6ED82B7F, 0x639B0DA6, 0x675A1011, 0x791D4014, 0x7DDC5DA3, 0x709F7B7A, 0x745E66CD,
		0x9823B6E0, 0x9CE2AB57, 0x91A18D8E, 0x95609039, 0x8B27C03C, 0x8FE6DD8B, 0x82A5FB52, 0x8664E6E5,
		0xBE2B5B58, 0xBAEA46EF, 0xB7A96036, 0xB3687D81, 0xAD2F2D84, 0xA9EE3033, 0xA4AD16EA, 0xA06C0B5D,
		0xD4326D90, 0xD0F37027, 0xDDB056FE, 0xD9714B49, 0xC7361B4C, 0xC3F706FB, 0xCEB42022, 0xCA753D95,
		0xF23A8028, 0xF6FB9D9F, 0xFBB8BB46, 0xFF79A6F1, 0xE13EF6F4, 0xE5FFEB43, 0xE8BCCD9A, 0xEC7DD02D,
		0x34867077, 0x30476DC0, 0x3D044B19, 0x39C556AE, 0x278206AB, 0x23431B1C, 0x2E003DC5, 0x2AC12072,
		0x128E9DCF, 0x164F8078, 0x1B0CA6A1, 0x1FCDBB16, 0x018AEB13, 0x054BF6A4, 0x0808D07D, 0x0CC9CDCA,
		0x7897AB07, 0x7C56B6B0, 0x71159069, 0x75D48DDE, 0x6B93DDDB, 0x6F52C06C, 0x6211E6B5, 0x66D0FB02,
		0x5E9F46BF, 0x5A5E5B08, 0x571D7DD1, 0x53DC6066, 0x4D9B3063, 0x495A2DD4, 0x44190B0D, 0x40D816BA,
		0xACA5C697, 0xA864DB20, 0xA527FDF9, 0xA1E6E04E, 0xBFA1B04B, 0xBB60ADFC, 0xB6238B25, 0xB2E29692,
		0x8AAD2B2F, 0x8E6C3698, 0x832F1041, 0x87EE0DF6, 0x99A95DF3, 0x9D684044, 0x902B669D, 0x94EA7B2A,
		0xE0B41DE7, 0xE4750050, 0xE9362689, 0xEDF73B3E, 0xF3B06B3B, 0xF771768C, 0xFA325055, 0xFEF34DE2,
		0xC6BCF05F, 0xC27DEDE8, 0xCF3ECB31, 0xCBFFD686, 0xD5B88683, 0xD1799B34, 0xDC3ABDED, 0xD8FBA05A,
		0x690CE0EE, 0x6DCDFD59, 0x608EDB80, 0x644FC637, 0x7A089632, 0x7EC98B85, 0x738AAD5C, 0x774BB0EB,
		0x4F040D56, 0x4BC510E1, 0x46863638, 0x42472B8F, 0x5C007B8A, 0x58C1663D, 0x558240E4, 0x51435D53,
		0x251D3B9E, 0x21DC2629, 0x2C9F00F0, 0x285E1D47, 0x36194D42, 0x32D850F5, 0x3F9B762C, 0x3B5A6B9B,
		0x0315D626, 0x07D4CB91, 0x0A97ED48, 0x0E56F0FF, 0x1011A0FA, 0x14D0BD4D, 0x19939B94, 0x1D528623,
		0xF12F560E, 0xF5EE4BB9, 0xF8AD6D60, 0xFC6C70D7, 0xE22B20D2, 0xE6EA3D65, 0xEBA91BBC, 0xEF68060B,
		0xD727BBB6, 0xD3E6A601, 0xDEA580D8, 0xDA649D6F, 0xC423CD6A, 0xC0E2D0DD, 0xCDA1F604, 0xC960EBB3,
		0xBD3E8D7E, 0xB9FF90C9, 0xB4BCB610, 0xB07DABA7, 0xAE3AFBA2, 0xAAFBE615, 0xA7B8C0CC, 0xA379DD7B,
		0x9B3660C6, 0x9FF77D71, 0x92B45BA8, 0x9675461F, 0x8832161A, 0x8CF30BAD, 0x81B02D74, 0x857130C3,
		0x5D8A9099, 0x594B8D2E, 0x5408ABF7, 0x50C9B640, 0x4E8EE645, 0x4A4FFBF2, 0x470CDD2B, 0x43CDC09C,
		0x7B827D21, 0x7F436096, 0x7200464F, 0x76C15BF8, 0x68860BFD, 0x6C47164A, 0x61043093, 0x65C52D24,
		0x119B4BE9, 0x155A565E, 0x18197087, 0x1CD86D30, 0x029F3D35, 0x065E2082, 0x0B1D065B, 0x0FDC1BEC,
		0x3793A651, 0x3352BBE6, 0x3E119D3F, 0x3AD08088, 0x2497D08D, 0x2056CD3A, 0x2D15EBE3, 0x29D4F654,
		0xC5A92679, 0xC1683BCE, 0xCC2B1D17, 0xC8EA00A0, 0xD6AD50A5, 0xD26C4D12, 0xDF2F6BCB, 0xDBEE767C,
		0xE3A1CBC1, 0xE760D676, 0xEA23F0AF, 0xEEE2ED18, 0xF0A5BD1D, 0xF464A0AA, 0xF9278673, 0xFD669BC4,
		0x89B8FD09, 0x8D79E0BE, 0x803AC667, 0x84FBDBD0, 0x9ABC8BD5, 0x9E7D9662, 0x933EB0BB, 0x97FFAD0C,
		0xAFB010B1, 0xAB710D06, 0xA6322BDF, 0xA2F33668, 0xBCB4666D, 0xB8757BDA, 0xB5365D03, 0xB1F740B4,
	}
)

func calculatePdeCrcGo(input []byte) uint32 {
	length := uint32(len(input))
	crc := length ^ 0xFFFFFFFF
	for i := 0; i < len(input); i++ {
		idx := (uint32(input[i]) ^ (crc >> 24)) & 0xFF
		crc = pdeCrcTable[idx] ^ (crc << 8)
	}
	return ^crc
}

func RegisterPdeFeatureRoutes(r *gin.Engine) {
	api := r.Group("/api")

	// 1. PDE Toolchain Summary & Lua Parser (pdestudio / PDEModelTools / UnPdeC / DevTools)
	api.GET("/pde/summary", func(c *gin.Context) {
		crcKey := calculatePdeCrcGo([]byte("crc_key"))
		c.JSON(http.StatusOK, gin.H{
			"status":        "online",
			"toolchains":    []string{"pdestudio", "PDEModelTools", "UnPdeC", "DevTools/UnCacheGui"},
			"crcKeyHex":     fmt.Sprintf("0x%08X", crcKey),
			"nativeAnimFps": 96.0,
			"mapCount":      47,
			"totalExported": 21419,
			"meshCount":     2318,
			"skelCount":     138,
			"animCount":     2677,
			"cacheUiCount":  169,
			"audioCount":    504,
			"formats":       []string{".mesh (0x0100)", ".skel (0x0600)", ".anim (0x0500)", ".cache (pack_ver=2)"},
		})
	})

	api.POST("/pde/parse-lua", func(c *gin.Context) {
		var req struct {
			LuaText      string `json:"luaText"`
			CrcPath      string `json:"crcPath"`
			RawBlockAddr uint32 `json:"rawBlockAddr"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		crcKey := calculatePdeCrcGo([]byte("crc_key"))
		rawCrc := calculatePdeCrcGo([]byte(req.CrcPath))
		headerCrc := rawCrc ^ crcKey
		actualOffset := (((req.RawBlockAddr >> 10) + req.RawBlockAddr + 1) << 12)

		mapName := ""
		if m := regexp.MustCompile(`AddMapName\s*\(\s*["']([^"']+)["']\s*\)`).FindStringSubmatch(req.LuaText); len(m) > 1 {
			mapName = m[1]
		}
		gateCount := len(regexp.MustCompile(`AddGate\s*\(`).FindAllStringIndex(req.LuaText, -1))
		activeCount := len(regexp.MustCompile(`AddActiveObject\s*\(`).FindAllStringIndex(req.LuaText, -1))

		c.JSON(http.StatusOK, gin.H{
			"mapName":      mapName,
			"gateCount":    gateCount,
			"activeCount":  activeCount,
			"rawCrcHex":    fmt.Sprintf("0x%08X", rawCrc),
			"headerCrcHex": fmt.Sprintf("0x%08X", headerCrc),
			"actualOffset": fmt.Sprintf("0x%08X", actualOffset),
		})
	})

	protected := api.Group("/")
	protected.Use(AuthMiddleware())
	{
		// 2. LuckDraw 42-Tile Dice Board Game (ported from scripts/lobby/luckDraw.lua, persisted in MySQL 8)
		protected.GET("/luckdraw/state", func(c *gin.Context) {
			userID := c.GetUint("userId")
			char := getOrCreateCharacter(userID)
			luckDrawMu.Lock()
			pos := char.LuckDrawPos
			if p, ok := userBoardPos[userID]; ok && p > pos {
				pos = p
			}
			stamina := char.LuckDrawStamina
			if stamina <= 0 {
				stamina = 100
				char.LuckDrawStamina = 100
				_ = DB.Save(&char).Error
			}
			userBoardPos[userID] = pos
			userStamina[userID] = stamina
			luckDrawMu.Unlock()
			c.JSON(http.StatusOK, gin.H{
				"position":   pos,
				"totalTiles": 42,
				"stamina":    stamina,
			})
		})

		protected.POST("/luckdraw/roll", func(c *gin.Context) {
			userID := c.GetUint("userId")
			var char SavedCharacter
			if err := DB.Where("user_id = ?", userID).First(&char).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "角色不存在"})
				return
			}

			luckDrawMu.Lock()
			stamina := char.LuckDrawStamina
			if stamina < 10 {
				stamina = 100 // Auto refill stamina for smooth gameplay
			}
			stamina -= 10
			dice := rand.Intn(6) + 1
			newPos := (char.LuckDrawPos + dice) % 42
			char.LuckDrawPos = newPos
			char.LuckDrawStamina = stamina
			userBoardPos[userID] = newPos
			userStamina[userID] = stamina
			luckDrawMu.Unlock()

			type tileReward struct {
				Title    string `json:"title"`
				Icon     string `json:"icon"`
				Coins    int    `json:"coins"`
				Gems     int    `json:"gems"`
				ItemID   string `json:"itemId"`
				ItemName string `json:"itemName"`
				Category string `json:"category"`
			}

			var reward tileReward
			switch {
			case newPos%7 == 0:
				reward = tileReward{Title: "👑 黄金秘宝大奖格", Icon: "👑", Coins: 2500, Gems: 120, ItemID: "stabilizer_super", ItemName: "高纯度稳压剂", Category: "material"}
			case newPos%5 == 0:
				reward = tileReward{Title: "🐉 远征首领宝箱格", Icon: "🐉", Coins: 1500, Gems: 60, ItemID: "pet_dragon_shard", ItemName: "暗黑巨龙宠物结晶", Category: "pet"}
			case newPos%3 == 0:
				reward = tileReward{Title: "💎 强化晶石补给格", Icon: "💎", Coins: 800, Gems: 35, ItemID: "enhance_stone_lv3", ItemName: "三级强化石", Category: "material"}
			case newPos%2 == 0:
				reward = tileReward{Title: "🪙 战星金币袋格", Icon: "🪙", Coins: 1200, Gems: 15}
			default:
				reward = tileReward{Title: "⚡ 战术能量补给格", Icon: "⚡", Coins: 650, Gems: 25, ItemID: "blueprint_weapon", ItemName: "传奇武器制造图纸", Category: "material"}
			}

			char.Coins += reward.Coins
			char.Gems += reward.Gems
			char.Exp += 85
			DB.Save(&char)

			if reward.ItemID != "" {
				var existing Inventory
				if err := DB.Where("user_id = ? AND item_id = ?", userID, reward.ItemID).First(&existing).Error; err == nil {
					existing.Count += 1
					DB.Save(&existing)
				} else {
					DB.Create(&Inventory{
						UserID:   userID,
						ItemID:   reward.ItemID,
						ItemName: reward.ItemName,
						Category: reward.Category,
						Count:    1,
					})
				}
			}

			c.JSON(http.StatusOK, gin.H{
				"dice":       dice,
				"lastDice":   dice,
				"position":   newPos,
				"totalTiles": 42,
				"stamina":    stamina,
				"reward":     reward,
				"coins":      char.Coins,
				"gems":       char.Gems,
				"character":  char,
				"message":    fmt.Sprintf("🎲 投出 %d 点，前进至第 %d 格【%s】，获得 +%d 金币、+%d 宝石！", dice, newPos+1, reward.Title, reward.Coins, reward.Gems),
			})
		})

		// 3. Expedition Boss Mode Launcher (ported from scripts/lobby/expedition.lua)
		protected.POST("/expedition/start", func(c *gin.Context) {
			userID := c.GetUint("userId")
			var req struct {
				StageID    string `json:"stageId"`
				Difficulty string `json:"difficulty"`
			}
			_ = c.ShouldBindJSON(&req)
			if req.StageID == "" {
				req.StageID = "stage_1"
			}
			if req.Difficulty == "" {
				req.Difficulty = "normal"
			}

			stageMaps := map[string]struct {
				MapID string
				Name  string
			}{
				"stage_1":    {MapID: "level10001", Name: "远征第一章 · 海盗要塞 (海盗船长)"},
				"stage_2":    {MapID: "level10002", Name: "远征第二章 · 机械矿坑 (挖掘机甲)"},
				"stage_3":    {MapID: "level10003", Name: "远征第三章 · 黄金金字塔 (远古法老王)"},
				"stage_4":    {MapID: "level10008", Name: "远征第四章 · 星界祭坛 (熔岩魔像)"},
				"stage_5":    {MapID: "level10009", Name: "远征终章 · 炼狱熔炉王座 (终焉熔岩巨兽)"},
				"level10001": {MapID: "level10001", Name: "远征第一章 · 海盗要塞 (海盗船长)"},
				"level10002": {MapID: "level10002", Name: "远征第二章 · 机械矿坑 (挖掘机甲)"},
				"level10003": {MapID: "level10003", Name: "远征第三章 · 黄金金字塔 (远古法老王)"},
				"level10008": {MapID: "level10008", Name: "远征第四章 · 星界祭坛 (熔岩魔像)"},
				"level10009": {MapID: "level10009", Name: "远征终章 · 炼狱熔炉王座 (终焉熔岩巨兽)"},
			}
			info, ok := stageMaps[req.StageID]
			if !ok {
				info = stageMaps["level10001"]
			}

			diffLabel := "普通"
			if req.Difficulty == "hard" {
				diffLabel = "困难"
			} else if req.Difficulty == "nightmare" {
				diffLabel = "噩梦"
			}

			var char SavedCharacter
			_ = DB.Where("user_id = ?", userID).First(&char).Error
			username := char.Name
			if username == "" {
				username = fmt.Sprintf("战士#%d", userID)
			}

			roomID := fmt.Sprintf("expedition_%d_%d", userID, time.Now().UnixNano()%100000)
			TouchPlayerActivity(userID)
			RemovePlayerFromAllOtherRooms(userID, roomID)

			room := RoomConfig{
				ID:         roomID,
				Name:       fmt.Sprintf("【%s远征】%s", diffLabel, info.Name),
				ModeID:     "boss",
				ModeName:   "冒险远征 (BOSS首领战)",
				MapID:      info.MapID,
				MapName:    info.Name,
				MaxPlayers: 4,
				State:      "Playing",
				HostID:     userID,
				HostName:   username,
				Players: map[uint]RoomPlayer{
					userID: {
						UserID:     userID,
						Username:   username,
						Level:      char.Level,
						Team:       "red",
						Ready:      true,
						JobID:      char.JobID,
						Appearance: char.Appearance,
					},
				},
			}
			SaveRoomToStore(room)
			EnsurePlayerInGameState(roomID, userID, "red")

			c.JSON(http.StatusOK, gin.H{
				"message":    "远征副本已开启",
				"difficulty": req.Difficulty,
				"room":       room,
			})
		})

		// 4. Character Card Inheritance (ported from scripts/lobby/playercardinherit.lua)
		protected.POST("/card-inherit", func(c *gin.Context) {
			userID := c.GetUint("userId")
			var req struct {
				SourceItemID  uint   `json:"sourceItemId"`
				TargetItemID  uint   `json:"targetItemId"`
				SourceCardID  string `json:"sourceCardId"`
				TargetCardID  string `json:"targetCardId"`
				UseStabilizer bool   `json:"useStabilizer"`
				UseCrystal    bool   `json:"useCrystal"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			var char SavedCharacter
			if err := DB.Where("user_id = ?", userID).First(&char).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "角色不存在"})
				return
			}

			costCoins := 800
			if char.Coins < costCoins {
				char.Coins = costCoins
			}
			char.Coins -= costCoins

			inheritRate := 80
			if req.UseStabilizer || req.UseCrystal {
				inheritRate = 100
			}

			var srcItem, dstItem Inventory
			errSrc := DB.Where("id = ? AND user_id = ?", req.SourceItemID, userID).First(&srcItem).Error
			errDst := DB.Where("id = ? AND user_id = ?", req.TargetItemID, userID).First(&dstItem).Error

			transferredLevels := 2
			if errSrc == nil && errDst == nil && srcItem.ID != dstItem.ID {
				if srcItem.EnhanceLevel > 0 {
					transferredLevels = (srcItem.EnhanceLevel * inheritRate) / 100
					if transferredLevels < 1 {
						transferredLevels = 1
					}
					srcItem.EnhanceLevel = 0
					dstItem.EnhanceLevel += transferredLevels
					DB.Save(&srcItem)
					DB.Save(&dstItem)
				} else {
					dstItem.EnhanceLevel += 1
					transferredLevels = 1
					DB.Save(&dstItem)
				}
			}

			char.Power += transferredLevels * 240
			char.Level += 1
			DB.Save(&char)

			c.JSON(http.StatusOK, gin.H{
				"message":           fmt.Sprintf("角色卡传承成功（传承率 %d%%）！目标星级 +%d，战力提升 +%d！", inheritRate, transferredLevels, transferredLevels*240),
				"inheritRate":       inheritRate,
				"transferredLevels": transferredLevels,
				"newPower":          char.Power,
				"newLevel":          char.Level,
				"coins":             char.Coins,
				"character":         char,
			})
		})

		// 5. Manufacture Depot Blueprint Crafting (ported from scripts/lobby/manufactureDepot.lua)
		protected.POST("/manufacture", func(c *gin.Context) {
			userID := c.GetUint("userId")
			var req struct {
				RecipeID   string `json:"recipeId"`
				ItemID     string `json:"itemId"`
				ItemName   string `json:"itemName"`
				Category   string `json:"category"`
				CostCoins  int    `json:"costCoins"`
				CostGems   int    `json:"costGems"`
				BonusPower int    `json:"bonusPower"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			recipes := map[string]struct {
				Name     string
				Category string
				CostCoin int
				CostGem  int
				Upgrade  int
				PowerAdd int
			}{
				"bp_gold_ak47":        {Name: "黄金AK47 · 裁决", Category: "equipment", CostCoin: 6000, CostGem: 25, Upgrade: 5, PowerAdd: 240},
				"bp_abyss_cannon":     {Name: "深渊重炮 · 毁灭者", Category: "equipment", CostCoin: 7500, CostGem: 35, Upgrade: 6, PowerAdd: 290},
				"bp_nano_pulse":       {Name: "纳米治愈脉冲枪", Category: "equipment", CostCoin: 5200, CostGem: 20, Upgrade: 4, PowerAdd: 210},
				"bp_phantom_sniper":   {Name: "暗夜幽灵狙击步枪", Category: "equipment", CostCoin: 8000, CostGem: 40, Upgrade: 6, PowerAdd: 310},
				"bp_seraph_wing":      {Name: "炽天使光翼 · 改", Category: "equipment", CostCoin: 9500, CostGem: 50, Upgrade: 7, PowerAdd: 360},
				"bp_enhance_stone_box": {Name: "传说强化石礼盒", Category: "items", CostCoin: 3000, CostGem: 10, Upgrade: 2, PowerAdd: 120},
				"smg_gold_up":         {Name: "黄金风暴冲锋枪 (MAX制造)", Category: "weapon", CostCoin: 1200, CostGem: 20, Upgrade: 5, PowerAdd: 480},
				"sniper_dragon_up":    {Name: "龙息重型狙击枪 (定制)", Category: "weapon", CostCoin: 1500, CostGem: 30, Upgrade: 6, PowerAdd: 620},
				"stabilizer_bundle":   {Name: "高纯度稳压剂箱 (x5)", Category: "material", CostCoin: 500, CostGem: 10, Upgrade: 1, PowerAdd: 120},
				"pet_dragon_core":     {Name: "暗黑幼龙战斗伴侣", Category: "pet", CostCoin: 1800, CostGem: 40, Upgrade: 4, PowerAdd: 550},
				"card_hero_ssr":       {Name: "SSR 传奇战星角色卡", Category: "card", CostCoin: 2000, CostGem: 50, Upgrade: 5, PowerAdd: 750},
			}

			recipe, ok := recipes[req.RecipeID]
			if !ok {
				if req.ItemName != "" {
					recipe = struct {
						Name     string
						Category string
						CostCoin int
						CostGem  int
						Upgrade  int
						PowerAdd int
					}{
						Name:     req.ItemName,
						Category: req.Category,
						CostCoin: req.CostCoins,
						CostGem:  req.CostGems,
						Upgrade:  5,
						PowerAdd: req.BonusPower,
					}
				} else {
					recipe = recipes["bp_gold_ak47"]
					req.RecipeID = "bp_gold_ak47"
				}
			}

			var char SavedCharacter
			if err := DB.Where("user_id = ?", userID).First(&char).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "角色不存在"})
				return
			}

			if char.Coins >= recipe.CostCoin {
				char.Coins -= recipe.CostCoin
			}
			if char.Gems >= recipe.CostGem {
				char.Gems -= recipe.CostGem
			}
			char.Power += recipe.PowerAdd
			DB.Save(&char)

			item := Inventory{
				UserID:       userID,
				ItemID:       req.RecipeID,
				ItemName:     recipe.Name,
				Category:     recipe.Category,
				Count:        1,
				EnhanceLevel: recipe.Upgrade,
			}
			DB.Create(&item)

			c.JSON(http.StatusOK, gin.H{
				"message":   fmt.Sprintf("制造成功！已获得【%s】(强化 +%d)，战力 +%d！", recipe.Name, recipe.Upgrade, recipe.PowerAdd),
				"item":      item,
				"coins":     char.Coins,
				"gems":      char.Gems,
				"power":     char.Power,
				"character": char,
			})
		})

		// 6. Post-Match 9-Card Flip Reward Draw (ported from scripts/game_balance.lua)
		protected.POST("/battle/flip-card", func(c *gin.Context) {
			userID := c.GetUint("userId")
			var req struct {
				CardIndex int    `json:"cardIndex"`
				ModeID    string `json:"modeId"`
				Victory   bool   `json:"victory"`
			}
			_ = c.ShouldBindJSON(&req)

			pool := []struct {
				Name     string `json:"name"`
				Icon     string `json:"icon"`
				Amount   string `json:"amount"`
				Rarity   string `json:"rarity"`
				Coins    int    `json:"coins"`
				Gems     int    `json:"gems"`
				ItemID   string `json:"itemId"`
				Category string `json:"category"`
			}{
				{Name: "强化石礼袋", Icon: "💎", Amount: "x5", Rarity: "epic", Coins: 300, Gems: 15, ItemID: "enhance_stone", Category: "material"},
				{Name: "高纯度稳压剂", Icon: "🧪", Amount: "x2", Rarity: "rare", Coins: 250, Gems: 10, ItemID: "stabilizer", Category: "material"},
				{Name: "黄金战星金币箱", Icon: "🪙", Amount: "+1,500", Rarity: "common", Coins: 1500, Gems: 5},
				{Name: "远征首领勋章", Icon: "🏅", Amount: "x3", Rarity: "epic", Coins: 450, Gems: 25, ItemID: "boss_medal", Category: "material"},
				{Name: "暗黑巨龙宠物结晶", Icon: "🐉", Amount: "x1", Rarity: "legendary", Coins: 600, Gems: 40, ItemID: "pet_dragon", Category: "pet"},
				{Name: "星币补给箱", Icon: "✨", Amount: "+180 星币", Rarity: "rare", Coins: 200, Gems: 180},
				{Name: "角色传承核心", Icon: "🔮", Amount: "x1", Rarity: "legendary", Coins: 500, Gems: 30, ItemID: "inherit_core", Category: "card"},
				{Name: "精良武器制造图", Icon: "📜", Amount: "x1", Rarity: "rare", Coins: 350, Gems: 15, ItemID: "weapon_blueprint", Category: "material"},
				{Name: "战星双倍经验章", Icon: "⚡", Amount: "+800 EXP", Rarity: "common", Coins: 400, Gems: 10},
			}

			idx := (req.CardIndex + rand.Intn(len(pool))) % len(pool)
			if idx < 0 {
				idx = 0
			}
			picked := pool[idx]

			var char SavedCharacter
			if err := DB.Where("user_id = ?", userID).First(&char).Error; err == nil {
				char.Coins += picked.Coins
				char.Gems += picked.Gems
				if strings.Contains(picked.Amount, "EXP") {
					char.Exp += 800
				}
				DB.Save(&char)
			}

			if picked.ItemID != "" {
				var existing Inventory
				if err := DB.Where("user_id = ? AND item_id = ?", userID, picked.ItemID).First(&existing).Error; err == nil {
					existing.Count += 1
					DB.Save(&existing)
				} else {
					DB.Create(&Inventory{
						UserID:   userID,
						ItemID:   picked.ItemID,
						ItemName: picked.Name,
						Category: picked.Category,
						Count:    1,
					})
				}
			}

			c.JSON(http.StatusOK, gin.H{
				"cardIndex": req.CardIndex,
				"reward":    picked,
				"character": char,
				"message":   fmt.Sprintf("翻开第 %d 号秘宝牌，获得【%s %s】！", req.CardIndex+1, picked.Name, picked.Amount),
			})
		})
	}
}
