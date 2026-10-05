import { useState, type CSSProperties, type FormEvent } from 'react';
import type { LobbyAssets } from '../lobby/assets';
import { lobbyUrl } from '../lobby/assets';
import type { RoomConfig } from './CreateRoomDialog';
import './RoomSettings.css';

type RoomSettingsProps = {
  assets: LobbyAssets;
  room: RoomConfig;
  hostName: string;
  hostIcon: string;
  onLeave: () => void;
  onSettings: () => void;
  onStart: () => void;
  onStatus: (message: string) => void;
};

const TEAM_SLOTS = Array.from({ length: 8 }, (_, index) => index);

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

export default function RoomSettings({ assets, room, hostName, hostIcon, onLeave, onSettings, onStart, onStatus }: RoomSettingsProps) {
  const [team, setTeam] = useState<'red' | 'blue'>('red');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<string[]>([`进入房间: ${room.name}`]);
  const map = assets.maps.find((entry) => entry.id === room.mapId);
  const mapImage = map?.roomImage ?? map?.cover ?? (room.mapId === 'random' ? 'ui/createRoomMapRandom.png' : null);
  const slotsPerTeam = Math.min(8, Math.ceil(room.maxPlayers / 2));

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setMessages((current) => [...current.slice(-47), `${hostName}: ${message}`]);
    setDraft('');
  };

  return <div className="practice-room-root room-settings-root" data-room-settings-ready="true">
    <div className="practice-room-content" style={art(assets, 'content')}>
      <div className="practice-room-topbar" style={art(assets, 'practiceInternalTop')} />

      <aside className="room-info-panel" style={art(assets, 'roomInfoPanel')} aria-label="房间地图与聊天">
        <div className="room-map-panel" style={art(assets, 'roomSmallMapBg')}>
          <div className="room-map-image" style={mapImage ? { backgroundImage: `url("${lobbyUrl(mapImage)}")` } : undefined}>
            {mapImage ? null : room.mapName}
          </div>
          <dl className="room-map-details">
            <dt>房间名称</dt><dd>{room.name}</dd>
            <dt>房主</dt><dd>{hostName}</dd>
            <dt>游戏模式</dt><dd>{room.modeName}</dd>
            <dt>游戏人数</dt><dd>{room.maxPlayers}</dd>
          </dl>
        </div>
        <div className="room-chat-panel" style={art(assets, 'roomChatPanel')} aria-label="房间聊天记录">
          {messages.map((message, index) => <div key={`${index}-${message}`}>{message}</div>)}
        </div>
        <form className="room-chat-input" style={art(assets, 'roomChatInput')} onSubmit={sendMessage}>
          <input aria-label="聊天消息" value={draft} maxLength={120} onChange={(event) => setDraft(event.target.value)} />
          <button type="submit">发送</button>
        </form>
      </aside>

      <section className="room-team-panel" style={art(assets, 'roomTeamPanel')} aria-label="房间队伍">
        <h2>{room.name}</h2>
        {room.password && <span className="room-password">房间密码: {room.password}</span>}
        <div className="room-score" style={art(assets, 'roomScore')} aria-label={`红队 ${team === 'red' ? 1 : 0} 人，蓝队 ${team === 'blue' ? 1 : 0} 人`}>
          <span className="room-score-red">{team === 'red' ? 1 : 0}</span>
          <span className="room-score-blue">{team === 'blue' ? 1 : 0}</span>
        </div>
        <div className="room-teams-frame" style={art(assets, 'roomTeamFrame')}>
          {(['red', 'blue'] as const).map((side) => <div key={side} className={`room-team-list ${side}`} aria-label={side === 'red' ? '红队' : '蓝队'}>
            {TEAM_SLOTS.map((slot) => {
              const occupied = team === side && slot === 0;
              const available = slot < slotsPerTeam;
              return <button key={slot} className={`room-player-row${occupied ? ' occupied' : ''}`}
                style={art(assets, side === 'red' ? 'roomRedRow' : 'roomBlueRow')}
                aria-label={occupied ? `${hostName}，房主，${side === 'red' ? '红队' : '蓝队'}` : `${side === 'red' ? '红队' : '蓝队'}空位 ${slot + 1}`}
                disabled={!available || occupied} onClick={() => setTeam(side)}>
                {occupied && <><img className="room-player-job" src={hostIcon} alt="" /><span className="room-player-name">LV 1 {hostName}</span>
                  <img className="room-player-host" src={lobbyUrl(assets.ui.roomHost)} alt="房主" /></>}
              </button>;
            })}
          </div>)}
        </div>
        <div className="room-actions">
          <button className="room-action lobby-art-button" style={buttonArt(assets, 'practiceButton')} onClick={onLeave}>
            <img src={lobbyUrl(assets.ui.practiceIconBack)} alt="" />返回
          </button>
          <button className="room-action lobby-art-button" style={buttonArt(assets, 'practiceButton')}
            onClick={() => onStatus('邀请好友需要连接游戏服务器')}>
            <img src={lobbyUrl(assets.ui.roomIconInvite)} alt="" />邀请
          </button>
          <button className="room-action lobby-art-button" style={buttonArt(assets, 'practiceButton')} onClick={onSettings}>
            <img src={lobbyUrl(assets.ui.roomIconSetup)} alt="" />房间设置
          </button>
          <button className="room-action room-start lobby-art-button" style={buttonArt(assets, 'practiceStart')}
            onClick={() => { void document.body.requestPointerLock(); onStart(); }}>
            <img src={lobbyUrl(assets.ui.roomIconStart)} alt="" />开始游戏
          </button>
        </div>
      </section>
    </div>
    <div className="practice-room-title-bar" style={art(assets, 'practiceTitleBar')}>
      <div className="practice-room-title-tab" style={art(assets, 'practiceTitleTab')}><h1 className="practice-room-title">练习赛</h1></div>
    </div>
  </div>;
}
