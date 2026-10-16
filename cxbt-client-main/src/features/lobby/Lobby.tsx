import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import CharacterPreview from '../characterCreation/CharacterPreview';
import { assetUrl, CREATION_JOBS, initialAppearance, loadCreationAssets, type Appearance, type CreationAssets, type CreationAttachment, type CreationJob, type CreationWeapon } from '../characterCreation/assets';
import { fetchCharacterFromServer, type SavedCharacter } from '../characterCreation/character';
import GameModeLobby from '../gameMode/GameModeLobby';
import PracticeRoom, { type ApiRoom } from '../gameMode/PracticeRoom';
import type { RoomConfig } from '../gameMode/CreateRoomDialog';
import Gameplay from '../gameplay/Gameplay';
import { loadLobbyAssets, lobbyUrl, type AvatarCard, type InventoryCategory, type InventoryItem, type LobbyAssets } from './assets';
import GlobalChat from './GlobalChat';
import LobbyFeatureModal from './LobbyFeatureModal';
import SettingsMenu from './SettingsMenu';
import SkillPanel from './SkillPanel';
import { loadSkillAssets, useSkillAllocation, type SkillAssets } from './skills';
import './Lobby.css';

const PAGE_SIZE = 24;
const NO_WEAPONS: CreationWeapon[] = [];
const MUSIC_BASE = `${import.meta.env.BASE_URL}assets/lobby/`;
const WEAPON_AUDIO_BASE = `${import.meta.env.BASE_URL}assets/gameplay/audio/`;
const TABS: { id: InventoryCategory; label: string; icon: string }[] = [
  { id: 'equipment', label: '装备', icon: 'tabEquipment' },
  { id: 'items', label: '道具', icon: 'tabItems' },
  { id: 'gestures', label: '表情', icon: 'tabGestures' },
  { id: 'avatars', label: '造型卡', icon: 'tabAvatars' },
];
const MENUS = [['info', '角色'], ['guild', '公会'], ['mission', '任务'], ['enhance', '强化'],
  ['shop', '商城'], ['avatar', '造型屋'], ['auction', '拍卖行'], ['rank', '排行榜']];
const FOOTER = [['message', '聊天'], ['huodong', '活动'], ['junxian', '军衔'], ['sign', '签到'],
  ['friend', '好友'], ['mail', '邮件'], ['setup', '设置']];
const QUICK_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

function validAppearance(assets: CreationAssets, character: SavedCharacter): Appearance {
  const gender = character.appearance.gender === 1 ? 1 : 0;
  const preset = assets.jobs[character.jobId].presets[gender];
  const fallback = initialAppearance(preset, gender);
  const saved = character.appearance;
  return { gender, hair: saved.hair < preset.hair.length ? saved.hair : fallback.hair,
    eyes: saved.eyes < preset.eyes.length ? saved.eyes : 0,
    mouth: saved.mouth < preset.mouths.length ? saved.mouth : 0,
    accessory: saved.accessory < preset.accessorySets.length ? saved.accessory : fallback.accessory };
}

export default function Lobby({ character, onExit, onQuit = onExit }: { character: SavedCharacter; onExit: () => void; onQuit?: () => void }) {
  const [charState, setCharState] = useState<SavedCharacter>(character);
  const [creation, setCreation] = useState<CreationAssets>();
  const [assets, setAssets] = useState<LobbyAssets>();
  const [skillAssets, setSkillAssets] = useState<SkillAssets>();
  const [page, setPage] = useState<'bag' | 'skill'>('bag');
  const [skillTab, setSkillTab] = useState<'profession' | 'boss'>('profession');
  const [error, setError] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('equipment');
  const [bagPage, setBagPage] = useState(0);
  const [query, setQuery] = useState('');
  const [sorted, setSorted] = useState(false);
  const [selected, setSelected] = useState<InventoryItem>();
  const [weaponId, setWeaponId] = useState<string>();
  const [attachment, setAttachment] = useState<CreationAttachment>();
  const [animation, setAnimation] = useState<string>();
  const [appearance, setAppearance] = useState(character.appearance);
  const [previewJob, setPreviewJob] = useState<CreationJob>(character.jobId);
  const [avatarCard, setAvatarCard] = useState<AvatarCard>();
  const [rotation, setRotation] = useState(0);
  const [revision, setRevision] = useState(0);
  const [motion, setMotion] = useState(true);
  const [volume, setVolume] = useState(1);
  const [effectsVolume, setEffectsVolume] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [dialog, setDialog] = useState<{ title: string; message?: string }>();
  const [gameModeLobby, setGameModeLobby] = useState(false);
  const [practiceRoom, setPracticeRoom] = useState(false);
  const [quickJoinedRoom, setQuickJoinedRoom] = useState<ApiRoom>();
  const [battleRoom, setBattleRoom] = useState<RoomConfig>();
  const [globalChatOpen, setGlobalChatOpen] = useState(false);
  const [quickbar, setQuickbar] = useState<(string | null)[]>([]);
  const [status, setStatus] = useState('');
  const allocation = useSkillAllocation(skillAssets, character.jobId);
  // The cache keeps an unnamed item for every skill icon, so the hotbar resolves
  // the current class's own skills before falling back to the inventory item.
  const jobSkills = useMemo(() => new Map((skillAssets?.jobs[character.jobId]?.skills ?? [])
    .map((skill) => [skill.id, skill])), [skillAssets, character.jobId]);
  const jobSkillList = useMemo(() => skillAssets?.jobs[character.jobId]?.skills ?? [], [skillAssets, character.jobId]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const weaponAudioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const musicTrack = gameModeLobby || practiceRoom ? 'music-fortress' : 'music-lobby';

  useEffect(() => {
    setCharState(character);
    void fetchCharacterFromServer().then((latest) => {
      if (latest) setCharState(latest);
    });
  }, [character]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([loadCreationAssets(controller.signal), loadLobbyAssets(controller.signal), loadSkillAssets(controller.signal)])
      .then(([config, catalogue, skills]) => {
      if (controller.signal.aborted) return;
      setCreation(config);
      setAssets(catalogue);
      setSkillAssets(skills);
      setAppearance(validAppearance(config, character));
      let savedCard: string | null = null;
      try { savedCard = localStorage.getItem(`avatarstar.skin.${character.userId}.${character.name}`); } catch { /* Storage can be disabled. */ }
      const card = catalogue.items.find((item) => item.avatarCard?.id === savedCard)?.avatarCard;
      setAvatarCard(card);
      if (card) setAppearance(initialAppearance(card.preset, character.appearance.gender));
      const defaults = config.jobs[character.jobId].weapons.map((weapon) => weapon.id);
      setQuickbar(Array.from({ length: 12 }, (_, index) => defaults[index] ?? null));
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, [character]);
  useEffect(() => {
    const resize = () => setScale(Math.min(innerWidth / (practiceRoom ? 1200 : 1440), innerHeight / 900));
    resize();
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, [practiceRoom]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (weaponAudioRef.current) weaponAudioRef.current.volume = effectsVolume;
  }, [volume, effectsVolume, assets]);
  useEffect(() => () => { weaponAudioRef.current?.pause(); }, [battleRoom]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || battleRoom) return;
    audio.load();
    void audio.play().catch(() => undefined);
  }, [musicTrack, battleRoom, assets, creation]);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setDialog(undefined); }
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button, input');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', keydown);
    return () => {
      removeEventListener('keydown', keydown);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [dialog]);

  const previewWeapons = useMemo(() => weaponId && assets?.weapons[weaponId] ? [assets.weapons[weaponId]] : NO_WEAPONS, [weaponId, assets]);
  const battleWeapons = useMemo(() => quickbar.filter((id): id is string => Boolean(id)), [quickbar]);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const items = assets?.items.filter((item) => item.category === category && (!search || `${item.name} ${item.id}`.toLocaleLowerCase().includes(search))) ?? [];
    return sorted ? [...items].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true })) : items;
  }, [assets, category, query, sorted]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(bagPage, pageCount - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const chooseItem = (item: InventoryItem) => {
    setSelected(item);
    if (item.avatarCard) {
      setAvatarCard(item.avatarCard);
      setPreviewJob(character.jobId);
      setAppearance(initialAppearance(item.avatarCard.preset, character.appearance.gender));
      try { localStorage.setItem(`avatarstar.skin.${character.userId}.${character.name}`, item.avatarCard.id); } catch { /* Keep the current selection in memory. */ }
      setStatus(`${item.name} · 已切换造型`);
      return;
    }
    setWeaponId(undefined);
    setAttachment(undefined);
    setAnimation(undefined);
    setMotion(true);
    if (item.weapon) {
      if (item.weapon !== weaponId) {
        const family = item.weapon.split('_')[0];
        const audio = weaponAudioRef.current ?? new Audio();
        weaponAudioRef.current = audio;
        audio.pause();
        audio.src = `${WEAPON_AUDIO_BASE}${family === 'stick' ? 'knives' : family}.wav`;
        audio.volume = effectsVolume;
        void audio.play().catch(() => undefined);
      }
      setWeaponId(item.weapon);
      setStatus(`${item.name} · 持握预览`);
    } else if (item.attachment) {
      setAttachment(item.attachment);
      setAnimation(item.attachment.characterAnimation ?? undefined);
      setStatus(`${item.name} · 翅膀预览`);
    } else if (item.animation) {
      setWeaponId(undefined);
      setAnimation(item.animation);
      setStatus(`${item.name} · 动作预览`);
    } else if (item.preset && creation) {
      setAvatarCard(undefined);
      try { localStorage.removeItem(`avatarstar.skin.${character.userId}.${character.name}`); } catch { /* Storage can be disabled. */ }
      const preset = creation.jobs[item.preset.jobId].presets[item.preset.gender];
      setPreviewJob(item.preset.jobId);
      setAppearance(initialAppearance(preset, item.preset.gender));
      setStatus(`${item.name} · 造型预览`);
    } else {
      setStatus(`${item.name}${item.category === 'equipment' ? ' · 暂无对应的角色预览资源' : ''}`);
    }
  };
  const chooseCategory = (value: InventoryCategory) => { setCategory(value); setBagPage(0); setQuery(''); setPage('bag'); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (dialog || settingsOpen || battleRoom || event.target instanceof HTMLInputElement) return;
      if (event.key === 'Escape') { setSettingsOpen(true); return; }
      if (practiceRoom || gameModeLobby) return;
      const index = QUICK_KEYS.indexOf(event.key);
      if (index < 0) return;
      const item = assets?.items.find((entry) => entry.id === quickbar[index]);
      if (item) chooseItem(item);
    };
    addEventListener('keydown', keydown);
    return () => removeEventListener('keydown', keydown);
  });

  if (!assets || !creation) return <main className="lobby-viewport"><p role="status">{error || '正在进入大厅…'}</p></main>;
  if (battleRoom) return <Gameplay room={battleRoom} character={charState} creation={creation} assets={assets}
    avatarPreset={avatarCard?.preset}
    quickbar={quickbar} skills={jobSkillList} levels={allocation.levels}
    volume={volume} effectsVolume={effectsVolume} onVolume={setVolume} onEffectsVolume={setEffectsVolume}
    onExit={() => {
      setBattleRoom(undefined);
      void fetchCharacterFromServer().then((latest) => {
        if (latest) setCharState(latest);
      });
    }} onQuit={onQuit} />;
  const art = (key: string): CSSProperties => ({ backgroundImage: `url("${lobbyUrl(assets.ui[key])}")` });
  const buttonArt = (key: string): CSSProperties => ({ '--art': `url("${lobbyUrl(assets.ui[`${key}_normal`])}")`,
    '--hover-art': `url("${lobbyUrl(assets.ui[`${key}_hover`])}")`, '--down-art': `url("${lobbyUrl(assets.ui[`${key}_down`])}")` } as CSSProperties);
  const preset = avatarCard?.preset ?? creation.jobs[previewJob].presets[appearance.gender];
  const originalAppearance = validAppearance(creation, character);
  const originalPreset = creation.jobs[character.jobId].presets[originalAppearance.gender];
  const reset = () => {
    setAppearance(originalAppearance); setPreviewJob(character.jobId); setRotation(0);
    setAvatarCard(undefined);
    try { localStorage.removeItem(`avatarstar.skin.${character.userId}.${character.name}`); } catch { /* Storage can be disabled. */ }
    setWeaponId(undefined); setAttachment(undefined); setAnimation(undefined); setSelected(undefined); setRevision((value) => value + 1); setStatus('');
  };
  const assignQuickbar = (index: number, id: string) => {
    const skill = jobSkills.get(id);
    if (!assets.items.some((item) => item.id === id) && skill?.kind !== 'active') return;
    setQuickbar((slots) => slots.map((value, slot) => slot === index ? id : value));
  };
  const moduleDialog = (title: string) => setDialog({ title });

  const level = charState.level ?? 1;
  const exp = charState.exp ?? 0;
  const maxExp = level * 100;

  return <main className="lobby-viewport">
    <div className={`lobby-screen${practiceRoom ? ' lobby-practice-screen' : ''}`} data-lobby-ready="true" style={{ transform: `scale(${scale})`, backgroundImage: `url("${assetUrl(creation.ui.background)}")` }}
      onPointerDown={() => { void audioRef.current?.play().catch(() => undefined); }}>
      <audio ref={audioRef} src={`${MUSIC_BASE}${musicTrack}.ogg`} loop preload="auto"
        aria-label={musicTrack === 'music-lobby' ? '大厅背景音乐' : '凌云要塞背景音乐'} />
      <img className="lobby-frame" src={lobbyUrl(assets.ui.frame)} alt="" draggable={false} />
      <header className="lobby-header">
        <div className="lobby-portrait" style={art('portraitFrame')}>
          <CharacterPreview assets={creation} preset={avatarCard?.preset ?? originalPreset}
            appearance={avatarCard ? initialAppearance(avatarCard.preset, character.appearance.gender) : originalAppearance} motion={false}
            weapons={NO_WEAPONS} weaponIndex={null} view="portrait" />
        </div>
        <span className="lobby-level">{level}</span>
        <img className="lobby-job-icon" src={assetUrl(creation.jobs[character.jobId].icon)} alt={CREATION_JOBS[character.jobId].name} />
        <span className="lobby-name">{charState.name}</span>
        <span className="lobby-exp">{exp} / {maxExp} <span>EXP</span></span>
        <span className="lobby-gold">{charState.coins ?? 100000}</span><span className="lobby-cash">{charState.cash ?? 0}</span><span className="lobby-gems">{charState.gems ?? 0}</span>
        <img className="lobby-vip" src={lobbyUrl(assets.ui.vip)} alt="VIP" />
        <button className="lobby-recharge" onClick={() => moduleDialog('在线充值')}>在线充值</button>
        <nav className="lobby-menu" aria-label="大厅导航">
          {MENUS.map(([key, label]) => <button key={key} className={'lobby-art-button' + (key === 'info' ? ' active' : '')}
            style={buttonArt('menu')} aria-label={label} onClick={() => {
              if (key === 'info') { setPracticeRoom(false); setGameModeLobby(false); chooseCategory('equipment'); }
              else if (key === 'avatar') { setPracticeRoom(false); setGameModeLobby(false); chooseCategory('avatars'); }
              else moduleDialog(label);
            }}>
            <img src={lobbyUrl(assets.ui[`menu-${key}`])} alt="" /><span>{label}</span>
          </button>)}
          <button className="lobby-reward" onClick={() => moduleDialog('在线奖励')} aria-label="在线奖励"><img src={lobbyUrl(assets.ui.reward)} alt="" /><span>可领取</span></button>
        </nav>
        <button className="lobby-play" aria-label={practiceRoom ? '返回凌云要塞' : gameModeLobby ? '返回大厅' : '开始游戏'} onClick={() => {
          if (practiceRoom) { setPracticeRoom(false); setQuickJoinedRoom(undefined); setGameModeLobby(true); }
          else setGameModeLobby((value) => !value);
          setStatus('');
        }}>开始<br />游戏</button>
      </header>
      {practiceRoom ? <PracticeRoom assets={assets} hostName={charState.name} hostIcon={assetUrl(creation.jobs[character.jobId].icon)}
        weaponIds={battleWeapons} initialJoinedRoom={quickJoinedRoom}
        onBack={() => { setPracticeRoom(false); setQuickJoinedRoom(undefined); setGameModeLobby(true); setStatus(''); }} onStart={setBattleRoom} onStatus={setStatus} />
        : gameModeLobby ? <GameModeLobby assets={assets} weaponIds={battleWeapons}
          onPractice={(joinedRoom) => { setQuickJoinedRoom(joinedRoom); setPracticeRoom(true); setStatus(''); }}
          onOpenExpedition={() => moduleDialog('冒险远征')}
          onStatus={setStatus} /> : <>
      <nav className="lobby-main-tabs" aria-label="角色页面">
        {['背包', '技能', '宠物', '幸运寻宝', '冒险远征'].map((label, index) => <button key={label}
          className={'lobby-art-button' + ((index === 0 && page === 'bag') || (index === 1 && page === 'skill') ? ' active' : '')}
          style={buttonArt('mainTab')} aria-pressed={index === 0 ? page === 'bag' : index === 1 ? page === 'skill' : undefined}
          onClick={() => {
            if (index === 0) { setPage('bag'); chooseCategory('equipment'); }
            else if (index === 1) setPage('skill');
            else moduleDialog(label);
          }}>{label}</button>)}
      </nav>
      <div className="lobby-content" style={art('content')}>
        <section className="lobby-character-panel" aria-label="角色装备预览">
          <div className="lobby-character-glow" />
          <div className="lobby-avatar">
            <CharacterPreview key={revision} assets={creation} preset={preset} appearance={appearance} motion={motion} weapons={previewWeapons}
              weaponIndex={previewWeapons.length ? 0 : null} animation={animation} attachment={attachment} rotation={rotation} />
          </div>
          <div className="lobby-power-frame" style={art('powerFrame')} />
          <div className="lobby-power" style={art('power')}><span>战斗力</span><b>{charState.power ?? 1500}</b><small>冒险实力</small></div>
          {page === 'bag' && ['slotStar', 'slotFlame', 'slotRing', 'slotRing'].map((key, index) => <button key={index}
            className={`lobby-equipped-slot slot-${index}`} style={art('slot')} aria-label={['徽章', '翅膀', '左戒指', '右戒指'][index]}
            onClick={() => { chooseCategory('equipment'); setQuery(index === 0 ? 'badge' : index === 1 ? 'wing' : 'ring'); }}>
            <img src={lobbyUrl(assets.ui[key])} alt="" />
          </button>)}
          <div className="lobby-preview-controls">
            <button className="lobby-art-button" style={buttonArt('button')} onClick={reset}>重置</button>
            <button style={art('rotateLeft')} aria-label="向左旋转角色" onClick={() => setRotation((value) => value - Math.PI / 6)} />
            <button style={art('rotateRight')} aria-label="向右旋转角色" onClick={() => setRotation((value) => value + Math.PI / 6)} />
          </div>
          <div className="lobby-character-stats" style={art('stats')}>
            <span className="lobby-stats-title" style={art('statsTitle')}>角色属性</span>
            <div className="lobby-stat-modes">战场 <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => moduleDialog('冒险远征')}>冒险远征</span></div>
            <div className="lobby-stat-values">{[['生命值', '3201', 1], ['耐力值', '100', 6], ['活力值', '120', 2], ['恢复力', '85', 3], ['护甲值', '240', 4], ['破甲值', '180', 5]].map(([label, value, icon]) =>
              <div key={label}><img src={lobbyUrl(assets.ui[`stat${icon}`])} alt="" /><span>{label}</span><b>{value}</b></div>)}</div>
          </div>
        </section>
        {page === 'skill' && skillAssets ? <SkillPanel assets={skillAssets} job={character.jobId} allocation={allocation}
          tab={skillTab} onTab={setSkillTab} onMessage={setStatus} />
          : <section className="lobby-inventory" style={art('inventory')} aria-label="背包">
          <h1>背包</h1>
          <label className="lobby-search"><span className="sr-only">搜索物品</span><input placeholder="搜索物品" value={query} onChange={(event) => { setQuery(event.target.value); setBagPage(0); }} /></label>
          <button className="lobby-renew" style={art('renew')} onClick={() => setStatus('全部物品均已永久续费并可在当前背包中预览')}>全部续费</button>
          <nav className="lobby-bag-tabs" aria-label="物品分类">
            {TABS.map((tab) => <button key={tab.id} className={'lobby-art-button' + (category === tab.id ? ' active' : '')} style={buttonArt('bagTab')}
              aria-pressed={category === tab.id} data-category={tab.id} onClick={() => chooseCategory(tab.id)}>
              <img src={lobbyUrl(assets.ui[tab.icon])} alt="" /><span>{tab.label}</span>
            </button>)}
          </nav>
          <div className="lobby-inventory-grid-frame" style={art('grid')}>
            <div className="lobby-inventory-grid" role="grid" aria-label={`${TABS.find((tab) => tab.id === category)?.label}，共${filtered.length}项`} data-item-count={filtered.length}>
              {Array.from({ length: PAGE_SIZE }, (_, index) => {
                const item = pageItems[index];
                const isSelected = !!item && (selected?.id === item.id || avatarCard?.id === item.id);
                return <button key={item?.id ?? `empty-${index}`} role="gridcell" className={'lobby-item' + (item?.avatarCard ? ' lobby-avatar-card' : '') + (isSelected ? ' selected' : '')}
                  style={{ ...art(item ? 'occupiedSlot' : 'slot'), '--selected-art': `url("${lobbyUrl(assets.ui.slotSelected)}")` } as CSSProperties}
                  disabled={!item} data-item-id={item?.id} aria-label={item?.name ?? '空格'} aria-selected={isSelected}
                  title={item ? `${item.name}\n${item.id}${item.avatarCard ? '\n点击切换角色皮肤' : item.weapon || item.attachment || item.animation || item.preset ? '\n点击预览，拖动到快捷栏' : ''}` : undefined}
                  draggable={!!item} onDragStart={(event) => { if (item) event.dataTransfer.setData('text/plain', item.id); }}
                  onClick={() => { if (item) chooseItem(item); }}>
                  <img src={lobbyUrl(item?.icon ?? assets.ui.slotLogo)} alt="" draggable={false} />
                  {item?.avatarCard && <span className="lobby-avatar-card-label">{item.name}</span>}
                  {item && quickbar.includes(item.id) && <span className="lobby-equipped-mark">E</span>}
                  {item?.avatarCard && avatarCard?.id === item.id && <span className="lobby-equipped-mark">E</span>}
                </button>;
              })}
            </div>
            {filtered.length === 0 && <p className="lobby-empty" role="status">没有找到对应物品</p>}
          </div>
          <div className="lobby-bag-tools">
            <button style={art('delete')} aria-label="清除装备预览" onClick={reset} />
            <button style={art('expand')} aria-label="查看全部物品" onClick={() => { setQuery(''); setBagPage(0); setStatus(`背包已开放全部 ${assets.items.length} 项物品`); }} />
            <div className="lobby-pages">
              <button style={art('pageLeft')} aria-label="背包上一页" disabled={currentPage === 0} onClick={() => setBagPage(currentPage - 1)} />
              <input aria-label="背包页码" type="number" min="1" max={pageCount} value={currentPage + 1} onChange={(event) => setBagPage(Math.min(pageCount - 1, Math.max(0, Number(event.target.value) - 1)))} />
              <span>/ {pageCount}</span>
              <button style={art('pageRight')} aria-label="背包下一页" disabled={currentPage + 1 >= pageCount} onClick={() => setBagPage(currentPage + 1)} />
            </div>
            <button style={art('upgrade')} aria-label="预览攻击动作" title="预览攻击动作" disabled={!previewWeapons[0]?.actions?.attack} onClick={() => { setAnimation(previewWeapons[0].actions?.attack); setStatus(`${selected?.name ?? ''} · 攻击动作`); }} />
            <button style={art('repair')} aria-label="预览装填动作" title="预览装填动作" disabled={!previewWeapons[0]?.actions?.reload} onClick={() => { setAnimation(previewWeapons[0].actions?.reload); setStatus(`${selected?.name ?? ''} · 装填动作`); }} />
            <button style={art('repairAll')} aria-label="恢复持握动作" title="恢复持握动作" onClick={() => setAnimation(undefined)} />
            <button className="lobby-art-button lobby-sort" style={buttonArt('button')} onClick={() => { setSorted((value) => !value); setBagPage(0); }}>整理</button>
          </div>
          <span className="lobby-item-count">共 {filtered.length} 项</span>
        </section>}
        <section className="lobby-quickbar" style={art('quickbar')} aria-label="快捷栏">
          <span>快捷栏</span>
          <div>{quickbar.map((id, index) => {
            const skill = id ? jobSkills.get(id) : undefined;
            const item = skill ? undefined : assets.items.find((entry) => entry.id === id);
            const slot = item || skill ? 'occupiedSlot' : 'quickSlot';
            return <button key={index} className="lobby-quick-slot" style={art(slot)}
              aria-label={`快捷栏 ${QUICK_KEYS[index]}${item ? ' ' + item.name : skill ? ' ' + skill.name : ''}`}
              onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); assignQuickbar(index, event.dataTransfer.getData('text/plain')); }}
              onClick={() => {
                if (skill) setStatus(`${skill.name} · 主动技能，进入战斗后使用`);
                else if (item) chooseItem(item);
                else if (selected) assignQuickbar(index, selected.id);
              }}
              onContextMenu={(event) => { event.preventDefault(); setQuickbar((slots) => slots.map((value, slot) => slot === index ? null : value)); }}>
              <img src={lobbyUrl(item?.icon ?? skill?.icon ?? assets.ui.quickStar)} alt="" /><small>{QUICK_KEYS[index]}</small>
            </button>;
          })}</div>
        </section>
      </div>
      </>}
      <div className="lobby-status" role="status">{status}</div>
      <nav className="lobby-footer" aria-label="大厅工具">
        {FOOTER.map(([key, label]) => <button key={key} aria-label={label} onClick={() => {
          if (key === 'setup') setSettingsOpen(true);
          else if (key === 'chat' || key === 'message') setGlobalChatOpen(true);
          else moduleDialog(label);
        }}>
          <img src={lobbyUrl(assets.ui[`footer-${key}`])} alt="" />
        </button>)}
      </nav>
      {globalChatOpen && <GlobalChat hostName={charState.name} onClose={() => setGlobalChatOpen(false)} />}
      {settingsOpen && <SettingsMenu assets={assets} volume={volume} effectsVolume={effectsVolume} motion={motion}
        onVolume={setVolume} onEffectsVolume={setEffectsVolume} onMotion={setMotion} onClose={() => setSettingsOpen(false)}
        onExit={onExit} onQuit={() => { audioRef.current?.pause(); weaponAudioRef.current?.pause(); onQuit(); }} />}
      {dialog && <LobbyFeatureModal
        title={dialog.title}
        assets={assets}
        character={charState}
        onUpdateCharacter={setCharState}
        onSelectBagItem={(item) => chooseItem(item)}
        onStartRoom={setBattleRoom}
        onStatus={setStatus}
        onClose={() => setDialog(undefined)}
      />}
    </div>
  </main>;
}
