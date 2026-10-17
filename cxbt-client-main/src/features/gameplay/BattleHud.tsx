import { useEffect, useState, type CSSProperties } from 'react';
import { BATTLE_QUICK_KEYS } from './hud';
import type { BattleSlot } from './skills';
import './BattleHud.css';

const BASE = `${import.meta.env.BASE_URL}assets/gameplay/ui/`;
const CREATION = `${import.meta.env.BASE_URL}assets/creation/`;
const LOBBY = `${import.meta.env.BASE_URL}assets/lobby/`;

function HudNumber({ value, className = '' }: { value: number | string; className?: string }) {
  return <span className={`battle-number ${className}`} aria-hidden="true">
    {String(value).split('').map((digit, index) => <i key={index} style={{ backgroundPositionX: `${Number(digit) / 9 * 100}%` }} />)}
  </span>;
}

export default function BattleHud({ scoreRed, scoreBlue, time, health, maxHealth, shield, ammo, magazine, melee,
  slots, cooldowns, selectedSlot, isFlying = false, onSelect }: {
  scoreRed: number;
  scoreBlue: number;
  time: string;
  health: number;
  maxHealth: number;
  shield: number;
  ammo: number;
  magazine: number;
  melee: boolean;
  /** Lobby quickbar mirrored slot for slot: weapons, active skills, flight gear (wings) and empty slots. */
  slots: BattleSlot[];
  cooldowns: number[];
  selectedSlot: number;
  isFlying?: boolean;
  onSelect: (slot: number) => void;
}) {
  const [scale, setScale] = useState(() => Math.min(1, innerWidth / 1160));
  useEffect(() => {
    const resize = () => setScale(Math.min(1, innerWidth / 1160));
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);
  const healthRatio = Math.max(0, Math.min(1, health / maxHealth));

  return <div className="battle-hud" style={{ '--battle-hud-scale': scale } as CSSProperties}>
    <div className="battle-top" aria-label={`红队 ${scoreRed}，蓝队 ${scoreBlue}，剩余时间 ${time}`}>
      <div className="battle-score-rail" />
      <div className="battle-team red"><HudNumber value={String(scoreRed).padStart(2, '0')} /></div>
      <img className="battle-mode-icon" src={`${BASE}skin_ingame_tuanzhan.png`} alt="" />
      <div className="battle-time"><em>TIME</em><span>{time}</span></div>
      <div className="battle-team blue"><HudNumber value={String(scoreBlue).padStart(2, '0')} /></div>
    </div>
    <div className="battle-bottom">
      <div className="battle-health" aria-label={`生命值 ${health} / ${maxHealth}${shield > 0 ? `，护盾 ${shield}` : ''}`}>
        <span className="battle-health-meter" role="progressbar" aria-label="生命值" aria-valuemin={0} aria-valuemax={maxHealth} aria-valuenow={health}>
          <i style={{ height: `${healthRatio * 100}%` }} />
        </span>
        <img src={`${BASE}skin_ingame_heart02.png`} alt="" />
        {shield > 0 && <span className="battle-shield" aria-hidden="true">{Math.ceil(shield)}</span>}
        <HudNumber value={health} />
      </div>
      <div className="battle-inventory" aria-label="物品栏">
        {BATTLE_QUICK_KEYS.map((key, index) => {
          const slot = slots[index];
          if (!slot || slot.kind === 'empty') {
            return <span key={key} className="battle-slot empty" aria-label={`${key} 空格`}><small>{key}</small></span>;
          }
          const skill = slot.kind === 'skill';
          const isWing = slot.kind === 'wing';
          const isItem = slot.kind === 'item';
          const icon = isWing || isItem
            ? `${LOBBY}${slot.icon}`
            : skill
              ? `${LOBBY}${slot.load.skill.icon}`
              : slot.lobbyIcon
                ? `${LOBBY}${slot.lobbyIcon}`
                : `${CREATION}${slot.weapon.icon}`;
          const label = isWing || isItem
            ? slot.label
            : skill
              ? slot.load.skill.name
              : slot.label || slot.weapon.label;
          const cooldown = skill ? cooldowns[index] ?? 0 : 0;
          const total = skill ? slot.load.cooldown : 1;
          const active = index === selectedSlot || (isWing && isFlying);
          return <button key={key} type="button" className={`battle-slot${active ? ' active' : ''}${skill ? ' battle-skill' : ''}${isWing ? ' battle-wing' : ''}`}
            aria-label={`${key} · ${label}${skill ? '（技能）' : isWing ? '（飞行器·点击/按键切换展翼飞行）' : ''}`}
            aria-pressed={active}
            title={`${key} · ${label}${isWing ? ' (点击或按快捷键展翼飞行 / 长按空格滑翔爬升)' : ''}`}
            onClick={() => onSelect(index)}>
            <small>{key}</small>
            <img src={icon} alt="" />
            {cooldown > 0 && <i className="battle-slot-cooldown" style={{ height: `${Math.min(100, cooldown / total * 100)}%` }} />}
            {cooldown > 0 && <b className="battle-slot-timer">{Math.ceil(cooldown)}</b>}
          </button>;
        })}
      </div>
      <div className="battle-ammo" aria-label={melee ? '近战武器' : `弹药 ${ammo} / ${magazine}`}>
        <span className="battle-ammo-meter" role="progressbar" aria-label="弹夹" aria-valuemin={0} aria-valuemax={magazine} aria-valuenow={ammo}>
          <i />
        </span>
        <img className="battle-ammo-gloss" src={`${BASE}skin_ingame_danyao_02.png`} alt="" />
        <img className="battle-ammo-icon" src={`${BASE}skin_ingame_icon_ammobg_row.png`} alt="" />
        {melee ? <span className="battle-ammo-infinite">∞</span> : <HudNumber value={ammo} />}
      </div>
    </div>
  </div>;
}
