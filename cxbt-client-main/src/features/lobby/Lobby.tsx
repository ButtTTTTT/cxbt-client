import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import CharacterPreview from '../characterCreation/CharacterPreview';
import { assetUrl, CREATION_JOBS, initialAppearance, loadCreationAssets, type Appearance, type CreationAssets, type CreationAttachment, type CreationJob, type CreationWeapon } from '../characterCreation/assets';
import { fetchCharacterFromServer, type SavedCharacter } from '../characterCreation/character';
import { apiFetch } from '../../api';
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
  const [subFilter, setSubFilter] = useState<'all' | 'wing' | 'sprayer' | 'rifle' | 'sniper' | 'explosive' | 'melee' | 'trinket'>('all');
  const [bagPage, setBagPage] = useState(0);
  const [query, setQuery] = useState('');
  const [sorted, setSorted] = useState(false);
  const [selected, setSelected] = useState<InventoryItem>();
  const [weaponId, setWeaponId] = useState<string>();
  const [attachment, setAttachment] = useState<CreationAttachment>();
  const [equippedWing, setEquippedWing] = useState<CreationAttachment>();
  const [equippedBadge, setEquippedBadge] = useState<InventoryItem>();
  const [equippedLeftRing, setEquippedLeftRing] = useState<InventoryItem>();
  const [equippedRightRing, setEquippedRightRing] = useState<InventoryItem>();
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
  const [pendingQuickbarItemId, setPendingQuickbarItemId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const allocation = useSkillAllocation(skillAssets, character.jobId);
  // The cache keeps an unnamed item for every skill icon, so the hotbar resolves
  // the current class's own skills and boss skills before falling back to the inventory item.
  const jobSkills = useMemo(() => new Map([...(skillAssets?.jobs[character.jobId]?.skills ?? []), ...(skillAssets?.bossSkills ?? [])]
    .map((skill) => [skill.id, skill])), [skillAssets, character.jobId]);
  const jobSkillList = useMemo(() => skillAssets?.jobs[character.jobId]?.skills ?? [], [skillAssets, character.jobId]);
  const bossSkillList = useMemo(() => skillAssets?.bossSkills ?? [], [skillAssets]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const weaponAudioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const lastAutoReplacedRef = useRef<{ slotIndex: number; previousId: string | null; newId: string } | null>(null);
  const nextRangedSlotRef = useRef<number>(0);
  const musicTrack = gameModeLobby || practiceRoom ? 'music-fortress' : 'music-lobby';

  const quickbarStorageKey = `avatarstar.quickbar.${character.userId || character.name}.${character.jobId}`;
  const updateQuickbar = (updater: (prev: (string | null)[]) => (string | null)[]) => {
    setQuickbar((prev) => {
      const next = updater(prev);
      try {
        const jsonStr = JSON.stringify(next);
        localStorage.setItem(quickbarStorageKey, jsonStr);
        void apiFetch('/character', {
          method: 'POST',
          body: JSON.stringify({
            name: character.name,
            jobId: character.jobId,
            appearance: character.appearance,
            quickbarJson: jsonStr,
            equippedWeapons: next.filter(Boolean).join(','),
          }),
        }).catch(() => {});
      } catch {}
      return next;
    });
  };

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
      let savedWingId: string | null = null;
      let savedQuickbarRaw: string | null = null;
      try {
        savedCard = localStorage.getItem(`avatarstar.skin.${character.userId}.${character.name}`);
        savedWingId = localStorage.getItem('avatarstar.activeWing') || character.activeWing || null;
        savedQuickbarRaw = localStorage.getItem(quickbarStorageKey) || character.quickbarJson || null;
      } catch { /* Storage can be disabled. */ }
      const card = catalogue.items.find((item) => item.avatarCard?.id === savedCard)?.avatarCard;
      setAvatarCard(card);
      if (card) setAppearance(initialAppearance(card.preset, character.appearance.gender));
      const initialWingItem = catalogue.items.find(
        (item) => item.attachment?.bone === 'chest' && (item.id === (savedWingId || 'wing01_indie') || item.attachment?.id === savedWingId)
      ) ?? catalogue.items.find((item) => item.attachment?.bone === 'chest' && item.id === 'wing01_indie');
      if (initialWingItem?.attachment && savedWingId !== 'none') {
        const wingAtt = { ...initialWingItem.attachment, id: initialWingItem.id, label: initialWingItem.name, icon: initialWingItem.icon };
        setEquippedWing(wingAtt);
        setAttachment(wingAtt);
      }
      const badgeItem = catalogue.items.find((item) => item.id === 'badge01_indie' || item.id.startsWith('badge'));
      const ringLItem = catalogue.items.find((item) => item.id === 'ring01_indie' || item.id.startsWith('ring01'));
      const ringRItem = catalogue.items.find((item) => item.id === 'ring02_indie' || item.id.startsWith('ring02'));
      setEquippedBadge(badgeItem);
      setEquippedLeftRing(ringLItem);
      setEquippedRightRing(ringRItem);

      const defaults = [...config.jobs[character.jobId].weapons.map((weapon) => weapon.id)];
      if (character.jobId === 'biochemist' && defaults.length === 1) {
        defaults.push('shotgun_01', 'stick_sh01');
      } else if (!defaults.some((id) => id.startsWith('sprayer'))) {
        defaults.push('sprayer_03');
      }
      if (initialWingItem?.id && savedWingId !== 'none') {
        defaults.push(initialWingItem.id);
      }
      let initialSlots: (string | null)[] = Array.from({ length: 12 }, (_, index) => defaults[index] ?? null);
      if (savedQuickbarRaw) {
        try {
          const parsed = JSON.parse(savedQuickbarRaw);
          if (Array.isArray(parsed) && parsed.some(Boolean)) {
            const seenIds = new Set<string>();
            let seenWing = false;
            initialSlots = Array.from({ length: 12 }, (_, idx) => {
              const rawId = typeof parsed[idx] === 'string' ? parsed[idx] : null;
              if (!rawId || seenIds.has(rawId)) return null;
              const isWing = rawId.startsWith('wing') || catalogue.items.find((it) => it.id === rawId)?.attachment?.bone === 'chest';
              if (isWing) {
                if (seenWing) return null;
                seenWing = true;
              }
              seenIds.add(rawId);
              return rawId;
            });
          }
        } catch {}
      }
      setQuickbar(initialSlots);
      const firstEquippedWep = initialSlots.find((id): id is string => Boolean(id && catalogue.weapons[id]));
      if (firstEquippedWep) setWeaponId(firstEquippedWep);
      const quickbarWingItem = initialSlots
        .map((id) => (id ? catalogue.items.find((it) => it.id === id && (it.attachment?.bone === 'chest' || it.id.startsWith('wing'))) : undefined))
        .find(Boolean);
      if (quickbarWingItem?.attachment) {
        const wingAtt = { ...quickbarWingItem.attachment, id: quickbarWingItem.id, label: quickbarWingItem.name, icon: quickbarWingItem.icon };
        setEquippedWing(wingAtt);
        if (!firstEquippedWep) setAttachment(wingAtt);
      }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, [character.userId, character.jobId, character.name, quickbarStorageKey]);
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
  const battleWeapons = useMemo(
    () => quickbar.filter((id): id is string => Boolean(id && assets?.weapons[id])),
    [quickbar, assets]
  );
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const items = assets?.items.filter((item) => {
      if (item.category !== category) return false;
      if (category === 'equipment' && subFilter !== 'all') {
        const wFam = (item.weapon ?? item.id).split('_')[0];
        if (subFilter === 'wing' && !(item.attachment?.bone === 'chest' || item.id.startsWith('wing'))) return false;
        if (subFilter === 'sprayer' && wFam !== 'sprayer') return false;
        if (subFilter === 'rifle' && !['smg', 'machinegun', 'shotgun', 'pistol'].includes(wFam)) return false;
        if (subFilter === 'sniper' && !['sniperrifle', 'bow', 'crossbow'].includes(wFam)) return false;
        if (subFilter === 'explosive' && !['bazooka', 'grenadelauncher', 'grenade'].includes(wFam)) return false;
        if (subFilter === 'melee' && !['knives', 'stick', 'shield'].includes(wFam)) return false;
        if (subFilter === 'trinket' && !(item.id.startsWith('badge') || item.id.startsWith('ring'))) return false;
      }
      return !search || `${item.name} ${item.id}`.toLocaleLowerCase().includes(search);
    }) ?? [];
    return sorted ? [...items].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true })) : items;
  }, [assets, category, subFilter, query, sorted]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(bagPage, pageCount - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const syncWingToQuickbar = (wingItemId: string) => {
    updateQuickbar((slots) => {
      const existingWingIndices = slots
        .map((id, idx) => (id && (id.startsWith('wing') || assets?.items.find((it) => it.id === id)?.attachment?.bone === 'chest') ? idx : -1))
        .filter((idx) => idx >= 0);
      if (existingWingIndices.length > 0) {
        const keepIdx = existingWingIndices[0];
        lastAutoReplacedRef.current = { slotIndex: keepIdx, previousId: slots[keepIdx], newId: wingItemId };
        return slots.map((v, i) => {
          if (i === keepIdx) return wingItemId;
          if (existingWingIndices.includes(i)) return null;
          return v;
        });
      }
      const emptyIdx = slots.findIndex((val, i) => i >= 3 && !val);
      const targetIdx = emptyIdx >= 0 ? emptyIdx : slots.findIndex((val) => !val);
      if (targetIdx >= 0) {
        lastAutoReplacedRef.current = { slotIndex: targetIdx, previousId: slots[targetIdx], newId: wingItemId };
        return slots.map((v, i) => (i === targetIdx ? wingItemId : v));
      }
      return slots;
    });
  };

  const syncWeaponToQuickbar = (weaponItemId: string) => {
    updateQuickbar((slots) => {
      if (slots.includes(weaponItemId)) {
        lastAutoReplacedRef.current = null;
        return slots;
      }
      // 1. 若前 3 格主副近战武器栏有空位，优先填入空位
      const emptyWeaponSlot = slots.findIndex((val, i) => i < 3 && !val);
      if (emptyWeaponSlot >= 0) {
        lastAutoReplacedRef.current = { slotIndex: emptyWeaponSlot, previousId: null, newId: weaponItemId };
        return slots.map((v, i) => (i === emptyWeaponSlot ? weaponItemId : v));
      }
      // 2. 按武器类型智能匹配槽位（近战 -> 3号槽或已有近战槽；远程 -> 轮流装备 1/2 号主副远程槽）
      const newFam = weaponItemId.split('_')[0];
      const isMelee = ['knives', 'stick', 'shield'].includes(newFam);
      if (isMelee) {
        const meleeIdx = slots.findIndex((val, i) => i < 3 && val && ['knives', 'stick', 'shield'].includes(val.split('_')[0]));
        const targetIdx = meleeIdx >= 0 ? meleeIdx : 2;
        lastAutoReplacedRef.current = { slotIndex: targetIdx, previousId: slots[targetIdx], newId: weaponItemId };
        return slots.map((v, i) => (i === targetIdx ? weaponItemId : v));
      }
      const targetIdx = nextRangedSlotRef.current % 2;
      nextRangedSlotRef.current = (targetIdx + 1) % 2;
      lastAutoReplacedRef.current = { slotIndex: targetIdx, previousId: slots[targetIdx], newId: weaponItemId };
      return slots.map((v, i) => (i === targetIdx ? weaponItemId : v));
    });
  };

  const chooseItem = (item: InventoryItem, fromQuickbar = false) => {
    setSelected(item);
    if (fromQuickbar) {
      setPendingQuickbarItemId(null);
      lastAutoReplacedRef.current = null;
    } else if (!item.avatarCard && !item.preset && !item.animation && item.attachment?.bone !== 'pet' && item.attachment?.bone !== 'avatar_part' && !item.id.startsWith('badge') && !item.id.startsWith('ring')) {
      setPendingQuickbarItemId(item.id);
    } else {
      setPendingQuickbarItemId(null);
    }
    if (item.avatarCard) {
      setAvatarCard(item.avatarCard);
      setPreviewJob(character.jobId);
      setAppearance(initialAppearance(item.avatarCard.preset, character.appearance.gender));
      // 切换造型卡时触发换装间专属变身展示动作
      setAnimation('animations/avatar/character_change.json');
      try { localStorage.setItem(`avatarstar.skin.${character.userId}.${character.name}`, item.avatarCard.id); } catch { /* Keep the current selection in memory. */ }
      setStatus(`${item.name} · 已切换造型`);
      return;
    }
    const prevWeaponId = weaponId;
    setWeaponId(undefined);
    setAnimation(undefined);
    setMotion(true);
    if (item.weapon) {
      if (item.weapon !== prevWeaponId) {
        const family = item.weapon.split('_')[0];
        const audio = weaponAudioRef.current ?? new Audio();
        weaponAudioRef.current = audio;
        audio.pause();
        audio.src = `${WEAPON_AUDIO_BASE}${family === 'stick' ? 'knives' : family}.wav`;
        audio.volume = effectsVolume;
        void audio.play().catch(() => undefined);
      }
      setWeaponId(item.weapon);
      setAttachment(equippedWing);
      if (!fromQuickbar) {
        syncWeaponToQuickbar(item.id);
        setStatus(`${item.name} · 已穿戴并同步至快捷装备栏 (也可点击或拖动到下方任意快捷栏槽位指定键位)`);
      } else {
        setStatus(`${item.name} · 持握预览`);
      }
    } else if (item.attachment) {
      setAttachment(item.attachment);
      setAnimation(item.attachment.characterAnimation ?? undefined);
      if (item.attachment.bone === 'pet') {
        const petModel = item.attachment.id.replace(/^pet_/, '');
        try { localStorage.setItem('avatarstar.activePet', petModel); } catch {}
        setStatus(`${item.name} · 宠物伙伴 3D 跟随预览 (已设为出战宠物)`);
      } else if (item.attachment.bone === 'avatar_part') {
        setStatus(`${item.name} · 3D 造型部件实时穿戴预览`);
      } else if (item.attachment.id.startsWith('badge') || item.id.startsWith('badge')) {
        setEquippedBadge(item);
        setStatus(`${item.name} · 徽章已穿戴`);
      } else if (item.attachment.id.startsWith('ring') || item.id.startsWith('ring')) {
        if (!equippedLeftRing || equippedLeftRing.id === item.id) setEquippedLeftRing(item);
        else setEquippedRightRing(item);
        setStatus(`${item.name} · 指环已穿戴`);
      } else {
        const wingAtt = { ...item.attachment, id: item.id, label: item.name, icon: item.icon };
        setEquippedWing(wingAtt);
        setAttachment(wingAtt);
        syncWingToQuickbar(item.id);
        try { localStorage.setItem('avatarstar.activeWing', item.id); } catch {}
        setStatus(`${item.name} · 飞行器已穿戴并同步至快捷装备栏 (局内可按快捷键/双击或长按空格展翼飞行)`);
      }
    } else if (item.animation) {
      setWeaponId(undefined);
      setAttachment(equippedWing);
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
      setStatus(`${item.name}${item.category === 'equipment' ? ' · 暂无对应的角色预览资源' : ' · 已选中，点击下方快捷栏任意槽位即可放入'}`);
    }
  };
  const chooseCategory = (value: InventoryCategory) => { setCategory(value); setSubFilter('all'); setBagPage(0); setQuery(''); setPage('bag'); };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (dialog || settingsOpen || battleRoom || event.target instanceof HTMLInputElement) return;
      if (event.key === 'Escape') { setSettingsOpen(true); return; }
      if (practiceRoom || gameModeLobby) return;
      const index = QUICK_KEYS.indexOf(event.key);
      if (index < 0) return;
      const item = assets?.items.find((entry) => entry.id === quickbar[index]);
      if (item) chooseItem(item, true);
    };
    addEventListener('keydown', keydown);
    return () => removeEventListener('keydown', keydown);
  });

  if (!assets || !creation) return <main className="lobby-viewport"><p role="status">{error || '正在进入大厅…'}</p></main>;
  if (battleRoom) return <Gameplay room={battleRoom} character={charState} creation={creation} assets={assets}
    avatarPreset={avatarCard?.preset} wingAttachment={equippedWing}
    quickbar={quickbar} skills={jobSkillList} bossSkills={bossSkillList} levels={allocation.levels}
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
    setPendingQuickbarItemId(null);
    lastAutoReplacedRef.current = null;
    try {
      localStorage.removeItem(`avatarstar.skin.${character.userId}.${character.name}`);
      localStorage.setItem('avatarstar.activeWing', 'none');
    } catch { /* Storage can be disabled. */ }
    setWeaponId(undefined); setAttachment(undefined); setEquippedWing(undefined); setAnimation(undefined); setSelected(undefined); setRevision((value) => value + 1); setStatus('已重置角色与飞行器穿戴');
  };
  const assignQuickbar = (index: number, id: string) => {
    const skill = jobSkills.get(id);
    const item = assets.items.find((it) => it.id === id);
    if (!item && skill?.kind !== 'active') return;
    const isWingItem = Boolean(item?.attachment && (item.attachment.bone === 'chest' || item.id.startsWith('wing')));
    if (isWingItem && item?.attachment) {
      const wingAtt = { ...item.attachment, id: item.id, label: item.name, icon: item.icon };
      setEquippedWing(wingAtt);
      setAttachment(wingAtt);
      try { localStorage.setItem('avatarstar.activeWing', item.id); } catch {}
    } else if (item?.weapon) {
      setWeaponId(item.weapon);
      setAttachment(equippedWing);
    }
    const autoRep = lastAutoReplacedRef.current;
    lastAutoReplacedRef.current = null;
    setPendingQuickbarItemId(null);
    updateQuickbar((slots) =>
      slots.map((value, slot) => {
        if (slot === index) return id;
        // 如果刚才点击背包时自动把该物品预填到了别的槽位，用户紧接着点击了目标快捷栏槽位，则恢复原先那个槽位的旧物品
        if (autoRep && autoRep.newId === id && slot === autoRep.slotIndex && autoRep.slotIndex !== index) {
          return autoRep.previousId;
        }
        // 避免同一武器/物品/技能在快捷栏重复占用多个槽位，也避免多个飞行器同时刷满槽位
        if (value === id) return null;
        if (isWingItem && value && (value.startsWith('wing') || assets.items.find((it) => it.id === value)?.attachment?.bone === 'chest')) {
          return null;
        }
        return value;
      })
    );
    setStatus(`已将 [${item?.name ?? skill?.name ?? id}] 装备至快捷栏键位 [${QUICK_KEYS[index]}]`);
  };
  const equipSkillToQuickbar = (skillId: string) => {
    updateQuickbar((slots) => {
      if (slots.includes(skillId)) return slots;
      const emptyIdx = slots.findIndex((val, i) => i >= 3 && !val);
      const targetIdx = emptyIdx >= 0 ? emptyIdx : 9;
      return slots.map((v, i) => i === targetIdx ? skillId : v);
    });
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
        {['背包', '技能', '宠物', '幸运寻宝', '冒险远征', 'PDE工程台'].map((label, index) => <button key={label}
          className={'lobby-art-button' + ((index === 0 && page === 'bag') || (index === 1 && page === 'skill') ? ' active' : '')}
          style={buttonArt('mainTab')} aria-pressed={index === 0 ? page === 'bag' : index === 1 ? page === 'skill' : undefined}
          onClick={() => {
            if (index === 0) { setPage('bag'); chooseCategory('equipment'); }
            else if (index === 1) setPage('skill');
            else if (label === 'PDE工程台') { window.location.href = `${import.meta.env.BASE_URL}sandbox`; }
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
          {page === 'bag' && ['slotStar', 'slotFlame', 'slotRing', 'slotRing'].map((key, index) => {
            const slotLabels = ['徽章', '飞行器(翅膀)', '左戒指', '右戒指'];
            const equippedItem = index === 0
              ? equippedBadge
              : index === 1
                ? (equippedWing ? assets.items.find((it) => it.id === equippedWing.id || it.attachment?.id === equippedWing.id) : undefined)
                : index === 2
                  ? equippedLeftRing
                  : equippedRightRing;
            const iconSrc = equippedItem?.icon ?? (index === 1 ? equippedWing?.icon : undefined) ?? assets.ui[key];
            const slotLabel = equippedItem?.name ?? (index === 1 ? equippedWing?.label : undefined) ?? slotLabels[index];
            return <button key={index}
              className={`lobby-equipped-slot slot-${index}`} style={art(equippedItem || (index === 1 && equippedWing) ? 'occupiedSlot' : 'slot')}
              aria-label={slotLabels[index]}
              title={`${slotLabels[index]}：${slotLabel}\n左键筛选此类装备，拖动穿戴，右键卸下`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropId = e.dataTransfer.getData('text/plain');
                const found = assets.items.find((it) => it.id === dropId);
                if (found) chooseItem(found);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (index === 0) { setEquippedBadge(undefined); setStatus('已卸下徽章'); }
                else if (index === 1) {
                  setEquippedWing(undefined);
                  setAttachment(undefined);
                  updateQuickbar((slots) =>
                    slots.map((val) =>
                      val && (val.startsWith('wing') || assets.items.find((it) => it.id === val)?.attachment?.bone === 'chest') ? null : val
                    )
                  );
                  try { localStorage.setItem('avatarstar.activeWing', 'none'); } catch {}
                  setStatus('已卸下飞行器(翅膀)');
                }
                else if (index === 2) { setEquippedLeftRing(undefined); setStatus('已卸下左戒指'); }
                else if (index === 3) { setEquippedRightRing(undefined); setStatus('已卸下右戒指'); }
              }}
              onClick={() => {
                setCategory('equipment');
                setBagPage(0);
                setQuery('');
                setPage('bag');
                setSubFilter(index === 1 ? 'wing' : 'trinket');
                if (equippedItem) chooseItem(equippedItem);
              }}>
              <img src={lobbyUrl(iconSrc)} alt="" />
              {(equippedItem || (index === 1 && equippedWing)) && <span className="lobby-equipped-mark">E</span>}
            </button>;
          })}
          <div className="lobby-preview-controls">
            <button className="lobby-art-button" style={buttonArt('button')} onClick={reset}>重置</button>
            <button style={art('rotateLeft')} aria-label="向左旋转角色" onClick={() => setRotation((value) => value - Math.PI / 6)} />
            <button style={art('rotateRight')} aria-label="向右旋转角色" onClick={() => setRotation((value) => value + Math.PI / 6)} />
            {/* 换装间与结算卡牌 3D 动作快速预览选择器 */}
            <select
              aria-label="Preview Card and Avatar Pose"
              value={animation || ''}
              onChange={(e) => {
                const val = e.target.value;
                setAnimation(val || undefined);
              }}
              style={{
                marginLeft: 4,
                padding: '2px 4px',
                fontSize: 11,
                borderRadius: 4,
                background: 'rgba(15, 23, 42, 0.85)',
                color: '#fde68a',
                border: '1px solid #475569',
                maxWidth: 112,
              }}
            >
              <option value="">Default Pose</option>
              <option value="animations/avatar/character_change.json">Avatar Change</option>
              <option value="animations/avatar/coat.json">Avatar Coat</option>
              <option value="animations/avatar/pants.json">Avatar Pants</option>
              <option value="animations/avatar/shoesc.json">Avatar Shoes</option>
              <option value="animations/avatar/hair.json">Avatar Hair</option>
              <option value="animations/avatar/danceb.json">Avatar Dance B</option>
              <option value="animations/avatar/dancec.json">Avatar Dance C</option>
              <option value="animations/card/card_01.json">Card Flip 01</option>
              <option value="animations/card/card_02.json">Card Flip 02</option>
              <option value="animations/card/card_03.json">Card Flip 03</option>
              <option value="animations/card/card_04.json">Card Flip 04</option>
              <option value="animations/card/card_05.json">Card Flip 05</option>
              <option value="animations/card/card_06.json">Card Flip 06</option>
              <option value="animations/card/card_07.json">Card Flip 07</option>
              <option value="animations/card/card_08.json">Card Flip 08</option>
              <option value="animations/card/card_09.json">Card Flip 09</option>
              <option value="animations/card/card_01_pose.json">Card Pose 01</option>
              <option value="animations/card/card_02_pose.json">Card Pose 02</option>
              <option value="animations/card/card_03_pose.json">Card Pose 03</option>
              <option value="animations/card/card_04_pose.json">Card Pose 04</option>
              <option value="animations/card/card_05_pose.json">Card Pose 05</option>
              <option value="animations/card/card_06_pose.json">Card Pose 06</option>
              <option value="animations/card/card_08_pose.json">Card Pose 08</option>
              <option value="animations/card/card_09_pose.json">Card Pose 09</option>
            </select>
          </div>
          <div className="lobby-character-stats" style={art('stats')}>
            <span className="lobby-stats-title" style={art('statsTitle')}>角色属性</span>
            <div className="lobby-stat-modes">战场 <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => moduleDialog('冒险远征')}>冒险远征</span></div>
            <div className="lobby-stat-values">{[['生命值', '3201', 1], ['耐力值', '100', 6], ['活力值', '120', 2], ['恢复力', '85', 3], ['护甲值', '240', 4], ['破甲值', '180', 5]].map(([label, value, icon]) =>
              <div key={label}><img src={lobbyUrl(assets.ui[`stat${icon}`])} alt="" /><span>{label}</span><b>{value}</b></div>)}</div>
          </div>
        </section>
        {page === 'skill' && skillAssets ? <SkillPanel assets={skillAssets} job={character.jobId} allocation={allocation}
          tab={skillTab} onTab={setSkillTab} onMessage={setStatus} onEquipSkill={equipSkillToQuickbar} />

          : <section className="lobby-inventory" style={art('inventory')} aria-label="背包">
          <h1>背包</h1>
          <label className="lobby-search"><span className="sr-only">搜索物品</span><input placeholder="搜索物品 (如: 飞行器 / 燃烧器 / 翅膀)" value={query} onChange={(event) => { setQuery(event.target.value); setBagPage(0); }} /></label>
          <button className="lobby-renew" style={art('renew')} onClick={() => setStatus('全部物品均已永久续费并可在当前背包中预览')}>全部续费</button>
          {category === 'equipment' && (
            <div
              aria-label="装备子类型筛选"
              style={{
                position: 'absolute',
                top: 32,
                left: 16,
                display: 'flex',
                gap: 4,
                zIndex: 4,
              }}
            >
              {([
                ['all', '全部'],
                ['wing', '🪽飞行器'],
                ['sprayer', '🔥燃烧器'],
                ['rifle', '🔫枪械'],
                ['sniper', '🎯狙/弩'],
                ['explosive', '🚀重炮'],
                ['melee', '🗡️近战/盾'],
                ['trinket', '🏅徽章/戒'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSubFilter(key); setBagPage(0); }}
                  style={{
                    padding: '1px 6px',
                    fontSize: 11,
                    lineHeight: '16px',
                    borderRadius: 4,
                    border: subFilter === key ? '1px solid #fbbf24' : '1px solid #947253',
                    background: subFilter === key ? '#78350f' : '#382c20cc',
                    color: subFilter === key ? '#fef08a' : '#faead4',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {category === 'avatars' && (
            <div style={{ position: 'absolute', top: 32, left: 16, display: 'flex', gap: 6, zIndex: 4 }}>
              <button
                type="button"
                onClick={() => moduleDialog('造型屋')}
                style={{
                  padding: '1px 8px',
                  fontSize: 11,
                  lineHeight: '16px',
                  borderRadius: 4,
                  border: '1px solid #fbbf24',
                  background: '#78350f',
                  color: '#fef08a',
                  cursor: 'pointer',
                }}
              >
                🧩 打开造型屋 · 1392件解密3D部件库
              </button>
            </div>
          )}
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
                  title={item ? `${item.name}\n${item.id}${item.avatarCard ? '\n点击切换角色皮肤' : item.weapon || item.attachment || item.animation || item.preset ? '\n点击预览/穿戴，拖动到快捷栏' : ''}` : undefined}
                  draggable={!!item} onDragStart={(event) => { if (item) event.dataTransfer.setData('text/plain', item.id); }}
                  onClick={() => { if (item) chooseItem(item); }}>
                  <img src={lobbyUrl(item?.icon ?? assets.ui.slotLogo)} alt="" draggable={false} />
                  {item?.avatarCard && <span className="lobby-avatar-card-label">{item.name}</span>}
                  {item && quickbar.includes(item.id) && <span className="lobby-equipped-mark">E</span>}
                  {item?.avatarCard && avatarCard?.id === item.id && <span className="lobby-equipped-mark">E</span>}
                  {item?.attachment && equippedWing?.id === item.attachment.id && <span className="lobby-equipped-mark">E</span>}
                </button>;
              })}
            </div>
            {filtered.length === 0 && <p className="lobby-empty" role="status">没有找到对应物品</p>}
          </div>
          <div className="lobby-bag-tools">
            <button style={art('delete')} aria-label="清除装备预览" onClick={reset} />
            <button style={art('expand')} aria-label="查看全部物品" onClick={() => { setQuery(''); setSubFilter('all'); setBagPage(0); setStatus(`背包已开放全部 ${assets.items.length} 项物品`); }} />
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
          <span className="lobby-item-count" style={{ left: 'auto', right: 16 }}>共 {filtered.length} 项</span>
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
                if (pendingQuickbarItemId) assignQuickbar(index, pendingQuickbarItemId);
                else if (skill) setStatus(`${skill.name} · 主动技能，进入战斗后使用`);
                else if (item) chooseItem(item, true);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setPendingQuickbarItemId(null);
                lastAutoReplacedRef.current = null;
                updateQuickbar((slots) => slots.map((value, slotIdx) => slotIdx === index ? null : value));
              }}>
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
