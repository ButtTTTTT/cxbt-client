import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { apiFetch } from '../../api';
import { lobbyUrl, type LobbyAssets } from '../lobby/assets';
import CreateRoomDialog, { type RoomConfig } from './CreateRoomDialog';
import RoomSettings from './RoomSettings';
import './PracticeRoom.css';

type PracticeRoomProps = {
  assets: LobbyAssets;
  hostName: string;
  hostIcon: string;
  weaponIds: string[];
  initialJoinedRoom?: ApiRoom;
  onBack: () => void;
  onStart: (room: RoomConfig) => void;
  onStatus: (message: string) => void;
};
export type ApiRoom = RoomConfig & {
  id: string;
  hostId: number;
  hostName?: string;
  state: string;
  watchCount?: number;
};
const COLUMNS = ['N0', '状态', '房间名称', '房主', '地图', 'Watch', '模式', '人数'];
const MODES = [
  { id: 'all', label: '全部', skin: 'skin_playgame_mode6', icon: 'practiceModeAll' },
  { id: 'team', label: '团队', skin: 'skin_playgame_mode3', icon: 'practiceModeTeam' },
  { id: 'occupy', label: '占点', skin: 'skin_playgame_mode5', icon: 'practiceModeOccupy' },
  { id: 'flag', label: '夺旗', skin: 'skin_playgame_mode2', icon: 'practiceModeFlag' },
  { id: 'treasure', label: '夺宝', skin: 'skin_playgame_mode4', icon: 'practiceModeTreasure' },
  { id: 'kill', label: '歼灭', skin: 'skin_playgame_mode8', icon: 'practiceModeKill' },
  { id: 'blast', label: '爆破', skin: 'skin_playgame_mode10', icon: 'practiceModeBlast' },
] as const;

const roomHost = (room: ApiRoom) => room.hostName ?? room.players?.[String(room.hostId)]?.username ?? `Host-${room.hostId}`;

function art(assets: LobbyAssets, key: string): CSSProperties {
  return { backgroundImage: `url("${lobbyUrl(assets.ui[key])}")` };
}
function buttonArt(assets: LobbyAssets, key: string): CSSProperties {
  return { '--art': `url("${lobbyUrl(assets.ui[key + '_normal'])}")`,
    '--hover-art': `url("${lobbyUrl(assets.ui[key + '_hover'])}")`,
    '--down-art': `url("${lobbyUrl(assets.ui[key + '_down'])}")` } as CSSProperties;
}
function ActionButton({ assets, icon, label, className, onClick, disabled = false, ariaLabel }: {
  assets: LobbyAssets; icon: string; label: string; className: string;
  onClick: () => void; disabled?: boolean; ariaLabel?: string;
}) {
  return <button className={`practice-action ${className}`} aria-label={ariaLabel ?? label} disabled={disabled}
    style={buttonArt(assets, className === 'practice-watch' ? 'practiceWatch' : 'practiceButton')} onClick={onClick}>
    <img src={lobbyUrl(assets.ui[icon])} alt="" /><span>{label}</span>
  </button>;
}

export default function PracticeRoom({ assets, hostName, hostIcon, weaponIds, initialJoinedRoom, onBack, onStart, onStatus }: PracticeRoomProps) {
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<ApiRoom | undefined>(initialJoinedRoom);
  const [roomList, setRoomList] = useState<ApiRoom[]>([]);
  const [sortColumn, setSortColumn] = useState(5);
  const [ascending, setAscending] = useState(true);
  const [scrollPosition, setScrollPosition] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialJoinedRoom) setCreatedRoom(initialJoinedRoom);
  }, [initialJoinedRoom]);

  const fetchRooms = useCallback(async () => {
    try {
      const data: ApiRoom[] = await apiFetch('/rooms') ?? [];
      setRoomList(data);
      setCreatedRoom(previous => {
        if (!previous) return undefined;
        return data.find(room => room.id === previous.id);
      });
    } catch (error) { console.error(error); }
  }, []);
  useEffect(() => {
    void fetchRooms();
    const timer = setInterval(() => void fetchRooms(), 3000);
    return () => clearInterval(timer);
  }, [fetchRooms]);
  const rooms = useMemo(() => {
    const result = roomList.filter(room => mode === 'all' || room.modeId === mode || room.modeName === MODES.find(entry => entry.id === mode)?.label);
    const value = (room: ApiRoom): string | number => [room.id, room.state, room.name, roomHost(room),
      room.mapName, room.watchCount ?? 0, room.modeName, Object.keys(room.players ?? {}).length][sortColumn];
    return result.sort((a, b) => String(value(a)).localeCompare(String(value(b)), 'zh-CN', { numeric: true }) * (ascending ? 1 : -1));
  }, [roomList, mode, sortColumn, ascending]);
  const selectedRoom = roomList.find(room => room.id === selectedId);
  const joinRoom = async (room: ApiRoom) => {
    try {
      const joined: ApiRoom = await apiFetch(`/rooms/${room.id}/join`, { method: 'POST', body: JSON.stringify({ password: '', weaponIds }) });
      const targetRoom = joined ?? room;
      if (targetRoom.state === 'Playing') {
        onStatus(`已热加入激战房间 · ${targetRoom.name}`);
        onStart(targetRoom);
        return;
      }
      setCreatedRoom(targetRoom);
      onStatus(`已进入房间 · ${room.name}`);
    } catch (error) { onStatus(error instanceof Error ? error.message : '进入失败'); }
  };
  const chooseMode = (id: (typeof MODES)[number]['id']) => {
    setMode(id); setSelectedId(undefined); setScrollPosition(0);
    listRef.current?.scrollTo({ top: 0 });
    onStatus(`${MODES.find(entry => entry.id === id)?.label ?? '全部'}房间`);
  };
  const maxScroll = Math.max(0, Math.max(8, rooms.length) * 43 - 344);
  const scroll = (direction: number) => listRef.current?.scrollBy({ top: direction * 43, behavior: 'smooth' });
  return <section className="practice-room-layer" aria-label="练习赛房间列表" data-practice-room-ready="true">
    {createdRoom ? <RoomSettings assets={assets} room={createdRoom} hostName={hostName} hostIcon={hostIcon}
      onLeave={() => { setCreatedRoom(undefined); onStatus(''); }} onSettings={() => setCreateRoomOpen(true)}
      onRoomUpdate={updated => setCreatedRoom(updated as ApiRoom)}
      onStart={room => onStart(room || createdRoom)} onStatus={onStatus} /> :
      <div className="practice-room-root">
        <div className="practice-room-content" style={art(assets, 'content')}>
          <div className="practice-room-topbar" style={art(assets, 'practiceInternalTop')} />
          <aside className="practice-advance" style={art(assets, 'practiceAdvance')}>
            <p>在练习赛中可以自订队友和对手，自由设定游戏房间。</p>
          </aside>
          <section className="practice-mode-panel" style={art(assets, 'practiceModePanel')} aria-label="模式选择">
            <h2>模式选择</h2>
            <div className="practice-mode-frame" style={art(assets, 'practiceModeFrame')}>
              {MODES.map(entry => <button key={entry.id} className={`practice-mode-button lobby-art-button${mode === entry.id ? ' active' : ''}`}
                style={buttonArt(assets, entry.skin)} aria-label={entry.label} aria-pressed={mode === entry.id} onClick={() => chooseMode(entry.id)} />)}
            </div>
          </section>
          <section className="practice-list-panel" style={art(assets, 'practiceRoomPanel')} aria-label="房间列表">
            <div className="practice-list-frame" style={art(assets, 'practiceListFrame')}>
              <div className="practice-room-table" role="table" aria-label="练习赛房间">
                <div className="practice-room-header" role="row">
                  {COLUMNS.map((label, index) => <button key={label} role="columnheader" aria-sort={sortColumn === index ? ascending ? 'ascending' : 'descending' : 'none'}
                    style={{ borderImage: `url("${lobbyUrl(assets.ui.practiceHeader_normal)}") 4 fill / 4px` }} onClick={() => { setSortColumn(index); setAscending(sortColumn === index ? !ascending : true); }}>
                    {label}{sortColumn === index && <i className={ascending ? '' : 'descending'} />}
                  </button>)}
                </div>
                <div className="practice-room-rows" ref={listRef} onScroll={event => setScrollPosition(event.currentTarget.scrollTop)}>
                  {Array.from({ length: Math.max(8, rooms.length) }, (_, index) => {
                    const room = rooms[index];
                    const entry = MODES.find(mode => mode.id === room?.modeId || mode.label === room?.modeName);
                    const count = Object.keys(room?.players ?? {}).length;
                    return room ? <div key={room.id} className={`practice-room-row${selectedId === room.id ? ' selected' : ''}`}
                      style={buttonArt(assets, 'practiceListRow')} role="row" aria-selected={selectedId === room.id} tabIndex={0}
                      onClick={() => setSelectedId(room.id)} onDoubleClick={() => void joinRoom(room)} onKeyDown={event => {
                        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setSelectedId(room.id); }
                      }}>
                      <span role="cell" className="practice-room-number" title={room.id}>{room.id.replace('room-', '')}</span>
                      <span role="cell"><i className={`practice-room-state ${room.state === 'Playing' ? 'playing' : 'waiting'}`} aria-label={room.state === 'Playing' ? '游戏中' : '等待中'} /></span>
                      <span role="cell" className="practice-room-name" title={room.name}>{room.name}</span>
                      <span role="cell" className="practice-room-host">{roomHost(room)}</span>
                      <span role="cell" className="practice-room-map">{room.mapName}</span>
                      <span role="cell">{room.watchCount || ''}</span>
                      <span role="cell">{entry && <img className="practice-room-mode-icon" src={lobbyUrl(assets.ui[entry.icon])} alt={room.modeName} />}</span>
                      <span role="cell" className={`practice-room-count${count >= room.maxPlayers ? ' full' : ''}`}>{count}/{room.maxPlayers}</span>
                    </div> : <div key={`empty-${index}`} className="practice-room-row empty" style={art(assets, 'practiceListRow_normal')} role="row" aria-label={`空房间 ${index + 1}`}>
                      {COLUMNS.map(label => <span key={label} role="cell" />)}
                    </div>;
                  })}
                </div>
                <div className="practice-scrollbar" style={art(assets, 'practiceScrollTrack')}>
                  <button className="practice-scroll-up" style={art(assets, 'practiceScrollUp')} aria-label="向上滚动房间列表" onClick={() => scroll(-1)} />
                  {maxScroll > 0 && <span className="practice-scroll-thumb" style={{ ...art(assets, 'practiceScrollThumb'), top: 22 + (scrollPosition / maxScroll) * 277 }} />}
                  <button className="practice-scroll-down" style={art(assets, 'practiceScrollDown')} aria-label="向下滚动房间列表" onClick={() => scroll(1)} />
                </div>
              </div>
            </div>
            <div className="practice-actions">
              <ActionButton assets={assets} icon="practiceIconBack" label="返回" ariaLabel="返回凌云要塞" className="practice-back" onClick={onBack} />
              <ActionButton assets={assets} icon="practiceIconWatch" label="观战" className="practice-watch" disabled={!selectedRoom}
                onClick={() => selectedRoom ? onStart(selectedRoom) : onStatus('请选择一个房间观战')} />
              <ActionButton assets={assets} icon="practiceIconCreate" label="创建战场" className="practice-create" onClick={() => setCreateRoomOpen(true)} />
              <button className="practice-action practice-enter lobby-art-button" aria-label="进入战场" style={buttonArt(assets, 'practiceStart')}
                onClick={() => selectedRoom ? void joinRoom(selectedRoom) : onStatus('请选择一个房间后再进入')}>
                <img src={lobbyUrl(assets.ui.practiceIconEnter)} alt="" /><span>进入战场</span>
              </button>
            </div>
          </section>
        </div>
        <div className="practice-room-title-tab" style={art(assets, 'practiceTitleTab')}><h1 className="practice-room-title">练习赛</h1></div>
      </div>}
    {createRoomOpen && <CreateRoomDialog assets={assets} initialRoom={createdRoom} onClose={() => setCreateRoomOpen(false)}
      onCreate={async room => {
        try {
          if (createdRoom?.id) {
            const updated: ApiRoom = await apiFetch(`/rooms/${createdRoom.id}`, { method: 'PUT', body: JSON.stringify(room) });
            setCreatedRoom(updated); setCreateRoomOpen(false); onStatus('房间设置已更新');
          } else {
            const newRoom: ApiRoom = await apiFetch('/rooms', { method: 'POST', body: JSON.stringify({ ...room, weaponIds }) });
            setCreatedRoom(newRoom); setCreateRoomOpen(false); onStatus('');
          }
        } catch (error) { onStatus(error instanceof Error ? error.message : '房间保存失败'); }
      }} />}
  </section>;
}
