import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { LobbyAssets } from '../lobby/assets';
import { lobbyUrl } from '../lobby/assets';
import type { RoomConfig } from './CreateRoomDialog';
import './RoomSettings.css';
import { apiFetch, WS_BASE } from '../../api';
import { VoiceChatManager, type VoiceManagerSnapshot } from '../../network/VoiceChatManager';

type RoomSettingsProps = {
  assets: LobbyAssets;
  room: RoomConfig;
  hostName: string;
  hostIcon: string;
  onLeave: () => void;
  onSettings: () => void;
  onRoomUpdate?: (room: RoomConfig) => void;
  onStart: (room?: any) => void;
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

export default function RoomSettings({ assets, room, hostName, hostIcon, onLeave, onSettings, onRoomUpdate, onStart, onStatus }: RoomSettingsProps) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<string[]>([`进入房间: ${room.name}`]);
  const voiceMgrRef = useRef<VoiceChatManager | null>(null);
  const [voiceSnap, setVoiceSnap] = useState<VoiceManagerSnapshot | null>(null);
  const map = assets.maps.find((entry) => entry.id === room.mapId);
  const mapImage = map?.roomImage ?? map?.cover ?? (room.mapId === 'random' ? 'ui/createRoomMapRandom.png' : null);
  const slotsPerTeam = Math.min(8, Math.ceil(room.maxPlayers / 2));
  const players = Object.values((room as any).players || {}) as any[];
  const redPlayers = players.filter(p => p.team === 'red');
  const bluePlayers = players.filter(p => p.team === 'blue');
  const startedRef = useRef(false);
  const startRef = useRef(onStart);
  const updateRef = useRef(onRoomUpdate);
  useEffect(() => { startRef.current = onStart; }, [onStart]);
  useEffect(() => { updateRef.current = onRoomUpdate; }, [onRoomUpdate]);

  const enterBattle = (roomId: string) => {
    if (startedRef.current) return;
    startedRef.current = true;
    Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
    apiFetch('/rooms').then((rooms: any) => {
      const latest = (rooms || []).find((entry: any) => entry.id === roomId);
      startRef.current(latest ?? undefined);
    }).catch(() => startRef.current());
  };

  const switchTeam = async (side: 'red' | 'blue') => {
    if (!room.id) return;
    try {
      const updated = await apiFetch(`/rooms/${room.id}/team`, {
        method: 'POST',
        body: JSON.stringify({ team: side }),
      });
      if (updated) updateRef.current?.(updated);
      voiceMgrRef.current?.updateTeam(side);
      onStatus(`已切换至${side === 'red' ? '红队' : '蓝队'}`);
    } catch {
      // ignore if same team
    }
  };

  const appendRoomChat = (line: string) => {
    setMessages((current) => {
      if (current[current.length - 1] === line) return current;
      return [...current.slice(-47), line];
    });
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    appendRoomChat(`${hostName}: ${message}`);
    const ws = (window as any)._roomWs;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'chat', roomId: room.id, channel: room.id || 'room', message, userId: hostName }));
    }
    void apiFetch('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ channel: room.id || 'room', roomId: room.id || '', message, sender: hostName }),
    }).catch(() => undefined);
    setDraft('');
  };

  useEffect(() => {
    if (!room.id) return;
    const roomId = room.id;
    const mePlayer = players.find((p: any) => p.username === hostName);
    const myPlayerId = mePlayer?.userId ? String(mePlayer.userId) : hostName;

    apiFetch(`/chat/history?channel=${encodeURIComponent(roomId)}`)
      .then((rows: any[]) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setMessages([
            `进入房间: ${room.name}`,
            ...rows.slice(-20).map((r) => `${r.sender}: ${r.message}`),
          ]);
        }
      })
      .catch(() => undefined);
    const ws = new WebSocket(`${WS_BASE}?roomId=${roomId}&playerId=${encodeURIComponent(myPlayerId)}`);
    (window as any)._roomWs = ws;

    const voiceMgr = new VoiceChatManager({
      roomId,
      userId: myPlayerId,
      username: hostName,
      team: mePlayer?.team === 'blue' ? 'blue' : 'red',
      externalSendJSON: (pkt) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(pkt));
        }
      },
    });
    voiceMgrRef.current = voiceMgr;
    const unsubVoice = voiceMgr.subscribe((snap) => setVoiceSnap(snap));

    ws.onopen = () => {
      voiceMgr.sendVoiceState('voice_join');
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (voiceMgr.handleServerMessage(msg)) return;
        if (msg.type === 'room_closed') {
          onLeave();
          return;
        }
        if (msg.room) {
          updateRef.current?.(msg.room);
        }
        if (msg.type === 'start_game') {
          enterBattle(roomId);
        } else if (msg.type === 'join' || msg.type === 'leave') {
          appendRoomChat(`系统: 玩家 ${msg.userId} ${msg.type === 'join' ? '进入' : '离开'}了房间`);
        } else if (msg.type === 'chat') {
          appendRoomChat(`${msg.sender || msg.userId}: ${msg.message}`);
        }
      } catch {
        // ignore malformed message
      }
    };

    const onBeforeUnload = () => {
      if (!startedRef.current && roomId) {
        void apiFetch(`/rooms/${roomId}/leave`, { method: 'POST', keepalive: true }).catch(() => undefined);
      }
    };
    const onRoomKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.code === 'KeyT') {
        event.preventDefault();
        if (!event.repeat) {
          void voiceMgrRef.current?.setPushToTalkPressed(true);
          onStatus('🎙️ 正在按住 [T] 键进行房间实时语音通话...');
        }
      } else if (event.code === 'KeyY' && !event.repeat) {
        event.preventDefault();
        const willEnable = !voiceMgrRef.current?.micEnabled;
        void voiceMgrRef.current?.toggleMicrophone();
        onStatus(willEnable ? '🎙️ 已开启房间自由麦语音 [按 Y 关闭]' : '🔇 已关闭房间麦克风 [按 Y 开启]');
      }
    };
    const onRoomKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyT') {
        void voiceMgrRef.current?.setPushToTalkPressed(false);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onRoomKeyDown, { capture: true });
    window.addEventListener('keyup', onRoomKeyUp, { capture: true });

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onRoomKeyDown, { capture: true });
      window.removeEventListener('keyup', onRoomKeyUp, { capture: true });
      unsubVoice();
      voiceMgr.destroy();
      voiceMgrRef.current = null;
      ws.close();
    };
  }, [room.id, hostName]);


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

        {/* 房间备战玩家麦克风语音控制条 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 4,
            background: 'rgba(15, 23, 42, 0.88)',
            border: `1px solid ${voiceSnap?.speaking ? '#34d399' : '#7e5634'}`,
            borderRadius: 6,
            padding: '4px 6px',
            margin: '4px 8px 2px',
            fontSize: 11,
            color: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={() => void voiceMgrRef.current?.toggleMicrophone()}
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              border: '1px solid',
              borderColor: voiceSnap?.micEnabled ? '#10b981' : '#64748b',
              background: voiceSnap?.micEnabled ? '#065f46' : '#1e293b',
              color: '#fff',
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {voiceSnap?.micEnabled ? '🎙️ 房间麦已开 [Y]' : '🔇 开启麦克风 [Y]'}
          </button>
          <button
            type="button"
            onClick={() =>
              voiceMgrRef.current?.setMode(voiceSnap?.mode === 'free' ? 'ptt' : 'free')
            }
            onPointerDown={() => {
              if (voiceSnap?.mode !== 'free') {
                void voiceMgrRef.current?.setPushToTalkPressed(true);
              }
            }}
            onPointerUp={() => {
              if (voiceSnap?.mode !== 'free') {
                void voiceMgrRef.current?.setPushToTalkPressed(false);
              }
            }}
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              border: '1px solid #38bdf8',
              background:
                voiceSnap?.mode === 'free'
                  ? '#0284c7'
                  : voiceSnap?.pttPressed
                    ? '#059669'
                    : '#0f172a',
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {voiceSnap?.mode === 'free'
              ? '🔊 自由麦'
              : voiceSnap?.pttPressed
                ? '📡 发射中 [T]'
                : '🎙️ 按住[T]说话'}
          </button>
          <button
            type="button"
            onClick={() =>
              voiceMgrRef.current?.setServerLoopback(!voiceSnap?.serverLoopback)
            }
            style={{
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid #f59e0b',
              background: voiceSnap?.serverLoopback ? '#78350f' : '#1e293b',
              color: '#fef3c7',
              fontSize: 10,
              cursor: 'pointer',
            }}
            title="开启服务端耳返测试麦克风声音"
          >
            {voiceSnap?.serverLoopback ? '🎧 耳返中' : '🎧 耳返'}
          </button>
          <div
            style={{
              flex: 1,
              minWidth: 38,
              height: 6,
              background: '#090d16',
              borderRadius: 3,
              overflow: 'hidden',
              border: '1px solid #334155',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, voiceSnap?.inputVolume ?? 0)}%`,
                height: '100%',
                background: voiceSnap?.speaking
                  ? 'linear-gradient(90deg, #10b981, #38bdf8)'
                  : '#475569',
              }}
            />
          </div>
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
        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {room.name} 
          <span style={{ fontSize: '12px', color: '#f5e9c9', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '4px', border: '1px solid #7e5634' }}>
            ID: {(room as any).id}
          </span>
        </h2>
        {room.password && <span className="room-password">房间密码: {room.password}</span>}
        <div className="room-score" style={art(assets, 'roomScore')} aria-label={`红队 ${redPlayers.length} 人，蓝队 ${bluePlayers.length} 人`}>
          <span className="room-score-red">{redPlayers.length}</span>
          <span className="room-score-blue">{bluePlayers.length}</span>
        </div>
        <div className="room-teams-frame" style={art(assets, 'roomTeamFrame')}>
          {(['red', 'blue'] as const).map((side) => {
            const teamPlayers = side === 'red' ? redPlayers : bluePlayers;
            return <div key={side} className={`room-team-list ${side}`} aria-label={side === 'red' ? '红队' : '蓝队'}>
              {TEAM_SLOTS.map((slot) => {
                const player = teamPlayers[slot];
                const occupied = !!player;
                const available = slot < slotsPerTeam;
                const isHost = player && player.userId === (room as any).hostId;
                const isSpeaking = occupied && (
                  (player.username === hostName && voiceSnap?.speaking) ||
                  voiceSnap?.participants.some((vp) => vp.username === player.username && vp.speaking)
                );
                
                return <button key={slot} className={`room-player-row${occupied ? ' occupied' : ''}`}
                  style={art(assets, side === 'red' ? 'roomRedRow' : 'roomBlueRow')}
                  aria-label={occupied ? `${player.username}，${isHost ? '房主' : '玩家'}，${side === 'red' ? '红队' : '蓝队'}` : `${side === 'red' ? '红队' : '蓝队'}空位 ${slot + 1}`}
                  disabled={!available || occupied} onClick={() => void switchTeam(side)}>
                  {occupied && <><img className="room-player-job" src={hostIcon} alt="" /><span className="room-player-name">LV {player.level || 1} {player.username} {isSpeaking ? '🔊' : ''}</span>
                    {isHost && <img className="room-player-host" src={lobbyUrl(assets.ui.roomHost)} alt="房主" />}</>}
                </button>;
              })}
            </div>;
          })}
        </div>
        <div className="room-actions">
          <button className="room-action lobby-art-button" style={buttonArt(assets, 'practiceButton')} onClick={async () => {
            try {
              if (room.id) await apiFetch(`/rooms/${room.id}/leave`, { method: 'POST' });
              onLeave();
            } catch (_e) {
              onLeave();
            }
          }}>
            <img src={lobbyUrl(assets.ui.practiceIconBack)} alt="" />返回
          </button>
          <button className="room-action lobby-art-button" style={buttonArt(assets, 'practiceButton')}
            onClick={async () => {
              try {
                if (room.id) {
                  await apiFetch(`/rooms/${room.id}/invite`, { method: 'POST' });
                  onStatus('邀请已发送至全局频道');
                }
              } catch (e: any) {
                onStatus(e.message || '邀请失败');
              }
            }}>
            <img src={lobbyUrl(assets.ui.roomIconInvite)} alt="" />邀请
          </button>
          <button className="room-action lobby-art-button" style={buttonArt(assets, 'practiceButton')} onClick={onSettings}>
            <img src={lobbyUrl(assets.ui.roomIconSetup)} alt="" />房间设置
          </button>
          <button className="room-action room-start lobby-art-button" style={buttonArt(assets, 'practiceStart')}
            onClick={async () => {
              try {
                if (room.id) {
                  await apiFetch(`/rooms/${room.id}/start`, { method: 'POST' });
                  for (let attempt = 0; attempt < 10 && !startedRef.current; attempt += 1) {
                    await new Promise((resolve) => setTimeout(resolve, 750));
                    if (startedRef.current) break;
                    const rooms: any[] = await apiFetch('/rooms').catch(() => []);
                    if ((rooms ?? []).some((entry: any) => entry.id === room.id && entry.state === 'Playing')) enterBattle(room.id);
                  }
                } else {
                  Promise.resolve(document.body.requestPointerLock?.()).catch(() => {});
                  onStart();
                }
              } catch (e: any) {
                onStatus(e.message || '无法开始游戏');
              }
            }}>
            <img src={lobbyUrl(assets.ui.roomIconStart)} alt="" />开始游戏
          </button>
        </div>
      </section>
    </div>
    <div className="practice-room-title-tab" style={art(assets, 'practiceTitleTab')}><h1 className="practice-room-title">练习赛</h1></div>
  </div>;
}
