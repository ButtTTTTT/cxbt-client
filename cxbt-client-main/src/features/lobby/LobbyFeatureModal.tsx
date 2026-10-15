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
  { id: 'pet_dog', name: '机械战犬 · 雷克斯', desc: '全天候侦察型机械伙伴，提升主人护甲穿透与生命上限', bonusPower: 180 },
  { id: 'pet_dragon', name: '星际幼龙 · 烈焰', desc: '来自阿瓦塔火山带的稀有飞龙，喷射高能等离子吐息', bonusPower: 260 },
  { id: 'pet_fairy', name: '治愈光灵 · 露娜', desc: '纳米医疗伴侣，持续提供战地生命恢复与护盾充能', bonusPower: 220 },
];

export default function LobbyFeatureModal({
  title,
  assets,
  character,
  onUpdateCharacter,
  onSelectBagItem,
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
  const [shopTab, setShopTab] = useState<'weapons' | 'avatars' | 'wings' | 'items'>('weapons');
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
  const [activePet, setActivePet] = useState<string>('pet_dog');

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
    const loadModule = async () => {
      try {
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
        } else if (title === '军衔' || title === '活动') {
          const data = await apiFetch('/matches');
          if (data) {
            setMatchesData(data);
            if (data.character) syncChar(data.character);
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
    if (shopTab === 'weapons') return all.filter((i) => i.weapon).slice(0, 16);
    if (shopTab === 'avatars') return all.filter((i) => i.avatarCard).slice(0, 16);
    if (shopTab === 'wings') return all.filter((i) => i.attachment).slice(0, 16);
    return all.filter((i) => i.category === 'items' || i.category === 'gestures').slice(0, 16);
  }, [assets.items, shopTab]);

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
                      notify('已退出公会');
                    }}
                  >
                    退出公会
                  </button>
                </div>
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

          {/* 强化系统 */}
          {title === '强化' && (
            <div className="lobby-feature-grid">
              {enhancements.map((item: any) => {
                const cost = (item.level + 1) * 1500;
                return (
                  <div key={item.slotKey} className="lobby-feature-card">
                    <div className="lobby-feature-card-info">
                      <strong>{item.slotName} <span style={{ color: '#38bdf8' }}>+{item.level}</span></strong>
                      <small>附加战力: +{item.bonusPower} · 附加生命: +{item.bonusHp}</small>
                      <small style={{ color: '#fbbf24' }}>下级强化消耗: {cost} 金币 (成功率 100%)</small>
                    </div>
                    <button
                      className="lobby-feature-btn"
                      disabled={item.level >= 15}
                      onClick={async () => {
                        try {
                          const res = await apiFetch('/enhance', {
                            method: 'POST',
                            body: JSON.stringify({ slotKey: item.slotKey }),
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
          )}

          {/* 商城系统 */}
          {title === '商城' && (
            <>
              <div className="lobby-feature-subtabs">
                <button className={shopTab === 'weapons' ? 'active' : ''} onClick={() => setShopTab('weapons')}>武器军械</button>
                <button className={shopTab === 'avatars' ? 'active' : ''} onClick={() => setShopTab('avatars')}>百变造型卡</button>
                <button className={shopTab === 'wings' ? 'active' : ''} onClick={() => setShopTab('wings')}>炫酷飞翼</button>
                <button className={shopTab === 'items' ? 'active' : ''} onClick={() => setShopTab('items')}>战术道具</button>
              </div>
              <div className="lobby-feature-grid">
                {shopItems.map((item, idx) => {
                  const price = 2500 + (idx % 5) * 800;
                  return (
                    <div key={item.id} className="lobby-feature-card">
                      <img src={lobbyUrl(item.icon)} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
                      <div className="lobby-feature-card-info" style={{ flex: 1 }}>
                        <strong>{item.name}</strong>
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
                            onSelectBagItem?.(item);
                            notify(`成功入手【${item.name}】并已穿戴预览！`);
                          } catch (e: any) {
                            notify(e.message || '购买失败');
                          }
                        }}
                      >
                        购买并穿戴
                      </button>
                    </div>
                  );
                })}
              </div>
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

          {/* 军衔与活动系统 */}
          {(title === '军衔' || title === '活动') && (
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
                      const res = await apiFetch('/character/online-reward', { method: 'POST' });
                      if (res?.character) syncChar(res.character);
                      notify(`已安排【${pet.name}】出战跟随，战斗力大幅提升！`);
                    }}
                  >
                    {activePet === pet.id ? '出战中 · 喂食强化' : '召唤出战'}
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
