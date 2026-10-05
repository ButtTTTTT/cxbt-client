import { useState, type CSSProperties } from 'react';
import type { LobbyAssets } from '../lobby/assets';
import { lobbyUrl } from '../lobby/assets';
import CreateRoomDialog, { type RoomConfig } from './CreateRoomDialog';
import RoomSettings from './RoomSettings';
import './PracticeRoom.css';

type PracticeRoomProps = {
  assets: LobbyAssets;
  hostName: string;
  hostIcon: string;
  onBack: () => void;
  onStart: (room: RoomConfig) => void;
  onStatus: (message: string) => void;
};

type Room = {
  id: number;
  name: string;
  host: string;
  map: string;
  mode: string;
  players: string;
  state: string;
};

const COLUMNS = [
  ['NO', '53px'], ['状态', '61px'], ['房间名称', '185px'], ['房主', '164px'],
  ['地图', '154px'], ['Watch', '70px'], ['模式', '60px'], ['人数', '66px'],
] as const;
const EMPTY_ROWS = Array.from({ length: 8 }, (_, index) => index);
const MODES = [
  { id: 'all', label: '全部', icon: 'practiceModeAll' },
  { id: 'team', label: '团队', icon: 'practiceModeTeam' },
  { id: 'occupy', label: '占点', icon: 'practiceModeOccupy' },
  { id: 'flag', label: '夺旗', icon: 'practiceModeFlag' },
  { id: 'treasure', label: '夺宝', icon: 'practiceModeTreasure' },
  { id: 'kill', label: '歼灭', icon: 'practiceModeKill' },
  { id: 'blast', label: '爆破', icon: 'practiceModeBlast' },
  { id: 'survival', label: '生存', icon: 'practiceModeSurvival' },
] as const;

function art(assets: LobbyAssets, key: string): CSSProperties {
  return { backgroundImage: `url("${lobbyUrl(assets.ui[key])}")` };
}

function buttonArt(assets: LobbyAssets, key: string): CSSProperties {
  return {
    '--art': `url("${lobbyUrl(assets.ui[`${key}_normal`])}")`,
    '--hover-art': `url("${lobbyUrl(assets.ui[`${key}_hover`])}")`,
    '--down-art': `url("${lobbyUrl(assets.ui[`${key}_down`])}")`,
  } as CSSProperties;
}

function ActionButton({ assets, icon, label, className, onClick, 'aria-label': ariaLabel }: {
  assets: LobbyAssets;
  icon: string;
  label: string;
  className?: string;
  'aria-label'?: string;
  onClick: () => void;
}) {
  return <button className={`practice-action ${className ?? ''}`} aria-label={ariaLabel ?? label} style={buttonArt(assets, 'practiceButton')} onClick={onClick}>
    <img src={lobbyUrl(assets.ui[icon])} alt="" />
    <span>{label}</span>
  </button>;
}

function EmptyRow({ index }: { index: number }) {
  return <div className="practice-room-row" role="row" aria-label={`空房间 ${index + 1}`}>
    {COLUMNS.map(([label]) => <span key={label} role="cell">-</span>)}
  </div>;
}

export default function PracticeRoom({ assets, hostName, hostIcon, onBack, onStart, onStatus }: PracticeRoomProps) {
  const [mode, setMode] = useState<(typeof MODES)[number]['id']>('all');
  const [selectedRoom, setSelectedRoom] = useState<Room>();
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<RoomConfig>();

  const chooseMode = (nextMode: (typeof MODES)[number]['id']) => {
    setMode(nextMode);
    setSelectedRoom(undefined);
    onStatus(`${MODES.find((entry) => entry.id === nextMode)?.label ?? '全部'}房间 · 正在等待服务器列表`);
  };

  return <section className="practice-room-layer" aria-label="练习赛房间列表" data-practice-room-ready="true">
    {createdRoom ? <RoomSettings assets={assets} room={createdRoom} hostName={hostName} hostIcon={hostIcon}
      onLeave={() => { setCreatedRoom(undefined); onStatus(''); }} onSettings={() => setCreateRoomOpen(true)} onStart={() => onStart(createdRoom)} onStatus={onStatus} /> :
    <div className="practice-room-root">
      <div className="practice-room-content" style={art(assets, 'content')}>
        <div className="practice-room-topbar" style={art(assets, 'practiceInternalTop')} />

        <aside className="practice-advance" style={art(assets, 'practiceAdvance')}>
          <p>在练习赛中可以自定义队友和对手，自由设置游戏房间。</p>
        </aside>

        <section className="practice-mode-panel" style={art(assets, 'practiceModePanel')} aria-label="模式选择">
          <h2>模式选择</h2>
          <div className="practice-mode-frame" style={art(assets, 'practiceListFrame')}>
            {MODES.map((entry) => <button key={entry.id} className={`practice-mode-button${mode === entry.id ? ' selected' : ''}`}
              aria-label={entry.label} aria-pressed={mode === entry.id} onClick={() => chooseMode(entry.id)}>
              <span className="practice-mode-mark"><img src={lobbyUrl(assets.ui[entry.icon])} alt="" /></span>
              <span className="practice-mode-label">{entry.label}</span>
            </button>)}
          </div>
        </section>

        <section className="practice-list-panel" style={art(assets, 'practiceRoomPanel')} aria-label="房间列表">
          <div className="practice-list-frame" style={art(assets, 'practiceListFrame')}>
            <div className="practice-room-table" role="table" aria-label="练习赛房间">
              <div className="practice-room-header" role="row" style={{ gridTemplateColumns: COLUMNS.map(([, width]) => width).join(' ') }}>
                {COLUMNS.map(([label]) => <span key={label} role="columnheader">{label}</span>)}
              </div>
              {EMPTY_ROWS.map((index) => <EmptyRow key={index} index={index} />)}
            </div>
          </div>
          <div className="practice-actions">
            <ActionButton assets={assets} icon="practiceIconBack" label="返回" aria-label="返回凌云要塞" onClick={onBack} />
            <ActionButton assets={assets} icon="practiceIconWatch" label="观战" onClick={() => onStatus('观战 · 当前没有可观战的练习赛房间')} />
            <ActionButton assets={assets} icon="practiceIconCreate" label="创建房间" onClick={() => setCreateRoomOpen(true)} />
            <button className="practice-action practice-enter" aria-label="进入房间" style={buttonArt(assets, 'practiceStart')} onClick={() => {
              onStatus(selectedRoom ? `进入房间 · ${selectedRoom.name}` : '请选择一个房间后再进入');
            }}>
              <img src={lobbyUrl(assets.ui.practiceIconEnter)} alt="" /><span>进入房间</span>
            </button>
          </div>
        </section>
      </div>
      <div className="practice-room-title-bar" style={art(assets, 'practiceTitleBar')}>
        <div className="practice-room-title-tab" style={art(assets, 'practiceTitleTab')}><h1 className="practice-room-title">练习赛</h1></div>
      </div>
    </div>}
    {createRoomOpen && <CreateRoomDialog assets={assets} initialRoom={createdRoom} onClose={() => setCreateRoomOpen(false)}
      onCreate={(room) => { setCreatedRoom(room); setCreateRoomOpen(false); onStatus(''); }} />}
  </section>;
}
