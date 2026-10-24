import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../api';
import { mapServerCharacter, type SavedCharacter } from '../characterCreation/character';
import { lobbyUrl, type InventoryItem, type LobbyAssets } from './assets';
import './LobbyFeatureModal.css';

type LobbyFeatureModalProps = {
  title: string;
  assets: LobbyAssets;
  character: SavedCharacter;
  onUpdateCharacter: (char: SavedCharacter) => void;
  onSelectBagItem?: (item: InventoryItem) => void;
  onStartRoom?: (room: any) => void;
  onStatus: (msg: string) => void;
  onClose: () => void;
};

const RECHARGE_PACKAGES = [
  { id: 'pack1', name: '新兵点券包', price: '¥6', cash: 600, gems: 30, coins: 10000, tag: '首充双倍' },
  { id: 'pack2', name: '精英战备包', price: '¥30', cash: 3200, gems: 180, coins: 50000, tag: '热门' },
  { id: 'pack3', name: '统帅军饷箱', price: '¥98', cash: 11000, gems: 680, coins: 180000, tag: '超值' },
  { id: 'pack4', name: '凌云至尊宝库', price: '¥328', cash: 40000, gems: 2600, coins: 600000, tag: '至尊' },
];

const PET_LIST = [
  { id: 'pet_dog01', modelId: 'dog01', texture: '../gameplay/textures/mesh/pet/dog01/tex_dog01b_trinket_c.png', name: '机械战犬 · 雷克斯 (dog01)', desc: '全天候侦察型机械伴侣，提升主人护甲穿透与生命上限', bonusPower: 180 },
  { id: 'pet_dragon', modelId: 'dragon', texture: '../gameplay/textures/mesh/pet/dragon/tex_dragon01b_trinket_c.png', name: '星际幼龙 · 烈焰 (dragon)', desc: '来自阿瓦塔火山带的稀有飞龙，喷射高能等离子吐息', bonusPower: 260 },
  { id: 'pet_dragon02', modelId: 'dragon02', texture: '../gameplay/textures/mesh/pet/dragon02/tex_dragon02b_trinket_c.png', name: '苍穹冰龙 · 霜翼 (dragon02)', desc: '极寒领域守护幼龙，释放寒霜减速立场', bonusPower: 270 },
  { id: 'pet_dragon03', modelId: 'dragon03', texture: '../gameplay/textures/mesh/pet/dragon03/tex_dragon03b_trinket_c.png', name: '翡翠毒龙 · 碧鳞 (dragon03)', desc: '生化丛林变异飞龙，强化毒素腐蚀伤害', bonusPower: 275 },
  { id: 'pet_dragon04', modelId: 'dragon04', texture: '../gameplay/textures/mesh/pet/dragon04/tex_dragon04a_trinket_c.png', name: '黄金圣龙 · 辉耀 (dragon04)', desc: '皇家金甲幼龙，提供全队暴击率与护甲加成', bonusPower: 300 },
  { id: 'pet_dragon05', modelId: 'dragon05', texture: '../gameplay/textures/mesh/pet/dragon05/tex_dragon05a_trinket_c.png', name: '紫晶魔龙 · 暗影 (dragon05)', desc: '暗黑虚空幼龙，强化隐身突袭与暴击伤害', bonusPower: 310 },
  { id: 'pet_dragon06', modelId: 'dragon06', texture: '../gameplay/textures/mesh/pet/dragon06/tex_dragon06a_trinket_c.png', name: '赤血狂龙 · 破军 (dragon06)', desc: '狂暴战意飞龙，大幅提升重火器爆炸威力', bonusPower: 320 },
  { id: 'pet_dragon07', modelId: 'dragon07', texture: '../gameplay/textures/mesh/pet/dragon07/tex_dragon07a_trinket_c.png', name: '雷霆电龙 · 脉冲 (dragon07)', desc: '电磁风暴伴侣，提升移动速度与换弹效率', bonusPower: 330 },
  { id: 'pet_dragon08', modelId: 'dragon08', texture: '../gameplay/textures/mesh/pet/dragon08/tex_dragon08a_trinket_d.png', name: '星骸骨龙 · 冥渊 (dragon08)', desc: '远古遗迹苏醒的骸骨幼龙，具备吸血回复加成', bonusPower: 340 },
  { id: 'pet_dragon09', modelId: 'dragon09', texture: '../gameplay/textures/mesh/pet/dragon09/tex_dragon09b_trinket_d.png', name: '炼狱翼龙 · 焚天 (dragon09)', desc: '熔岩核心孕育的领主级飞龙，全属性大幅增幅', bonusPower: 360 },
  { id: 'pet_dragon10', modelId: 'dragon10', texture: '../gameplay/textures/mesh/pet/dragon10/tex_dragon10a_trinket_d.png', name: '终焉圣龙 · 创世 (dragon10)', desc: '阿瓦塔星球传说级守护神龙，提供最高战力增幅', bonusPower: 400 },
  { id: 'pet_bird', modelId: 'bird', texture: '../gameplay/textures/mesh/pet/bird/tex_bird01b_trinket_c.png', name: '侦察机械鸟 · 猎鹰 (bird)', desc: '高空索敌伴侣，提升远程狙击精准度', bonusPower: 190 },
  { id: 'pet_bird02', modelId: 'bird02', texture: '../gameplay/textures/mesh/pet/bird02/tex_bird02b_trinket_d.png', name: '烈火凤凰 · 涅槃 (bird02)', desc: '浴火重生的神鸟伴侣，持续提供战地生命恢复', bonusPower: 280 },
  { id: 'pet_fish', modelId: 'fish', texture: '../gameplay/textures/mesh/pet/fish/tex_fish01b_trinket_c.png', name: '深海飞鱼 · 泡泡 (fish)', desc: '浮空水系灵宠，降低技能冷却时间', bonusPower: 200 },
  { id: 'pet_egg', modelId: 'egg', texture: '../gameplay/textures/mesh/pet/egg/text.png', name: '神秘龙蛋 · 起源 (egg)', desc: '蕴含未知星际能量的浮空龙蛋，提供幸运掉率加成', bonusPower: 160 },
  { id: 'pet_human01', modelId: 'human01', texture: '../gameplay/textures/mesh/pet/human01/tex_human01b_trinket_c.png', name: '治愈光灵 · 露娜 (human01)', desc: '纳米医疗人形伴侣，持续提供战地生命恢复与护盾充能', bonusPower: 250 },
  { id: 'pet_monster', modelId: 'monster', texture: '../gameplay/textures/mesh/pet/monster/tex_monster01b_trinket_c.png', name: '迷你小恶魔 · 库奇 (monster)', desc: '古灵精怪的虚空小恶魔，干扰敌方瞄准并提升暴击', bonusPower: 240 },
];

const MANUFACTURE_BLUEPRINTS = [
  { id: 'bp_gold_ak47', itemId: 'Rifle_AK47_Gold', itemName: '黄金AK47 · 裁决', category: 'equipment', costCoins: 6000, costGems: 25, bonusPower: 240, materials: '精铁核心 x4 + 黄金镀层 x2' },
  { id: 'bp_abyss_cannon', itemId: 'Bazooka_Abyss', itemName: '深渊重炮 · 毁灭者', category: 'equipment', costCoins: 7500, costGems: 35, bonusPower: 290, materials: '高爆火药桶 x5 + 钛合金炮管 x1' },
  { id: 'bp_nano_pulse', itemId: 'Curegun_Nano', itemName: '纳米治愈脉冲枪', category: 'equipment', costCoins: 5200, costGems: 20, bonusPower: 210, materials: '纳米生物芯片 x3 + 能量电池 x2' },
  { id: 'bp_phantom_sniper', itemId: 'Sniper_Phantom', itemName: '暗夜幽灵狙击步枪', category: 'equipment', costCoins: 8000, costGems: 40, bonusPower: 310, materials: '光学瞄准镜 x2 + 碳纤维枪托 x2' },
  { id: 'bp_seraph_wing', itemId: 'Wing_Seraph', itemName: '炽天使光翼 · 改', category: 'equipment', costCoins: 9500, costGems: 50, bonusPower: 360, materials: '炽天使羽毛 x6 + 星辰秘银 x2' },
  { id: 'bp_enhance_stone_box', itemId: 'Item_EnhanceBox', itemName: '传说强化石礼盒', category: 'items', costCoins: 3000, costGems: 10, bonusPower: 120, materials: '原矿结晶 x5' },
];

const EXPEDITION_STAGES = [
  { id: 'level10001', name: '远征第一章 · 海盗要塞', bossName: '海盗船长 · 铁钩杰克 (boss_01_01)', mapId: 'level10001', hp: 12000, recPower: 1500, drop: '黄金战星金币 +2,500 · 强化石 x3' },
  { id: 'level10002', name: '远征第二章 · 机械矿坑', bossName: '暴走挖掘机甲 · 泰坦 (boss_02_01)', mapId: 'level10002', hp: 18000, recPower: 1850, drop: '高纯度稳压剂 x2 · 远征勋章 x4' },
  { id: 'level10003', name: '远征第三章 · 黄金金字塔', bossName: '远古法老王 · 阿努比斯 (boss_03_01)', mapId: 'level10003', hp: 26000, recPower: 2200, drop: '精良武器图纸 x2 · 星币 +120' },
  { id: 'level10008', name: '远征第四章 · 星界祭坛', bossName: '熔岩魔像分身 · 炎魔 (boss_04_02)', mapId: 'level10008', hp: 36000, recPower: 2600, drop: '暗黑巨龙宠物碎片 x3 · 角色传承结晶 x1' },
  { id: 'level10009', name: '远征终章 · 炼狱熔炉王座', bossName: '终焉熔岩巨兽 · 阿瓦塔主宰 (boss_04_01)', mapId: 'level10009', hp: 52000, recPower: 3200, drop: '黄金AK47成品箱 · 宝石 +150 · 传说勋章' },
];

export default function LobbyFeatureModal({
  title,
  assets,
  character,
  onUpdateCharacter,
  onSelectBagItem,
  onStartRoom,
  onStatus,
  onClose,
}: LobbyFeatureModalProps) {
  const modalRef = useRef<HTMLElement>(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);

  // Module data states
  const [guildsData, setGuildsData] = useState<any>({ guilds: [], myGuild: null, memberList: [] });
  const [guildNameInput, setGuildNameInput] = useState('');
  const [guildNoticeInput, setGuildNoticeInput] = useState('');

  const [missions, setMissions] = useState<any[]>([]);
  const [enhancements, setEnhancements] = useState<any[]>([]);
  const [enhanceSubTab, setEnhanceSubTab] = useState<'weaponUp' | 'manufacture' | 'inherit'>('weaponUp');
  const [useStabilizer, setUseStabilizer] = useState(true);
  const [sourceCard, setSourceCard] = useState('新兵造型卡 · Lv.10');
  const [targetCard, setTargetCard] = useState('限定传说造型卡 · Lv.1');
  const [useCrystalInherit, setUseCrystalInherit] = useState(true);

  const [activitySubTab, setActivitySubTab] = useState<'luckdraw' | 'expedition' | 'rank'>(
    title === '冒险远征' ? 'expedition' : title === '军衔' ? 'rank' : 'luckdraw'
  );
  const [luckDrawState, setLuckDrawState] = useState<any>({
    position: 0,
    laps: 0,
    freeRollsLeft: 3,
    lastDice: 0,
    board: Array.from({ length: 42 }, (_, i) => ({
      index: i,
      type: i % 7 === 0 ? 'jackpot' : i % 3 === 0 ? 'gems' : 'coins',
      label: i === 0 ? '起点' : i % 7 === 0 ? '至尊大奖' : i % 3 === 0 ? '宝石补给' : '金币袋',
    })),
  });

  const [shopTab, setShopTab] = useState<'weapons' | 'avatars' | 'wings' | 'items' | 'parts'>('weapons');
  const [avatarParts, setAvatarParts] = useState<any[]>([]);
  const [partSlotFilter, setPartSlotFilter] = useState<string>('all');
  const [partSearch, setPartSearch] = useState<string>('');
  const [auctionList, setAuctionList] = useState<any[]>([]);
  const [auctionItemName, setAuctionItemName] = useState('');
  const [auctionPrice, setAuctionPrice] = useState('5000');

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [matchesData, setMatchesData] = useState<any>({ rankTitle: '见习列兵', rankDesc: '', records: [], totalKills: 0, totalWins: 0, totalGames: 0 });
  const [friendsData, setFriendsData] = useState<any>({ friends: [], recommended: [] });
  const [friendNameInput, setFriendNameInput] = useState('');

  const [mails, setMails] = useState<any[]>([]);
  const [mailReceiver, setMailReceiver] = useState('');
  const [mailTitle, setMailTitle] = useState('');
  const [mailContent, setMailContent] = useState('');
  const [activePet, setActivePet] = useState<string>(() => {
    try { return 'pet_' + (localStorage.getItem('avatarstar.activePet') || 'dragon'); } catch { return 'pet_dragon'; }
  });

  const [ownedInventory, setOwnedInventory] = useState<any[]>([]);

  const notify = (msg: string) => {
    setToast(msg);
    onStatus(msg);
  };

  const syncChar = (serverChar: any) => {
    if (!serverChar) return;
    const mapped = mapServerCharacter(serverChar);
    onUpdateCharacter(mapped);
  };

  useEffect(() => {
    setToast('');
    setLoading(true);
    if (title === '冒险远征') setActivitySubTab('expedition');
    else if (title === '幸运寻宝') setActivitySubTab('luckdraw');
    else if (title === '军衔') setActivitySubTab('rank');
    else if (title === '造型屋') setShopTab('parts');

    const loadModule = async () => {
      try {
        if (title === '商城' || title === '造型屋') {
          fetch(`${import.meta.env.BASE_URL}assets/avatar-parts/catalog.json`)
            .then((r) => (r.ok ? r.json() : null))
            .then((cat) => {
              if (cat && Array.isArray(cat.parts)) setAvatarParts(cat.parts);
            })
            .catch(() => undefined);
          apiFetch('/inventory')
            .then((inv) => {
              if (Array.isArray(inv)) setOwnedInventory(inv);
            })
            .catch(() => undefined);
        }
        if (title === '公会') {
          const data = await apiFetch('/guilds');
          if (data) setGuildsData(data);
        } else if (title === '任务') {
          const data = await apiFetch('/missions');
          if (Array.isArray(data)) setMissions(data);
        } else if (title === '强化') {
          const data = await apiFetch('/enhance');
          if (data?.enhancements) setEnhancements(data.enhancements);
          if (data?.character) syncChar(data.character);
        } else if (title === '拍卖行') {
          const data = await apiFetch('/auction');
          if (Array.isArray(data)) setAuctionList(data);
        } else if (title === '排行榜') {
          const data = await apiFetch('/leaderboard');
          if (Array.isArray(data)) setLeaderboard(data);
        } else if (title === '军衔' || title === '活动' || title === '幸运寻宝' || title === '冒险远征') {
          const [matchesRes, luckRes] = await Promise.allSettled([
            apiFetch('/matches'),
            apiFetch('/luckdraw/state'),
          ]);
          if (matchesRes.status === 'fulfilled' && matchesRes.value) {
            setMatchesData(matchesRes.value);
            if (matchesRes.value.character) syncChar(matchesRes.value.character);
          }
          if (luckRes.status === 'fulfilled' && luckRes.value) {
            setLuckDrawState((prev: any) => ({ ...prev, ...luckRes.value }));
            if (luckRes.value.character) syncChar(luckRes.value.character);
          }
        } else if (title === '好友') {
          const data = await apiFetch('/friends');
          if (data) setFriendsData(data);
        } else if (title === '邮件') {
          const data = await apiFetch('/mail');
          if (Array.isArray(data)) setMails(data);
        }
      } catch (e: any) {
        notify(`已连接本地与服务器数据 (${e?.message || '就绪'})`);
      } finally {
        setLoading(false);
      }
    };
    void loadModule();
  }, [title]);

  const shopItems = useMemo(() => {
    const all = assets.items || [];
    if (shopTab === 'weapons') return all.filter((i) => i.weapon).slice(0, 80);
    if (shopTab === 'avatars') return all.filter((i) => i.avatarCard).slice(0, 80);
    if (shopTab === 'wings') return all.filter((i) => i.attachment).slice(0, 80);
    return all.filter((i) => i.category === 'items' || i.category === 'gestures').slice(0, 80);
  }, [assets.items, shopTab]);

  const filteredAvatarParts = useMemo(() => {
    const kw = partSearch.trim().toLowerCase();
    return avatarParts
      .filter((p) => (partSlotFilter === 'all' || p.slot === partSlotFilter) && (!kw || p.id.toLowerCase().includes(kw) || p.name.toLowerCase().includes(kw)))
      .slice(0, 60);
  }, [avatarParts, partSlotFilter, partSearch]);

  const avatarCardsList = useMemo(() => {
    const cards = (assets.items || []).filter((i) => i.avatarCard).slice(0, 12);
    return cards.length > 0
      ? cards.map((c) => c.name)
      : ['新兵造型卡 · Lv.10', '暗夜刺客卡 · Lv.15', '皇家护卫卡 · Lv.18', '限定传说造型卡 · Lv.1'];
  }, [assets.items]);

  return (
    <div className="lobby-feature-shade" onClick={onClose}>
      <section
        ref={modalRef}
        className="lobby-feature-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lobby-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lobby-feature-header">
          <h2 id="lobby-dialog-title">{title}</h2>
          <div className="lobby-feature-wallet">
            <div>等级: <span>Lv.{character.level ?? 1}</span></div>
            <div>战斗力: <span>{character.power ?? 1500}</span></div>
            <div>金币: <span>{character.coins ?? 100000}</span></div>
            <div>点券: <span>{character.cash ?? 5000}</span></div>
            <div>宝石: <span>{character.gems ?? 200}</span></div>
          </div>
          <button className="lobby-feature-close" aria-label="关闭窗口" onClick={onClose}>×</button>
        </header>

        {toast && <div className="lobby-feature-toast" role="status">{toast}</div>}

        <div className="lobby-feature-body">
          {loading && <div style={{ color: '#94a3b8', fontSize: 13 }}>正在同步 MySQL 8 服务器数据…</div>}

          {/* 公会系统 */}
          {title === '公会' && (
            <>
              {guildsData.myGuild ? (
                <>
                  <div className="lobby-feature-card" style={{ borderColor: '#f59e0b' }}>
                    <div className="lobby-feature-card-info">
                      <strong>当前所属公会：{guildsData.myGuild.name} (Lv.{guildsData.myGuild.level})</strong>
                      <small>会长：{guildsData.myGuild.ownerName} · 成员数：{guildsData.myGuild.memberCount} · 公告：{guildsData.myGuild.notice}</small>
                    </div>
                    <button
                      className="lobby-feature-btn danger"
                      onClick={async () => {
                        await apiFetch('/guilds/leave', { method: 'POST' });
                        const refreshed = await apiFetch('/guilds');
                        setGuildsData(refreshed);
                        notify('Left guild successfully');
                      }}
                    >
                      退出公会
                    </button>
                  </div>
                  {(guildsData.memberList?.length ?? 0) > 0 && (
                    <div className="lobby-feature-grid" style={{ marginBottom: 8 }}>
                      {guildsData.memberList.map((m: any) => (
                        <div key={m.ID || m.userId} className="lobby-feature-card">
                          <div className="lobby-feature-card-info">
                            <strong>{m.username} <span style={{ color: '#38bdf8' }}>({m.role})</span></strong>
                            <small>Contribution: {m.contribution ?? 100}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="lobby-feature-row-form">
                  <input
                    placeholder="输入新公会名称..."
                    value={guildNameInput}
                    onChange={(e) => setGuildNameInput(e.target.value)}
                  />
                  <input
                    placeholder="输入公会宣言..."
                    value={guildNoticeInput}
                    onChange={(e) => setGuildNoticeInput(e.target.value)}
                  />
                  <button
                    className="lobby-feature-btn"
                    onClick={async () => {
                      if (!guildNameInput.trim()) return;
                      try {
                        await apiFetch('/guilds', {
                          method: 'POST',
                          body: JSON.stringify({ name: guildNameInput.trim(), notice: guildNoticeInput.trim() }),
                        });
                        setGuildNameInput('');
                        setGuildNoticeInput('');
                        const refreshed = await apiFetch('/guilds');
                        setGuildsData(refreshed);
                        notify('公会创建成功！');
                      } catch (e: any) {
                        notify(e.message || '创建失败');
                      }
                    }}
                  >
                    创建公会
                  </button>
                </div>
              )}

              <div className="lobby-feature-grid">
                {(guildsData.guilds || []).map((g: any) => (
                  <div key={g.ID || g.id || g.name} className="lobby-feature-card">
                    <div className="lobby-feature-card-info">
                      <strong>{g.name} · Lv.{g.level || 1}</strong>
                      <small>会长: {g.ownerName || '指挥官'} · 人数: {g.memberCount || 1}/50</small>
                      <small>{g.notice}</small>
                    </div>
                    <button
                      className="lobby-feature-btn secondary"
                      disabled={guildsData.myGuild?.ID === g.ID}
                      onClick={async () => {
                        await apiFetch(`/guilds/${g.ID}/join`, { method: 'POST' });
                        const refreshed = await apiFetch('/guilds');
                        setGuildsData(refreshed);
                        notify(`已加入公会【${g.name}】！`);
                      }}
                    >
                      {guildsData.myGuild?.ID === g.ID ? '已加入' : '申请加入'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 任务系统 */}
          {title === '任务' && (
            <div className="lobby-feature-grid">
              {missions.map((m: any) => (
                <div key={m.ID} className="lobby-feature-card">
                  <div className="lobby-feature-card-info">
                    <strong>{m.title} ({m.progress}/{m.target})</strong>
                    <small>{m.description}</small>
                    <small style={{ color: '#fbbf24' }}>奖励: {m.rewardCoins} 金币 · {m.rewardGems} 宝石 · {m.rewardExp} EXP</small>
                  </div>
                  <button
                    className="lobby-feature-btn"
                    disabled={m.claimed}
                    onClick={async () => {
                      try {
                        const res = await apiFetch(`/missions/${m.ID}/claim`, { method: 'POST' });
                        if (res?.character) syncChar(res.character);
                        const updated = await apiFetch('/missions');
                        setMissions(updated);
                        notify(`成功领取任务【${m.title}】奖励！`);
                      } catch (e: any) {
                        notify(e.message || '领取失败');
                      }
                    }}
                  >
                    {m.claimed ? '已领取' : m.progress >= m.target ? '领取奖励' : '立即完成并领取'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 强化系统 (整合 weaponUp.lua + manufactureDepot.lua + playercardinherit.lua) */}
          {title === '强化' && (
            <>
              <div className="lobby-feature-subtabs">
                <button className={enhanceSubTab === 'weaponUp' ? 'active' : ''} onClick={() => setEnhanceSubTab('weaponUp')}>
                  🔨 武器与部位强化 (weaponUp)
                </button>
                <button className={enhanceSubTab === 'manufacture' ? 'active' : ''} onClick={() => setEnhanceSubTab('manufacture')}>
                  ⚙️ 军械制造工坊 (manufactureDepot)
                </button>
                <button className={enhanceSubTab === 'inherit' ? 'active' : ''} onClick={() => setEnhanceSubTab('inherit')}>
                  🔮 角色卡属性传承 (cardInherit)
                </button>
              </div>

              {enhanceSubTab === 'weaponUp' && (
                <>
                  <div className="lobby-feature-card" style={{ borderColor: '#38bdf8', marginBottom: 8 }}>
                    <div className="lobby-feature-card-info">
                      <strong>高纯度强化稳压剂 (原版 weaponUp.lua 保护机制)</strong>
                      <small>开启后每次强化额外消耗 15 宝石，保证 +5 以上高阶强化 100% 成功不掉级，并额外提升 +45 战斗力！</small>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fde047', fontWeight: 700, cursor: 'pointer' }}>
                      <input type="checkbox" checked={useStabilizer} onChange={(e) => setUseStabilizer(e.target.checked)} />
                      启用稳压剂保护
                    </label>
                  </div>
                  <div className="lobby-feature-grid">
                    {enhancements.map((item: any) => {
                      const cost = (item.level + 1) * 1500;
                      const baseRate = item.level < 5 ? 100 : Math.max(35, 100 - (item.level - 4) * 10);
                      return (
                        <div key={item.slotKey} className="lobby-feature-card">
                          <div className="lobby-feature-card-info">
                            <strong>{item.slotName} <span style={{ color: '#38bdf8' }}>+{item.level}</span></strong>
                            <small>附加战力: +{item.bonusPower} · 附加生命: +{item.bonusHp}</small>
                            <small style={{ color: '#fbbf24' }}>
                              消耗: {cost} 金币{useStabilizer ? ' + 15 宝石' : ''} · 成功率: {useStabilizer ? '100% (稳压保护)' : `${baseRate}%`}
                            </small>
                          </div>
                          <button
                            className="lobby-feature-btn"
                            disabled={item.level >= 15}
                            onClick={async () => {
                              try {
                                const res = await apiFetch('/enhance', {
                                  method: 'POST',
                                  body: JSON.stringify({ slotKey: item.slotKey, useStabilizer }),
                                });
                                if (res?.character) syncChar(res.character);
                                const refreshed = await apiFetch('/enhance');
                                if (refreshed?.enhancements) setEnhancements(refreshed.enhancements);
                                notify(res?.message || '强化成功！');
                              } catch (e: any) {
                                notify(e.message || '强化失败');
                              }
                            }}
                          >
                            {item.level >= 15 ? '已满级' : '强化 +1'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {enhanceSubTab === 'manufacture' && (
                <div className="lobby-feature-grid">
                  {MANUFACTURE_BLUEPRINTS.map((bp) => (
                    <div key={bp.id} className="lobby-feature-card">
                      <div className="lobby-feature-card-info">
                        <strong>{bp.itemName} <small style={{ color: '#38bdf8' }}>({bp.id})</small></strong>
                        <small>所需材料：{bp.materials}</small>
                        <small style={{ color: '#fbbf24' }}>
                          锻造费用：{bp.costCoins} 金币 + {bp.costGems} 宝石 · 永久战力 +{bp.bonusPower}
                        </small>
                      </div>
                      <button
                        className="lobby-feature-btn"
                        onClick={async () => {
                          try {
                            const res = await apiFetch('/manufacture', {
                              method: 'POST',
                              body: JSON.stringify({
                                recipeId: bp.id,
                                itemId: bp.itemId,
                                itemName: bp.itemName,
                                category: bp.category,
                                costCoins: bp.costCoins,
                                costGems: bp.costGems,
                                bonusPower: bp.bonusPower,
                              }),
                            });
                            if (res?.character) syncChar(res.character);
                            notify(res?.message || `制造工坊成功锻造【${bp.itemName}】！`);
                          } catch (e: any) {
                            notify(e.message || '制造失败');
                          }
                        }}
                      >
                        立即锻造合成
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {enhanceSubTab === 'inherit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="lobby-feature-card" style={{ borderColor: '#c084fc' }}>
                    <div className="lobby-feature-card-info">
                      <strong>角色卡属性传承室 (还原 playercardinherit.lua)</strong>
                      <small>将旧角色造型卡的强化等级、生命加成与战斗潜能无损转移至新造型卡，立即获得高额战力与经验突破！</small>
                    </div>
                  </div>
                  <div className="lobby-feature-row-form" style={{ flexWrap: 'wrap', gap: 10 }}>
                    <label style={{ color: '#cbd5e1', fontSize: 13 }}>
                      源造型卡 (提供经验)：
                      <select
                        value={sourceCard}
                        onChange={(e) => setSourceCard(e.target.value)}
                        style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, background: '#0f172a', color: '#fff', border: '1px solid #334155' }}
                      >
                        {avatarCardsList.map((c) => <option key={`src-${c}`} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={{ color: '#cbd5e1', fontSize: 13 }}>
                      目标造型卡 (接受传承)：
                      <select
                        value={targetCard}
                        onChange={(e) => setTargetCard(e.target.value)}
                        style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, background: '#0f172a', color: '#fff', border: '1px solid #334155' }}
                      >
                        {avatarCardsList.map((c) => <option key={`dst-${c}`} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fde047', fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={useCrystalInherit} onChange={(e) => setUseCrystalInherit(e.target.checked)} />
                      使用【至尊传承结晶】(100% 完美无损传承 · 消耗 80 宝石，否则消耗 5000 金币 80% 传承)
                    </label>
                    <button
                      className="lobby-feature-btn"
                      onClick={async () => {
                        if (sourceCard === targetCard) {
                          notify('Source card and target card must be different');
                          return;
                        }
                        try {
                          const res = await apiFetch('/card-inherit', {
                            method: 'POST',
                            body: JSON.stringify({
                              sourceCardId: sourceCard,
                              targetCardId: targetCard,
                              useCrystal: useCrystalInherit,
                            }),
                          });
                          if (res?.character) syncChar(res.character);
                          notify(res?.message || 'Card inheritance completed!');
                        } catch (e: any) {
                          notify(e.message || 'Card inheritance failed');
                        }
                      }}
                    >
                      🔮 执行属性传承
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 商城系统 */}
          {(title === '商城' || title === '造型屋') && (
            <>
              <div className="lobby-feature-subtabs">
                <button className={shopTab === 'weapons' ? 'active' : ''} onClick={() => setShopTab('weapons')}>武器军械</button>
                <button className={shopTab === 'avatars' ? 'active' : ''} onClick={() => setShopTab('avatars')}>百变造型卡</button>
                <button className={shopTab === 'wings' ? 'active' : ''} onClick={() => setShopTab('wings')}>炫酷飞翼</button>
                <button className={shopTab === 'items' ? 'active' : ''} onClick={() => setShopTab('items')}>战术道具</button>
                <button className={shopTab === 'parts' ? 'active' : ''} onClick={() => setShopTab('parts')}>🧩 1392件解密3D部件</button>
              </div>
              {shopTab === 'parts' ? (
                <>
                  <div className="lobby-feature-row-form" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {[
                      ['all', '全部部位(1392)'],
                      ['hair', '发型'],
                      ['helmet', '头盔/帽'],
                      ['mask', '面具/脸饰'],
                      ['cloth', '上衣战甲'],
                      ['pant', '下装战裤'],
                      ['shoulder', '肩甲'],
                      ['wrist', '护腕'],
                      ['gloves', '战术手套'],
                      ['boot', '战靴'],
                    ].map(([slotKey, slotName]) => (
                      <button
                        key={slotKey}
                        className={`lobby-feature-btn ${partSlotFilter === slotKey ? '' : 'secondary'}`}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => setPartSlotFilter(slotKey)}
                      >
                        {slotName}
                      </button>
                    ))}
                    <input
                      placeholder="搜索 1392 件解密 3D 部件编号或名称..."
                      value={partSearch}
                      onChange={(e) => setPartSearch(e.target.value)}
                      style={{ maxWidth: 240, marginLeft: 'auto' }}
                    />
                  </div>
                  <div className="lobby-feature-grid">
                    {filteredAvatarParts.map((part: any, idx: number) => {
                      const price = 1800 + (idx % 4) * 600;
                      return (
                        <div key={part.id} className="lobby-feature-card">
                          <div className="lobby-feature-card-info" style={{ flex: 1 }}>
                            <strong>{part.name}</strong>
                            <small>部位: {part.slotLabel || part.slot} · 3D网格: {part.id}.glb</small>
                            <small style={{ color: '#fbbf24' }}>售价: {price} 金币</small>
                          </div>
                          <button
                            className="lobby-feature-btn"
                            onClick={async () => {
                              try {
                                const res = await apiFetch('/shop/buy', {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    itemId: part.id,
                                    itemName: part.name,
                                    category: 'avatars',
                                    price,
                                    currency: 'coins',
                                  }),
                                });
                                if (res?.character) syncChar(res.character);
                              } catch {
                                // Still allow 3D live preview even if offline
                              }
                              // 根据换装部位槽位自动匹配原版换装间专属展示动作 (09_换装间与结算卡牌动作)
                              const slotAnimMap: Record<string, string> = {
                                hair: 'animations/avatar/hair.json',
                                helmet: 'animations/avatar/helmet.json',
                                mask: 'animations/avatar/beardb.json',
                                cloth: 'animations/avatar/coat.json',
                                pant: 'animations/avatar/pants.json',
                                shoulder: 'animations/avatar/trinket_coat.json',
                                wrist: 'animations/avatar/gloves_a.json',
                                gloves: 'animations/avatar/gloves.json',
                                boot: 'animations/avatar/shoesc.json',
                              };
                              const dressingAnim = slotAnimMap[part.slot] || 'animations/avatar/trinket.json';
                              onSelectBagItem?.({
                                id: part.id,
                                name: part.name,
                                category: 'avatars',
                                icon: 'icons/avatar_card01.png',
                                attachment: {
                                  id: part.id,
                                  model: part.modelUrl,
                                  texture: part.textureUrl,
                                  bone: 'avatar_part',
                                  animation: null,
                                  characterAnimation: dressingAnim,
                                },
                              });
                              notify(`已穿戴解密 3D 部件【${part.name}】至大厅角色模型！`);
                            }}
                          >
                            穿戴3D预览
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="lobby-feature-grid">
                  {shopItems.map((item, idx) => {
                    const price = 2500 + (idx % 5) * 800;
                    const ownedCount = ownedInventory.find((inv: any) => inv.itemId === item.id)?.count ?? 0;
                    return (
                      <div key={item.id} className="lobby-feature-card">
                        <img src={lobbyUrl(item.icon)} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
                        <div className="lobby-feature-card-info" style={{ flex: 1 }}>
                          <strong>{item.name} {ownedCount > 0 && <span style={{ color: '#34d399', fontSize: 11 }}>(x{ownedCount})</span>}</strong>
                          <small>编号: {item.id} · 购买立享战力 +80</small>
                          <small style={{ color: '#fbbf24' }}>售价: {price} 金币</small>
                        </div>
                        <button
                          className="lobby-feature-btn"
                          onClick={async () => {
                            try {
                              const res = await apiFetch('/shop/buy', {
                                method: 'POST',
                                body: JSON.stringify({
                                  itemId: item.id,
                                  itemName: item.name,
                                  category: item.category,
                                  price,
                                  currency: 'coins',
                                }),
                              });
                              if (res?.character) syncChar(res.character);
                              if (res?.item) {
                                setOwnedInventory((prev) => {
                                  const exists = prev.some((it: any) => it.itemId === item.id);
                                  return exists
                                    ? prev.map((it: any) => (it.itemId === item.id ? res.item : it))
                                    : [res.item, ...prev];
                                });
                              }
                              onSelectBagItem?.(item);
                              notify(res?.status || 'Item purchased and equipped!');
                            } catch (e: any) {
                              notify(e.message || 'Purchase failed');
                            }
                          }}
                        >
                          购买并穿戴
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* 拍卖行系统 */}
          {title === '拍卖行' && (
            <>
              <div className="lobby-feature-row-form">
                <input
                  placeholder="上架物品名称 (如：黄金加特林)..."
                  value={auctionItemName}
                  onChange={(e) => setAuctionItemName(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="一口价金币..."
                  value={auctionPrice}
                  onChange={(e) => setAuctionPrice(e.target.value)}
                  style={{ maxWidth: 140 }}
                />
                <button
                  className="lobby-feature-btn secondary"
                  onClick={async () => {
                    if (!auctionItemName.trim()) return;
                    try {
                      await apiFetch('/auction/list', {
                        method: 'POST',
                        body: JSON.stringify({
                          itemId: 'custom_item',
                          itemName: auctionItemName.trim(),
                          category: 'equipment',
                          priceCoins: Number(auctionPrice) || 5000,
                        }),
                      });
                      setAuctionItemName('');
                      const updated = await apiFetch('/auction');
                      setAuctionList(updated);
                      notify('物品已成功上架至全服拍卖行！');
                    } catch (e: any) {
                      notify(e.message || '上架失败');
                    }
                  }}
                >
                  上架拍品
                </button>
              </div>
              <div className="lobby-feature-grid">
                {auctionList.map((entry: any) => (
                  <div key={entry.ID} className="lobby-feature-card">
                    <div className="lobby-feature-card-info">
                      <strong>{entry.itemName}</strong>
                      <small>卖家: {entry.sellerName || '系统商会'}</small>
                      <small style={{ color: '#fbbf24' }}>一口价: {entry.priceCoins} 金币</small>
                    </div>
                    <button
                      className="lobby-feature-btn"
                      onClick={async () => {
                        try {
                          const res = await apiFetch(`/auction/${entry.ID}/buy`, { method: 'POST' });
                          if (res?.character) syncChar(res.character);
                          const updated = await apiFetch('/auction');
                          setAuctionList(updated);
                          notify(res?.status || '竞拍成功！');
                        } catch (e: any) {
                          notify(e.message || '竞拍失败');
                        }
                      }}
                    >
                      立即竞拍
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 排行榜系统 */}
          {title === '排行榜' && (
            <table className="lobby-feature-table">
              <thead>
                <tr>
                  <th>名次</th>
                  <th>角色名称</th>
                  <th>职业</th>
                  <th>等级</th>
                  <th>战斗力</th>
                  <th>军衔积分</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row: any, idx: number) => (
                  <tr key={row.ID || idx}>
                    <td style={{ fontWeight: 'bold', color: idx < 3 ? '#fbbf24' : '#e2e8f0' }}>#{idx + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.jobId}</td>
                    <td>Lv.{row.level || 1}</td>
                    <td>{row.power || 1500}</td>
                    <td style={{ color: '#38bdf8', fontWeight: 700 }}>{row.rating || 1200}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 签到系统 */}
          {title === '签到' && (
            <>
              <div className="lobby-feature-card" style={{ borderColor: '#f59e0b' }}>
                <div className="lobby-feature-card-info">
                  <strong>累计连续签到：{character.signInStreak ?? 0} 天</strong>
                  <small>每日签到可领取海量金币、稀有宝石与角色经验，连续签到额外递增 500 金币！</small>
                </div>
                <button
                  className="lobby-feature-btn"
                  onClick={async () => {
                    try {
                      const res = await apiFetch('/signin', { method: 'POST' });
                      if (res?.character) syncChar(res.character);
                      notify(res?.message || '签到成功！');
                    } catch (e: any) {
                      notify(e.message || '签到失败');
                    }
                  }}
                >
                  立即签到打卡
                </button>
              </div>
              <div className="lobby-feature-grid">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <div key={day} className="lobby-feature-card">
                    <div className="lobby-feature-card-info">
                      <strong>第 {day} 天签到补给</strong>
                      <small>奖励: {3000 + day * 500} 金币 + 30 宝石 + 100 EXP</small>
                    </div>
                    <span style={{ color: (character.signInStreak ?? 0) >= day ? '#34d399' : '#94a3b8', fontWeight: 700 }}>
                      {(character.signInStreak ?? 0) >= day ? '已达成' : '待解锁'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 军衔、活动、幸运寻宝 (luckDraw.lua) 与 冒险远征 (expedition.lua) */}
          {(title === '军衔' || title === '活动' || title === '幸运寻宝' || title === '冒险远征') && (
            <>
              <div className="lobby-feature-subtabs">
                <button className={activitySubTab === 'luckdraw' ? 'active' : ''} onClick={() => setActivitySubTab('luckdraw')}>
                  🎲 幸运寻宝大转盘 (luckDraw 42格)
                </button>
                <button className={activitySubTab === 'expedition' ? 'active' : ''} onClick={() => setActivitySubTab('expedition')}>
                  👹 冒险远征首领讨伐 (expedition 5关)
                </button>
                <button className={activitySubTab === 'rank' ? 'active' : ''} onClick={() => setActivitySubTab('rank')}>
                  🎖️ 生涯军衔与战绩
                </button>
              </div>

              {activitySubTab === 'luckdraw' && (
                <div>
                  <div className="lobby-feature-card" style={{ borderColor: '#fbbf24', marginBottom: 10 }}>
                    <div className="lobby-feature-card-info">
                      <strong>
                        🎲 幸运寻宝 42 格环游棋盘 (还原 gui/lua/luckDraw.lua) · 当前位置：第 {(luckDrawState.position ?? 0) + 1}/42 格 · 已完成 {luckDrawState.laps ?? 0} 圈
                      </strong>
                      <small>
                        今日剩余免费次数：{luckDrawState.freeRollsLeft ?? 0} 次（超出后每次消耗 20 宝石）。每完成一整圈额外奖赏 +10,000 金币与 +50 宝石！
                      </small>
                      <small style={{ color: '#38bdf8' }}>
                        Stamina: {luckDrawState.stamina ?? 100} / 100
                      </small>
                    </div>
                    <button
                      className="lobby-feature-btn"
                      onClick={async () => {
                        try {
                          const res = await apiFetch('/luckdraw/roll', { method: 'POST' });
                          if (res) {
                            setLuckDrawState((prev: any) => ({ ...prev, ...res }));
                            if (res.character) syncChar(res.character);
                            notify(res.message || `投出 ${res.dice} 点，获得丰厚寻宝奖励！`);
                          }
                        } catch (e: any) {
                          notify(e.message || '投掷失败');
                        }
                      }}
                    >
                      🎲 投掷寻宝骰子 {luckDrawState.lastDice ? `(上次: ${luckDrawState.lastDice}点)` : ''}
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                      gap: 6,
                      maxHeight: 300,
                      overflowY: 'auto',
                      padding: 4,
                    }}
                  >
                    {(luckDrawState.board || []).slice(0, 42).map((tile: any, idx: number) => {
                      const isCurrent = (luckDrawState.position ?? 0) === idx;
                      const isJackpot = idx % 7 === 0;
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '7px 6px',
                            borderRadius: 8,
                            border: isCurrent
                              ? '2px solid #facc15'
                              : isJackpot
                              ? '1px solid rgba(244,114,182,0.6)'
                              : '1px solid rgba(148,163,184,0.25)',
                            background: isCurrent
                              ? 'rgba(250,204,21,0.24)'
                              : isJackpot
                              ? 'rgba(131,24,67,0.35)'
                              : 'rgba(15,23,42,0.75)',
                            textAlign: 'center',
                            fontSize: 11,
                          }}
                        >
                          <div style={{ fontWeight: 800, color: isCurrent ? '#fde047' : '#94a3b8' }}>
                            #{idx + 1} {isCurrent ? '📍当前' : ''}
                          </div>
                          <div style={{ color: isJackpot ? '#f472b6' : '#e2e8f0', fontWeight: 700, marginTop: 2 }}>
                            {tile.name || tile.label || (isJackpot ? '🎁 至尊秘宝' : idx % 2 === 0 ? '🪙 金币袋' : '💎 宝石箱')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activitySubTab === 'expedition' && (
                <div className="lobby-feature-grid">
                  {EXPEDITION_STAGES.map((st) => (
                    <div key={st.id} className="lobby-feature-card" style={{ borderColor: 'rgba(248,113,113,0.45)' }}>
                      <div className="lobby-feature-card-info">
                        <strong>👹 {st.name} · <span style={{ color: '#f87171' }}>{st.bossName}</span></strong>
                        <small>首领生命值：{st.hp.toLocaleString()} HP · 推荐战力：{st.recPower} · 作战地图：{st.mapId}</small>
                        <small style={{ color: '#fbbf24' }}>通关掉落：{st.drop}</small>
                      </div>
                      <button
                        className="lobby-feature-btn"
                        onClick={async () => {
                          try {
                            const res = await apiFetch('/expedition/start', {
                              method: 'POST',
                              body: JSON.stringify({ stageId: st.id }),
                            });
                            if (res?.room && onStartRoom) {
                              onClose();
                              onStartRoom(res.room);
                              return;
                            }
                          } catch {}
                          if (onStartRoom) {
                            onClose();
                            onStartRoom({
                              id: `expedition-${st.id}`,
                              name: st.name,
                              password: '',
                              maxPlayers: 4,
                              balanceTeams: false,
                              modeId: 'boss',
                              modeName: '远征首领战',
                              mapId: st.mapId,
                              mapName: st.name,
                            });
                          } else {
                            notify(`已解锁远征关卡【${st.name}】！`);
                          }
                        }}
                      >
                        ⚔️ 立即远征讨伐
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {activitySubTab === 'rank' && (
                <>
                  <div className="lobby-feature-card" style={{ borderColor: '#38bdf8' }}>
                    <div className="lobby-feature-card-info">
                      <strong>当前军衔：{matchesData.rankTitle} （积分：{character.rating ?? 1200}）</strong>
                      <small>{matchesData.rankDesc || '参与练习赛、快速匹配或击败敌人即可提升军衔积分'}</small>
                      <small style={{ color: '#fbbf24' }}>
                        生涯战绩：{matchesData.totalGames} 场 · 胜场：{matchesData.totalWins} · 累计击败：{matchesData.totalKills}
                      </small>
                    </div>
                    <button
                      className="lobby-feature-btn"
                      onClick={async () => {
                        const res = await apiFetch('/character/online-reward', { method: 'POST' });
                        if (res?.character) syncChar(res.character);
                        notify('成功领取军衔战备津贴：+2500 金币、+20 宝石！');
                      }}
                    >
                      领取军衔津贴
                    </button>
                  </div>

                  {matchesData.records?.length > 0 && (
                    <table className="lobby-feature-table">
                      <thead>
                        <tr>
                          <th>模式</th>
                          <th>地图</th>
                          <th>结果</th>
                          <th>击败/阵亡</th>
                          <th>奖励金币</th>
                          <th>积分变化</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchesData.records.map((rec: any, i: number) => (
                          <tr key={rec.ID || i}>
                            <td>{rec.modeName}</td>
                            <td>{rec.mapName}</td>
                            <td style={{ color: rec.result === 'Victory' ? '#34d399' : '#f87171', fontWeight: 700 }}>{rec.result}</td>
                            <td>{rec.kills} / {rec.deaths}</td>
                            <td>+{rec.rewardCoins}</td>
                            <td>{rec.ratingDelta >= 0 ? `+${rec.ratingDelta}` : rec.ratingDelta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </>
          )}

          {/* 好友系统 */}
          {title === '好友' && (
            <>
              <div className="lobby-feature-row-form">
                <input
                  placeholder="输入玩家角色名称添加好友..."
                  value={friendNameInput}
                  onChange={(e) => setFriendNameInput(e.target.value)}
                />
                <button
                  className="lobby-feature-btn"
                  onClick={async () => {
                    if (!friendNameInput.trim()) return;
                    try {
                      const res = await apiFetch('/friends', {
                        method: 'POST',
                        body: JSON.stringify({ friendName: friendNameInput.trim() }),
                      });
                      setFriendNameInput('');
                      const refreshed = await apiFetch('/friends');
                      setFriendsData(refreshed);
                      notify(res?.status || '好友添加成功！');
                    } catch (e: any) {
                      notify(e.message || '未找到该玩家');
                    }
                  }}
                >
                  添加好友
                </button>
              </div>

              <div className="lobby-feature-grid">
                {(friendsData.friends || []).map((f: any) => (
                  <div key={f.ID} className="lobby-feature-card">
                    <div className="lobby-feature-card-info">
                      <strong>好友：{f.friendName || `战友 #${f.friendId}`}</strong>
                      <small style={{ color: '#34d399' }}>状态：在线 ({f.status})</small>
                    </div>
                    <button
                      className="lobby-feature-btn danger"
                      onClick={async () => {
                        await apiFetch(`/friends/${f.ID}`, { method: 'DELETE' });
                        const refreshed = await apiFetch('/friends');
                        setFriendsData(refreshed);
                        notify('已删除好友');
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
                {(friendsData.recommended || []).map((rec: any) => (
                  <div key={`rec-${rec.ID}`} className="lobby-feature-card">
                    <div className="lobby-feature-card-info">
                      <strong>推荐战友：{rec.name} (Lv.{rec.level || 1})</strong>
                      <small>职业: {rec.jobId} · 军衔积分: {rec.rating || 1200}</small>
                    </div>
                    <button
                      className="lobby-feature-btn secondary"
                      onClick={async () => {
                        await apiFetch('/friends', {
                          method: 'POST',
                          body: JSON.stringify({ friendName: rec.name }),
                        });
                        const refreshed = await apiFetch('/friends');
                        setFriendsData(refreshed);
                        notify(`已添加【${rec.name}】为好友！`);
                      }}
                    >
                      加为好友
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 邮件系统 */}
          {title === '邮件' && (
            <>
              <div className="lobby-feature-row-form">
                <input placeholder="收件人角色名..." value={mailReceiver} onChange={(e) => setMailReceiver(e.target.value)} style={{ maxWidth: 150 }} />
                <input placeholder="邮件标题..." value={mailTitle} onChange={(e) => setMailTitle(e.target.value)} style={{ maxWidth: 180 }} />
                <input placeholder="邮件正文内容..." value={mailContent} onChange={(e) => setMailContent(e.target.value)} />
                <button
                  className="lobby-feature-btn secondary"
                  onClick={async () => {
                    if (!mailReceiver.trim() || !mailTitle.trim()) return;
                    try {
                      await apiFetch('/mail/send', {
                        method: 'POST',
                        body: JSON.stringify({
                          receiverName: mailReceiver.trim(),
                          title: mailTitle.trim(),
                          content: mailContent.trim() || '战友你好，一起来打练习赛吧！',
                        }),
                      });
                      setMailTitle('');
                      setMailContent('');
                      notify(`邮件已发送给【${mailReceiver}】！`);
                    } catch (e: any) {
                      notify(e.message || '发送失败');
                    }
                  }}
                >
                  发送邮件
                </button>
              </div>

              {mails.map((m: any) => (
                <div key={m.ID} className="lobby-feature-card">
                  <div className="lobby-feature-card-info">
                    <strong>{m.title} <small style={{ color: '#38bdf8' }}>来自: {m.senderName || '系统'}</small></strong>
                    <small>{m.content}</small>
                    {m.attachment && <small style={{ color: '#fbbf24' }}>附件: {m.attachment}</small>}
                  </div>
                  <button
                    className="lobby-feature-btn"
                    disabled={m.isClaimed && m.isRead}
                    onClick={async () => {
                      try {
                        if (!m.isClaimed && (m.rewardCoins > 0 || m.rewardGems > 0)) {
                          const res = await apiFetch(`/mail/${m.ID}/claim`, { method: 'POST' });
                          if (res?.character) syncChar(res.character);
                          notify(`已领取邮件附件：+${m.rewardCoins} 金币，+${m.rewardGems} 宝石！`);
                        } else {
                          await apiFetch(`/mail/${m.ID}/read`, { method: 'POST' });
                          notify('已阅读邮件');
                        }
                        const refreshed = await apiFetch('/mail');
                        setMails(refreshed);
                      } catch (e: any) {
                        notify(e.message || '操作失败');
                      }
                    }}
                  >
                    {!m.isClaimed && (m.rewardCoins > 0 || m.rewardGems > 0) ? '领取附件' : m.isRead ? '已读' : '标记已读'}
                  </button>
                </div>
              ))}
            </>
          )}

          {/* 在线充值 */}
          {title === '在线充值' && (
            <div className="lobby-feature-grid">
              {RECHARGE_PACKAGES.map((pkg) => (
                <div key={pkg.id} className="lobby-feature-card">
                  <div className="lobby-feature-card-info">
                    <strong>{pkg.name} · <span style={{ color: '#34d399' }}>{pkg.price}</span> ({pkg.tag})</strong>
                    <small>立得 {pkg.cash} 点券 + {pkg.gems} 宝石 + {pkg.coins} 金币</small>
                  </div>
                  <button
                    className="lobby-feature-btn"
                    onClick={async () => {
                      const res = await apiFetch('/character/recharge', {
                        method: 'POST',
                        body: JSON.stringify({ cash: pkg.cash, gems: pkg.gems, coins: pkg.coins }),
                      });
                      if (res?.character) syncChar(res.character);
                      notify(res?.message || '充值成功！');
                    }}
                  >
                    立即充值
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 在线奖励 */}
          {title === '在线奖励' && (
            <div className="lobby-feature-card" style={{ borderColor: '#34d399' }}>
              <div className="lobby-feature-card-info">
                <strong>阿瓦塔战地在线补给箱（已领 {character.onlineClaimCount ?? 0} 次）</strong>
                <small>保持在线即可无限次领取军需物资：每次立得 2500 金币 + 20 宝石 + 80 经验值！</small>
              </div>
              <button
                className="lobby-feature-btn"
                onClick={async () => {
                  const res = await apiFetch('/character/online-reward', { method: 'POST' });
                  if (res?.character) syncChar(res.character);
                  notify(res?.message || '领取成功！');
                }}
              >
                立即领取补给
              </button>
            </div>
          )}

          {/* 宠物系统 */}
          {title === '宠物' && (
            <div className="lobby-feature-grid">
              {PET_LIST.map((pet) => (
                <div key={pet.id} className="lobby-feature-card">
                  <div className="lobby-feature-card-info">
                    <strong>{pet.name}</strong>
                    <small>{pet.desc}</small>
                    <small style={{ color: '#fbbf24' }}>出战加成：战斗力 +{pet.bonusPower}</small>
                  </div>
                  <button
                    className="lobby-feature-btn"
                    onClick={async () => {
                      setActivePet(pet.id);
                      try { localStorage.setItem('avatarstar.activePet', pet.modelId); } catch {}
                      onSelectBagItem?.({
                        id: pet.id,
                        name: pet.name,
                        category: 'equipment',
                        icon: 'icons/pet_skill01.png',
                        attachment: {
                          id: pet.id,
                          model: `../gameplay/mesh/pet/${pet.modelId}.mesh.glb`,
                          texture: pet.texture,
                          bone: 'pet',
                          animation: `../gameplay/animations/pet/${pet.modelId}/idle.json`,
                          characterAnimation: null,
                        },
                      });
                      const res = await apiFetch('/character/online-reward', { method: 'POST' });
                      if (res?.character) syncChar(res.character);
                      notify(`已安排【${pet.name}】3D 出战跟随，战斗力大幅提升！`);
                    }}
                  >
                    {activePet === pet.id ? '出战中 · 3D预览/喂食' : '召唤3D出战'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="lobby-feature-footer">
          <button className="lobby-dialog-close lobby-feature-btn" onClick={onClose}>确定</button>
        </footer>
      </section>
    </div>
  );
}
