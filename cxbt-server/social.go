package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// --- Helpers to Seed Per-User MySQL 8 Data ---

func ensureUserMissions(userID uint) []PlayerMission {
	var missions []PlayerMission
	DB.Where("user_id = ?", userID).Order("id asc").Find(&missions)
	if len(missions) == 0 {
		defaults := []PlayerMission{
			{UserID: userID, MissionCode: "daily_login", Title: "每日签到打卡", Description: "登录创想兵团大厅并查看今日任务", Progress: 1, Target: 1, RewardCoins: 3000, RewardExp: 100, RewardGems: 20},
			{UserID: userID, MissionCode: "daily_battle", Title: "凌云要塞出击", Description: "参与并完成 1 场练习赛或快速匹配对局", Progress: 0, Target: 1, RewardCoins: 5000, RewardExp: 200, RewardGems: 30},
			{UserID: userID, MissionCode: "daily_kills", Title: "王牌神射手", Description: "在战场中累计击败 3 名敌人或机器人", Progress: 0, Target: 3, RewardCoins: 6000, RewardExp: 300, RewardGems: 40},
			{UserID: userID, MissionCode: "career_enhance", Title: "军械强化大师", Description: "在强化中心进行 1 次武器或护甲强化", Progress: 0, Target: 1, RewardCoins: 4000, RewardExp: 150, RewardGems: 25},
			{UserID: userID, MissionCode: "career_shop", Title: "百变时尚达人", Description: "在商城或拍卖行入手 1 件心仪装备或造型", Progress: 0, Target: 1, RewardCoins: 4500, RewardExp: 150, RewardGems: 25},
		}
		for i := range defaults {
			DB.Create(&defaults[i])
		}
		DB.Where("user_id = ?", userID).Order("id asc").Find(&missions)
	}
	return missions
}

func advanceMissionProgress(userID uint, code string, delta int) {
	ensureUserMissions(userID)
	var m PlayerMission
	if err := DB.Where("user_id = ? AND mission_code = ?", userID, code).First(&m).Error; err == nil {
		if m.Progress < m.Target {
			m.Progress += delta
			if m.Progress > m.Target {
				m.Progress = m.Target
			}
			DB.Save(&m)
		}
	}
}

func ensureUserEnhancements(userID uint) []ItemEnhancement {
	var items []ItemEnhancement
	DB.Where("user_id = ?", userID).Order("id asc").Find(&items)
	if len(items) == 0 {
		defaults := []ItemEnhancement{
			{UserID: userID, SlotKey: "primary_weapon", SlotName: "主武器 · 核心火炮", Level: 1, BonusPower: 120, BonusHP: 50},
			{UserID: userID, SlotKey: "secondary_weapon", SlotName: "副武器 · 战术枪械", Level: 1, BonusPower: 100, BonusHP: 40},
			{UserID: userID, SlotKey: "melee_weapon", SlotName: "近战武器 · 利刃", Level: 1, BonusPower: 80, BonusHP: 30},
			{UserID: userID, SlotKey: "armor_body", SlotName: "防具 · 凌云作战服", Level: 1, BonusPower: 90, BonusHP: 150},
			{UserID: userID, SlotKey: "wing", SlotName: "背部 · 推进飞翼", Level: 0, BonusPower: 0, BonusHP: 0},
			{UserID: userID, SlotKey: "ring", SlotName: "饰品 · 能量指环", Level: 0, BonusPower: 0, BonusHP: 0},
		}
		for i := range defaults {
			DB.Create(&defaults[i])
		}
		DB.Where("user_id = ?", userID).Order("id asc").Find(&items)
	}
	return items
}

func ensureUserMails(userID uint) []Mail {
	var mails []Mail
	DB.Where("receiver_id = ?", userID).Order("id desc").Find(&mails)
	if len(mails) == 0 {
		welcomeMails := []Mail{
			{
				ReceiverID:  userID,
				SenderID:    0,
				SenderName:  "凌云指挥部",
				Title:       "欢迎加入《创想兵团》！新兵启航物资",
				Content:     "亲爱的百变战士，欢迎来到阿瓦塔星球！指挥部为您准备了新兵启航金币与宝石补给，祝您在凌云要塞旗开得胜！",
				IsRead:      false,
				IsClaimed:   false,
				RewardCoins: 10000,
				RewardGems:  50,
				Attachment:  "10000 金币 + 50 宝石",
			},
			{
				ReceiverID:  userID,
				SenderID:    0,
				SenderName:  "军械研究所",
				Title:       "全职业武器与沙盒测试开放通知",
				Content:     "全部 14 类端游原版武器音效、弹道特效、AI 陪练假人及要塞地图已全面实装，快去背包与练习赛体验吧！",
				IsRead:      false,
				IsClaimed:   false,
				RewardCoins: 5000,
				RewardGems:  30,
				Attachment:  "5000 金币 + 30 宝石",
			},
		}
		for i := range welcomeMails {
			DB.Create(&welcomeMails[i])
		}
		DB.Where("receiver_id = ?", userID).Order("id desc").Find(&mails)
	}
	return mails
}

func getOrCreateCharacter(userID uint) SavedCharacter {
	var char SavedCharacter
	if err := DB.Unscoped().Where("user_id = ?", userID).First(&char).Error; err != nil {
		char = SavedCharacter{
			UserID:  userID,
			Version: 1,
			Name:    fmt.Sprintf("战士%d", userID),
			JobID:   "guardian",
			Level:   1,
			Exp:     0,
			Coins:   100000,
			Cash:    5000,
			Gems:    200,
			Rating:  1200,
			Power:   1500,
		}
		DB.Create(&char)
	}
	char.DeletedAt.Valid = false
	if char.Level <= 0 {
		char.Level = 1
	}
	if char.Coins <= 1000 {
		char.Coins = 100000
	}
	if char.Cash <= 0 {
		char.Cash = 5000
	}
	if char.Gems <= 0 {
		char.Gems = 200
	}
	if char.Power <= 0 {
		char.Power = 1500 + char.Level*150
	}
	return char
}

// --- Friends API ---
func AddFriendHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var req struct {
		FriendName string `json:"friendName"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.FriendName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入好友角色名"})
		return
	}

	var friendChar SavedCharacter
	if err := DB.Where("name = ?", req.FriendName).First(&friendChar).Error; err != nil {
		// Also try matching User.Username
		var friendUser User
		if err2 := DB.Where("username = ?", req.FriendName).First(&friendUser).Error; err2 == nil {
			friendChar = getOrCreateCharacter(friendUser.ID)
		} else {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到该角色名的玩家"})
			return
		}
	}

	if friendChar.UserID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能添加自己为好友"})
		return
	}

	var existing Friend
	if err := DB.Where("(user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)", userID, friendChar.UserID, friendChar.UserID, userID).First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{"status": "Already friends", "friend": existing})
		return
	}

	friendReq := Friend{
		UserID:     userID,
		FriendID:   friendChar.UserID,
		FriendName: friendChar.Name,
		Status:     "Accepted",
	}
	DB.Create(&friendReq)
	c.JSON(http.StatusOK, gin.H{"status": "Friend added successfully", "friend": friendReq})
}

func GetFriendsHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var friends []Friend
	DB.Where("user_id = ? OR friend_id = ?", userID, userID).Order("id desc").Find(&friends)

	// 当当前用户是被添加方 (FriendID == userID) 时，将展示名称反查为发起方的角色名
	for i := range friends {
		if friends[i].FriendID == userID && friends[i].UserID != userID {
			var initiator SavedCharacter
			if err := DB.Where("user_id = ?", friends[i].UserID).First(&initiator).Error; err == nil && initiator.Name != "" {
				friends[i].FriendName = initiator.Name
			}
		}
	}

	// Enrich friend names and also provide recommended players from MySQL 8
	var recommended []SavedCharacter
	DB.Where("user_id <> ?", userID).Order("rating desc").Limit(10).Find(&recommended)

	c.JSON(http.StatusOK, gin.H{
		"friends":     friends,
		"recommended": recommended,
	})
}

func DeleteFriendHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	id := c.Param("id")
	DB.Where("id = ? AND (user_id = ? OR friend_id = ?)", id, userID, userID).Delete(&Friend{})
	c.JSON(http.StatusOK, gin.H{"status": "已移除好友"})
}

// --- Guild API ---
func GetGuildsHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var guilds []Guild
	DB.Order("level desc, member_count desc, id asc").Find(&guilds)

	var myMember GuildMember
	var myGuild *Guild
	if err := DB.Where("user_id = ?", userID).First(&myMember).Error; err == nil {
		var g Guild
		if err2 := DB.First(&g, myMember.GuildID).Error; err2 == nil {
			myGuild = &g
		}
	}

	var members []GuildMember
	if myGuild != nil {
		DB.Where("guild_id = ?", myGuild.ID).Order("contribution desc").Find(&members)
	}

	c.JSON(http.StatusOK, gin.H{
		"guilds":     guilds,
		"myGuild":    myGuild,
		"myMember":   myMember,
		"memberList": members,
	})
}

func CreateGuildHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var req struct {
		Name   string `json:"name"`
		Notice string `json:"notice"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入公会名称"})
		return
	}

	char := getOrCreateCharacter(userID)
	notice := req.Notice
	if notice == "" {
		notice = "荣耀集结，共战凌云要塞！"
	}

	guild := Guild{
		Name:        req.Name,
		Notice:      notice,
		Level:       1,
		OwnerID:     userID,
		OwnerName:   char.Name,
		MemberCount: 1,
	}
	if err := DB.Create(&guild).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "公会名称已被占用"})
		return
	}

	DB.Where("user_id = ?", userID).Delete(&GuildMember{})
	member := GuildMember{
		GuildID:      guild.ID,
		UserID:       userID,
		Username:     char.Name,
		Role:         "会长",
		Contribution: 500,
	}
	DB.Create(&member)

	c.JSON(http.StatusOK, gin.H{"guild": guild, "member": member})
}

func JoinGuildHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	guildID := c.Param("id")

	var guild Guild
	if err := DB.First(&guild, guildID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Guild not found"})
		return
	}

	char := getOrCreateCharacter(userID)

	// 检查玩家是否已经在某个公会中，若已在目标公会则幂等返回，若在其他公会则先扣减原公会人数
	var prevMember GuildMember
	if err := DB.Where("user_id = ?", userID).First(&prevMember).Error; err == nil {
		if prevMember.GuildID == guild.ID {
			c.JSON(http.StatusOK, gin.H{"guild": guild, "member": prevMember})
			return
		}
		var oldGuild Guild
		if err2 := DB.First(&oldGuild, prevMember.GuildID).Error; err2 == nil {
			if oldGuild.MemberCount > 1 {
				oldGuild.MemberCount--
				DB.Save(&oldGuild)
			} else {
				DB.Delete(&oldGuild)
			}
		}
		DB.Delete(&prevMember)
	}

	member := GuildMember{
		GuildID:      guild.ID,
		UserID:       userID,
		Username:     char.Name,
		Role:         "Member",
		Contribution: 100,
	}
	DB.Create(&member)

	var actualCount int64
	DB.Model(&GuildMember{}).Where("guild_id = ?", guild.ID).Count(&actualCount)
	guild.MemberCount = int(actualCount)
	if guild.MemberCount < 1 {
		guild.MemberCount = 1
	}
	DB.Save(&guild)

	c.JSON(http.StatusOK, gin.H{"guild": guild, "member": member})
}

func LeaveGuildHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var member GuildMember
	if err := DB.Where("user_id = ?", userID).First(&member).Error; err == nil {
		guildID := member.GuildID
		DB.Delete(&member)

		var guild Guild
		if err2 := DB.First(&guild, guildID).Error; err2 == nil {
			var remaining []GuildMember
			DB.Where("guild_id = ?", guildID).Order("contribution desc, id asc").Find(&remaining)
			if len(remaining) == 0 {
				// 最后一名成员退出时自动解散空公会
				DB.Delete(&guild)
			} else {
				guild.MemberCount = len(remaining)
				// 若会长退出，自动将职位顺延给贡献最高的核心成员
				if guild.OwnerID == userID {
					nextOwner := remaining[0]
					guild.OwnerID = nextOwner.UserID
					guild.OwnerName = nextOwner.Username
					nextOwner.Role = "Owner"
					DB.Save(&nextOwner)
				}
				DB.Save(&guild)
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": "Left guild successfully"})
}

// --- Mail API ---
func GetMailHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	mails := ensureUserMails(userID)
	c.JSON(http.StatusOK, mails)
}

func ReadMailHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	mailID := c.Param("id")

	var mail Mail
	if err := DB.Where("id = ? AND receiver_id = ?", mailID, userID).First(&mail).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "邮件不存在"})
		return
	}

	mail.IsRead = true
	DB.Save(&mail)
	c.JSON(http.StatusOK, mail)
}

func ClaimMailHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	mailID := c.Param("id")

	var mail Mail
	if err := DB.Where("id = ? AND receiver_id = ?", mailID, userID).First(&mail).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "邮件不存在"})
		return
	}
	if mail.IsClaimed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "附件已领取"})
		return
	}

	mail.IsRead = true
	mail.IsClaimed = true
	DB.Save(&mail)

	char := getOrCreateCharacter(userID)
	char.Coins += mail.RewardCoins
	char.Gems += mail.RewardGems
	DB.Save(&char)

	c.JSON(http.StatusOK, gin.H{"mail": mail, "character": char})
}

func SendMailHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var req struct {
		ReceiverName string `json:"receiverName"`
		Title        string `json:"title"`
		Content      string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.ReceiverName == "" || req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写收件人与标题"})
		return
	}

	sender := getOrCreateCharacter(userID)
	var target SavedCharacter
	if err := DB.Where("name = ?", req.ReceiverName).First(&target).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "收件人角色不存在"})
		return
	}

	mail := Mail{
		ReceiverID: target.UserID,
		SenderID:   userID,
		SenderName: sender.Name,
		Title:      req.Title,
		Content:    req.Content,
		IsRead:     false,
		IsClaimed:  true,
	}
	DB.Create(&mail)
	c.JSON(http.StatusOK, gin.H{"status": "邮件已发送", "mail": mail})
}

// --- Missions API ---
func GetMissionsHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	missions := ensureUserMissions(userID)
	c.JSON(http.StatusOK, missions)
}

func ClaimMissionHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	missionID := c.Param("id")

	var m PlayerMission
	if err := DB.Where("id = ? AND user_id = ?", missionID, userID).First(&m).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
		return
	}
	if m.Claimed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "奖励已领取"})
		return
	}
	if m.Progress < m.Target {
		// Allow instant completion + claim if user clicks complete in UI
		m.Progress = m.Target
	}
	m.Claimed = true
	DB.Save(&m)

	char := getOrCreateCharacter(userID)
	char.Coins += m.RewardCoins
	char.Exp += m.RewardExp
	char.Gems += m.RewardGems
	for char.Exp >= char.Level*100 {
		char.Exp -= char.Level * 100
		char.Level++
		char.Power += 150
	}
	DB.Save(&char)

	c.JSON(http.StatusOK, gin.H{"mission": m, "character": char})
}

// --- Equipment Enhancement API ---
func GetEnhancementsHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	items := ensureUserEnhancements(userID)
	char := getOrCreateCharacter(userID)
	c.JSON(http.StatusOK, gin.H{"enhancements": items, "character": char})
}

func EnhanceItemHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var req struct {
		SlotKey       string `json:"slotKey"`
		UseStabilizer bool   `json:"useStabilizer"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.SlotKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Please select an enhancement slot"})
		return
	}

	ensureUserEnhancements(userID)
	var item ItemEnhancement
	if err := DB.Where("user_id = ? AND slot_key = ?", userID, req.SlotKey).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Enhancement slot not found"})
		return
	}
	if item.Level >= 15 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Maximum enhancement level +15 reached"})
		return
	}

	cost := (item.Level + 1) * 1500
	gemCost := 0
	if req.UseStabilizer {
		gemCost = 15
	}

	char := getOrCreateCharacter(userID)
	if char.Coins < cost {
		c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("Insufficient coins: need %d coins", cost)})
		return
	}
	if gemCost > 0 && char.Gems < gemCost {
		c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("Insufficient gems for stabilizer: need %d gems", gemCost)})
		return
	}

	char.Coins -= cost
	char.Gems -= gemCost

	// 计算强化成功率：+5 以下固定 100%，启用稳压剂固定 100%，未启用稳压剂时按阶梯衰减
	baseRate := 100
	if item.Level >= 5 && !req.UseStabilizer {
		baseRate = 100 - (item.Level-4)*10
		if baseRate < 35 {
			baseRate = 35
		}
	}

	powerAdd := 120
	if req.UseStabilizer {
		powerAdd = 165 // 稳压剂额外提供 +45 战斗力加成
	}

	roll := int(time.Now().UnixNano()%100) + 1
	if roll > baseRate {
		// 未开启稳压剂且高阶强化未命中概率时保持原等级不掉级，仅消耗金币
		DB.Save(&char)
		SetCachedCharacter(char)
		advanceMissionProgress(userID, "career_enhance", 1)
		c.JSON(http.StatusOK, gin.H{
			"item":      item,
			"character": char,
			"success":   false,
			"message":   fmt.Sprintf("Enhancement attempt on [%s] failed (%d%% rate). Enable stabilizer for 100%% success!", item.SlotName, baseRate),
		})
		return
	}

	item.Level++
	item.BonusPower += powerAdd
	item.BonusHP += 80
	char.Power += powerAdd

	DB.Save(&item)
	DB.Save(&char)
	SetCachedCharacter(char)
	advanceMissionProgress(userID, "career_enhance", 1)

	c.JSON(http.StatusOK, gin.H{
		"item":      item,
		"character": char,
		"success":   true,
		"message":   fmt.Sprintf("Enhanced [%s] to +%d! Power +%d!", item.SlotName, item.Level, powerAdd),
	})
}

// --- Shop & Inventory API ---
func GetInventoryHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var items []Inventory
	DB.Where("user_id = ?", userID).Order("id desc").Find(&items)
	c.JSON(http.StatusOK, items)
}

func BuyItemHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var req struct {
		ItemID   string `json:"itemId"`
		ItemName string `json:"itemName"`
		Category string `json:"category"`
		Price    int    `json:"price"`
		Currency string `json:"currency"` // "coins", "cash", "gems"
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.ItemID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的商品信息"})
		return
	}
	if req.Price <= 0 {
		req.Price = 2000
	}

	char := getOrCreateCharacter(userID)
	switch req.Currency {
	case "cash":
		if char.Cash < req.Price {
			c.JSON(http.StatusForbidden, gin.H{"error": "点券不足，请先前往在线充值"})
			return
		}
		char.Cash -= req.Price
	case "gems":
		if char.Gems < req.Price {
			c.JSON(http.StatusForbidden, gin.H{"error": "宝石不足"})
			return
		}
		char.Gems -= req.Price
	default:
		if char.Coins < req.Price {
			c.JSON(http.StatusForbidden, gin.H{"error": "金币不足"})
			return
		}
		char.Coins -= req.Price
	}

	char.Power += 80
	DB.Save(&char)

	var item Inventory
	if err := DB.Where("user_id = ? AND item_id = ?", userID, req.ItemID).First(&item).Error; err == nil {
		item.Count++
		DB.Save(&item)
	} else {
		item = Inventory{
			UserID:   userID,
			ItemID:   req.ItemID,
			ItemName: req.ItemName,
			Category: req.Category,
			Count:    1,
		}
		DB.Create(&item)
	}

	advanceMissionProgress(userID, "career_shop", 1)

	c.JSON(http.StatusOK, gin.H{
		"status":    "购买成功！已存入背包",
		"character": char,
		"item":      item,
	})
}

// --- Auction House API ---
func GetAuctionHandler(c *gin.Context) {
	var listings []AuctionListing
	DB.Where("status = ?", "Active").Order("id desc").Limit(50).Find(&listings)
	c.JSON(http.StatusOK, listings)
}

func CreateAuctionHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var req struct {
		ItemID     string `json:"itemId"`
		ItemName   string `json:"itemName"`
		Category   string `json:"category"`
		PriceCoins int    `json:"priceCoins"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.ItemName == "" || req.PriceCoins <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写上架物品名称与价格"})
		return
	}

	char := getOrCreateCharacter(userID)
	listing := AuctionListing{
		SellerID:   userID,
		SellerName: char.Name,
		ItemID:     req.ItemID,
		ItemName:   req.ItemName,
		Category:   req.Category,
		PriceCoins: req.PriceCoins,
		Status:     "Active",
	}
	DB.Create(&listing)
	c.JSON(http.StatusOK, listing)
}

func BuyAuctionHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	listingID := c.Param("id")

	var listing AuctionListing
	if err := DB.Where("id = ? AND status = ?", listingID, "Active").First(&listing).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "该拍品已售出或下架"})
		return
	}

	buyer := getOrCreateCharacter(userID)
	if buyer.Coins < listing.PriceCoins {
		c.JSON(http.StatusForbidden, gin.H{"error": "金币不足，无法竞拍购买"})
		return
	}

	buyer.Coins -= listing.PriceCoins
	buyer.Power += 100
	DB.Save(&buyer)

	if listing.SellerID != 0 && listing.SellerID != userID {
		var seller SavedCharacter
		if err := DB.Where("user_id = ?", listing.SellerID).First(&seller).Error; err == nil {
			seller.Coins += listing.PriceCoins
			DB.Save(&seller)
		}
	}

	listing.Status = "Sold"
	DB.Save(&listing)

	DB.Create(&Inventory{
		UserID:   userID,
		ItemID:   listing.ItemID,
		ItemName: listing.ItemName,
		Category: listing.Category,
		Count:    1,
	})

	advanceMissionProgress(userID, "career_shop", 1)

	c.JSON(http.StatusOK, gin.H{
		"status":    fmt.Sprintf("成功竞拍【%s】！", listing.ItemName),
		"character": buyer,
		"listing":   listing,
	})
}

// --- Leaderboard, Sign-In, Recharge, Online Reward & Military Rank ---
func GetLeaderboardHandler(c *gin.Context) {
	var top []SavedCharacter
	DB.Order("rating desc, power desc, level desc").Limit(20).Find(&top)
	c.JSON(http.StatusOK, top)
}

func SignInHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	today := time.Now().Format("2006-01-02")

	char := getOrCreateCharacter(userID)
	if char.LastSignInDate == today {
		c.JSON(http.StatusOK, gin.H{
			"alreadySigned": true,
			"character":     char,
			"message":       fmt.Sprintf("今日已签到（连续签到 %d 天）", char.SignInStreak),
		})
		return
	}

	char.LastSignInDate = today
	char.SignInStreak++
	rewardCoins := 3000 + char.SignInStreak*500
	rewardGems := 30
	rewardExp := 100

	char.Coins += rewardCoins
	char.Gems += rewardGems
	char.Exp += rewardExp
	for char.Exp >= char.Level*100 {
		char.Exp -= char.Level * 100
		char.Level++
		char.Power += 150
	}
	DB.Save(&char)
	advanceMissionProgress(userID, "daily_login", 1)

	c.JSON(http.StatusOK, gin.H{
		"alreadySigned": false,
		"character":     char,
		"rewardCoins":   rewardCoins,
		"rewardGems":    rewardGems,
		"rewardExp":     rewardExp,
		"message":       fmt.Sprintf("签到成功！连续签到 %d 天，获得 %d 金币、%d 宝石、%d 经验！", char.SignInStreak, rewardCoins, rewardGems, rewardExp),
	})
}

func RechargeHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var req struct {
		Cash  int `json:"cash"`
		Gems  int `json:"gems"`
		Coins int `json:"coins"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	char := getOrCreateCharacter(userID)
	char.Cash += req.Cash
	char.Gems += req.Gems
	char.Coins += req.Coins
	DB.Save(&char)

	c.JSON(http.StatusOK, gin.H{
		"character": char,
		"message":   fmt.Sprintf("充值成功！获得 %d 点券、%d 宝石、%d 金币！", req.Cash, req.Gems, req.Coins),
	})
}

func OnlineRewardHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	char := getOrCreateCharacter(userID)

	char.OnlineClaimCount++
	rewardCoins := 2500
	rewardGems := 20
	rewardExp := 80

	char.Coins += rewardCoins
	char.Gems += rewardGems
	char.Exp += rewardExp
	for char.Exp >= char.Level*100 {
		char.Exp -= char.Level * 100
		char.Level++
		char.Power += 150
	}
	DB.Save(&char)

	c.JSON(http.StatusOK, gin.H{
		"character": char,
		"message":   fmt.Sprintf("领取在线奖励成功！获得 %d 金币、%d 宝石、%d 经验！", rewardCoins, rewardGems, rewardExp),
	})
}

func computeMilitaryRank(rating int) (string, string) {
	switch {
	case rating >= 2000:
		return "凌云大元帅", "统领千军的传奇元帅，享有全服最高荣耀加成"
	case rating >= 1700:
		return "星际少将", "身经百战的将领，威震凌云要塞"
	case rating >= 1500:
		return "王牌上校", "率队突击的中坚统帅"
	case rating >= 1350:
		return "精锐少校", "战功赫赫的前线指挥官"
	case rating >= 1250:
		return "突击上尉", "经验丰富的精锐老兵"
	case rating >= 1150:
		return "新锐中尉", "崭露头角的百变战士"
	default:
		return "见习列兵", "初入阿瓦塔星球的新锐士兵"
	}
}

func GetMatchesHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	char := getOrCreateCharacter(userID)

	var records []MatchRecord
	DB.Where("user_id = ?", userID).Order("id desc").Limit(20).Find(&records)

	totalKills := 0
	totalWins := 0
	for _, r := range records {
		totalKills += r.Kills
		if r.Result == "Victory" {
			totalWins++
		}
	}

	rankTitle, rankDesc := computeMilitaryRank(char.Rating)
	c.JSON(http.StatusOK, gin.H{
		"character":  char,
		"rankTitle":  rankTitle,
		"rankDesc":   rankDesc,
		"records":    records,
		"totalKills": totalKills,
		"totalWins":  totalWins,
		"totalGames": len(records),
	})
}

func GetChatHistoryHandler(c *gin.Context) {
	channel := c.DefaultQuery("channel", "global")
	var msgs []ChatMessage
	if channel == "all" || channel == "" {
		DB.Order("id desc").Limit(40).Find(&msgs)
	} else {
		DB.Where("channel = ? OR channel = 'global'", channel).Order("id desc").Limit(40).Find(&msgs)
	}
	// Reverse to chronological order
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	c.JSON(http.StatusOK, msgs)
}

func SendChatMessageHandler(c *gin.Context) {
	userID := c.MustGet("userId").(uint)
	var req struct {
		Channel string `json:"channel"`
		RoomID  string `json:"roomId"`
		Message string `json:"message"`
		Content string `json:"content"`
		Sender  string `json:"sender"`
		Team    string `json:"team"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "消息格式错误"})
		return
	}
	msgText := req.Message
	if msgText == "" {
		msgText = req.Content
	}
	if msgText == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "消息内容不能为空"})
		return
	}

	char := getOrCreateCharacter(userID)
	senderName := req.Sender
	if senderName == "" {
		senderName = char.Name
	}
	chName := req.Channel
	if chName == "" {
		if req.RoomID != "" {
			chName = req.RoomID
		} else {
			chName = "global"
		}
	}

	chatRow := ChatMessage{
		Channel: chName,
		Sender:  senderName,
		Message: msgText,
		MsgType: "chat",
	}
	DB.Create(&chatRow)

	payload := gin.H{
		"type":    "chat",
		"userId":  senderName,
		"sender":  senderName,
		"channel": chName,
		"roomId":  req.RoomID,
		"team":    req.Team,
		"message": msgText,
		"content": msgText,
		"time":    time.Now().Format("15:04:05"),
	}

	// Broadcast to global channel and room channel if applicable
	PublishChannelJSON("global_channel", payload)
	if req.RoomID != "" {
		PublishChannelJSON("room_channel:"+req.RoomID, payload)
	} else if chName != "global" && chName != "world" {
		PublishChannelJSON("room_channel:"+chName, payload)
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"chat":   chatRow,
	})
}

