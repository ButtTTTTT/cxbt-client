import type { CSSProperties } from 'react';
import { apiFetch } from '../../api';
import type { LobbyAssets } from '../lobby/assets';
import { lobbyUrl } from '../lobby/assets';
import './GameModeLobby.css';

type GameModeLobbyProps = {
  assets: LobbyAssets;
  weaponIds?: string[];
  onStatus: (message: string) => void;
  onPractice: (joinedRoom?: any) => void;
};

type GameMode = {
  id: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

const GAME_MODES: GameMode[] = [
  { id: '01', label: '练习赛', left: 73, top: 292, width: 280, height: 229 },
  { id: '02', label: '战场', left: 471, top: 262, width: 381, height: 372 },
  { id: '03', label: '创想乐园', left: 780, top: 165, width: 282, height: 317 },
  { id: '04', label: '冒险远征', left: 720, top: 0, width: 293, height: 248 },
];

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

export default function GameModeLobby({ assets, weaponIds = [], onStatus, onPractice }: GameModeLobbyProps) {
  const startQuickMatch = async (modeId = 'team', modeName = '团队', mapId = 'level1', mapName = '训练场') => {
    try {
      onStatus('正在为您快速匹配战局…');
      const res = await apiFetch('/rooms/quickmatch', {
        method: 'POST',
        body: JSON.stringify({ modeId, modeName, mapId, mapName, weaponIds }),
      });
      if (res?.room) {
        onStatus(res.message || `已匹配进入房间 · ${res.room.name}`);
        onPractice(res.room);
      } else {
        onPractice();
      }
    } catch (e: any) {
      onStatus(e?.message || '已进入战区房间列表');
      onPractice();
    }
  };

  return <section className="game-mode-layer" aria-label="凌云要塞游戏模式" data-game-mode-ready="true">
    <div className="game-mode-map" style={art(assets, 'gameMap')}>
      <div className="game-mode-title" style={art(assets, 'gameTitleBar')}>
        <div className="game-mode-title-tab" style={art(assets, 'gameTitleTab')}><h1>凌云要塞</h1></div>
      </div>
      <button className="game-mode-theme game-mode-theme-05" style={buttonArt(assets, 'gameTheme05')}
        aria-label="凌云要塞" onClick={() => onStatus('凌云要塞 · 请选择下方游戏模式')} />
      {GAME_MODES.map((mode) => <button key={mode.id} className={`game-mode-theme game-mode-theme-${mode.id}`}
        style={{ ...buttonArt(assets, `gameTheme${mode.id}`), left: mode.left, top: mode.top, width: mode.width, height: mode.height }}
        aria-label={mode.label} onClick={() => {
          if (mode.id === '01') onPractice();
          else if (mode.id === '02') { onStatus('战场模式 · 已进入凌云要塞战区大厅'); onPractice(); }
          else if (mode.id === '03') window.location.href = `${import.meta.env.BASE_URL}sandbox`;
          else if (mode.id === '04') void startQuickMatch('occupy', '占点', 'level1', '远征要塞');
        }}>
        <span>{mode.label}</span>
      </button>)}
      <button className="game-mode-quick" style={buttonArt(assets, 'gameQuickMatch')} aria-label="快速匹配"
        onClick={() => void startQuickMatch()}><span>快速匹配</span></button>
    </div>
  </section>;
}
