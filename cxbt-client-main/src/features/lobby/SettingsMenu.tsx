import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { lobbyUrl, type LobbyAssets } from './assets';
import './SettingsMenu.css';

type Page = 'menu' | 'video' | 'audio' | 'keys';
const TITLES = { menu: '设置', video: '影像调整', audio: '音效调整', keys: '按键设定' };
const KEYS = [['移动', 'W / A / S / D'], ['跳跃', '空格'], ['翻滚', 'Ctrl / Shift'], ['开火', '鼠标左键'],
  ['转动视角', '鼠标右键'], ['换弹', 'R'], ['切换武器', '1 / 2 / 3'], ['菜单', 'Esc']];

export default function SettingsMenu({ assets, volume, effectsVolume, motion, onVolume, onEffectsVolume,
  onMotion, onClose, onExit, onQuit }: {
  assets: Pick<LobbyAssets, 'ui'>;
  volume: number;
  effectsVolume: number;
  motion: boolean;
  onVolume: (value: number) => void;
  onEffectsVolume: (value: number) => void;
  onMotion: (value: boolean) => void;
  onClose: () => void;
  onExit: () => void;
  onQuit: () => void;
}) {
  const [page, setPage] = useState<Page>('menu');
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>('button, input');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    addEventListener('keydown', keydown, true);
    return () => {
      removeEventListener('keydown', keydown, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => { panelRef.current?.querySelector<HTMLElement>('button')?.focus(); }, [page]);
  const art = (key: string): CSSProperties => ({ backgroundImage: `url("${lobbyUrl(assets.ui[key])}")` });
  const buttonArt = (key: string): CSSProperties => ({
    '--art': `url("${lobbyUrl(assets.ui[key + '_normal'])}")`,
    '--hover-art': `url("${lobbyUrl(assets.ui[key + '_hover'])}")`,
    '--down-art': `url("${lobbyUrl(assets.ui[key + '_down'])}")`,
  } as CSSProperties);
  const actions = [
    { label: '影像调整', action: () => setPage('video'), top: 15 },
    { label: '音效调整', action: () => setPage('audio'), top: 56 },
    { label: '按键设定', action: () => setPage('keys'), top: 97 },
    { label: '返回角色选单', action: onExit, top: 138 },
    { label: '退出游戏', action: onQuit, top: 220 },
    { label: '返回游戏', action: onClose, top: 297 },
  ];
  return <div className="settings-menu-shade">
    <section ref={panelRef} className="settings-menu" style={art('settingsPanel')} role="dialog" aria-modal="true" aria-labelledby="settings-menu-title">
      <h2 id="settings-menu-title">{TITLES[page]}</h2>
      <button className="settings-menu-close lobby-art-button" style={buttonArt('settingsClose')} aria-label="关闭设置" onClick={onClose} />
      <div className="settings-menu-inner" style={art('settingsInner')}>
        {page === 'menu' ? actions.map(({ label, action, top }) => <button key={label} className="settings-menu-action lobby-art-button"
          style={{ ...buttonArt('settingsButton'), top }} onClick={action}>{label}</button>) : <>
          <div className="settings-menu-options">
            {page === 'audio' && <>
              <label>音乐音量 <output>{Math.round(volume * 100)}%</output><input aria-label="音乐音量" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => onVolume(Number(event.target.value))} /></label>
              <label>音效音量 <output>{Math.round(effectsVolume * 100)}%</output><input aria-label="音效音量" type="range" min="0" max="1" step="0.01" value={effectsVolume} onChange={event => onEffectsVolume(Number(event.target.value))} /></label>
            </>}
            {page === 'video' && <>
              <label className="settings-menu-check"><input type="checkbox" checked={motion} onChange={event => onMotion(event.target.checked)} />播放角色动作</label>
              <button className="settings-menu-option-button lobby-art-button" style={buttonArt('settingsButton')} onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen().catch(() => undefined);
              }}>切换全屏</button>
            </>}
            {page === 'keys' && <dl className="settings-menu-keys">{KEYS.map(([action, key]) => <div key={action}><dt>{action}</dt><dd>{key}</dd></div>)}</dl>}
          </div>
          <button className="settings-menu-action lobby-art-button" style={{ ...buttonArt('settingsButton'), top: 297 }} onClick={() => setPage('menu')}>返回</button>
        </>}
      </div>
    </section>
  </div>;
}
