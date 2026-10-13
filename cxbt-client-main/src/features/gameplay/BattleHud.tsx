import { useEffect, useState, type CSSProperties } from 'react';
import type { CreationWeapon } from '../characterCreation/assets';
import { BATTLE_QUICK_KEYS } from './hud';
import './BattleHud.css';

const BASE = `${import.meta.env.BASE_URL}assets/gameplay/ui/`;

function HudNumber({ value, className = '' }: { value: number | string; className?: string }) {
  return <span className={`battle-number ${className}`} aria-hidden="true">
    {String(value).split('').map((digit, index) => <i key={index} style={{ backgroundPositionX: `${Number(digit) / 9 * 100}%` }} />)}
  </span>;
}

export default function BattleHud({ scoreRed, scoreBlue, time, health, maxHealth, ammo, magazine, melee,
  weapons, skillIcons, selected, onSwitchWeapon }: {
  scoreRed: number;
  scoreBlue: number;
  time: string;
  health: number;
  maxHealth: number;
  ammo: number;
  magazine: number;
  melee: boolean;
  weapons: CreationWeapon[];
  skillIcons: string[];
  selected: number;
  onSwitchWeapon: (index: number) => void;
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
      <div className="battle-health" aria-label={`生命值 ${health} / ${maxHealth}`}>
        <span className="battle-health-meter" role="progressbar" aria-label="生命值" aria-valuemin={0} aria-valuemax={maxHealth} aria-valuenow={health}>
          <i style={{ height: `${healthRatio * 100}%` }} />
        </span>
        <img src={`${BASE}skin_ingame_heart02.png`} alt="" />
        <HudNumber value={health} />
      </div>
      <div className="battle-inventory" aria-label="物品栏">
        {BATTLE_QUICK_KEYS.map((key, index) => {
          const weapon = weapons[index];
          const skill = index >= weapons.length ? skillIcons[index - weapons.length] : undefined;
          const icon = weapon?.icon ? `${import.meta.env.BASE_URL}assets/creation/${weapon.icon}` : skill ? `${BASE}${skill}.png` : undefined;
          const content = <><small>{key}</small>{icon && <img src={icon} alt="" />}</>;
          return weapon ? <button key={key} className={`battle-slot${index === selected ? ' active' : ''}`}
            aria-label={`切换到${weapon.label}`} aria-pressed={index === selected} title={`${key} · ${weapon.label}`} onClick={() => onSwitchWeapon(index)}>
            {content}
          </button> : <span key={key} className={`battle-slot${skill ? ' battle-skill' : ' empty'}`} aria-label={`${key} ${skill ? '技能' : '空格'}`}>
            {content}
          </span>;
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
