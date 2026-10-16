import type { CSSProperties } from 'react';
import type { CreationJob } from '../characterCreation/assets';
import { lobbyUrl } from './assets';
import { BOSS_SKILL_SLOTS, skillTip, type Skill, type SkillAssets, type SkillKind } from './skills';

const KIND_LABEL: Record<SkillKind, string> = { active: '主动', passive: '被动' };
const art = (path: string) => ({ backgroundImage: `url("${lobbyUrl(path)}")` });
const buttonArt = (key: string) => ({ '--art': `url("${lobbyUrl(`ui/${key}_normal.png`)}")`,
  '--hover-art': `url("${lobbyUrl(`ui/${key}_hover.png`)}")`, '--down-art': `url("${lobbyUrl(`ui/${key}_down.png`)}")`,
  '--disabled-art': `url("${lobbyUrl(`ui/${key}_disabled.png`)}")` } as CSSProperties);

type Allocation = {
  levels: number[];
  pending: number[];
  points: number;
  dirty: boolean;
  maxLevel: number;
  add: (index: number) => void;
  remove: (index: number) => void;
  commit: () => void;
  reset: () => void;
  read: (values: number[], index: number) => number;
};

export default function SkillPanel({ assets, job, allocation, tab, onTab, onMessage, onEquipSkill }: {
  assets: SkillAssets; job: CreationJob;
  allocation: Allocation; tab: 'profession' | 'boss';
  onTab: (tab: 'profession' | 'boss') => void; onMessage: (message: string) => void;
  onEquipSkill?: (skillId: string) => void;
}) {
  const skills = assets.jobs[job].skills;
  const bossSkills = assets.bossSkills ?? [];
  const bar = assets.barWidths.at(-1) ?? 364;
  const { levels, pending, points, dirty, maxLevel } = allocation;
  const spent = levels.reduce((total, value) => total + value, 0);
  return <section className="lobby-skills" style={art('ui/skillPanel.png')} aria-label="技能">
    <nav className="lobby-skill-tabs" aria-label="技能分类">
      <button className={'lobby-art-button' + (tab === 'profession' ? ' active' : '')} style={buttonArt('skillTab')}
        aria-pressed={tab === 'profession'} onClick={() => onTab('profession')}>职业技能</button>
      <button className={'lobby-art-button' + (tab === 'boss' ? ' active' : '')} style={buttonArt('skillTab')}
        aria-pressed={tab === 'boss'} onClick={() => onTab('boss')}>副本技能</button>
    </nav>
    {tab === 'profession' ? <div className="lobby-skill-rows">
      {skills.map((skill: Skill, index) => {
        const level = allocation.read(pending, index);
        const learned = allocation.read(levels, index);
        const icon = level > 0 ? skill.icon : skill.disabledIcon ?? skill.icon;
        const drag = skill.kind === 'active' && level > 0;
        return <article key={skill.id} className="lobby-skill-row" style={art('ui/skillRow.png')} data-skill-id={skill.id}
          data-skill-level={level} data-skill-learned={learned}>
          <img className="lobby-skill-icon"
            src={lobbyUrl(icon)} alt="" title={skillTip(skill, level)} draggable={drag}
            onDragStart={(event) => { if (drag) event.dataTransfer.setData('text/plain', skill.id); }}
            onClick={() => {
              if (drag && onEquipSkill) {
                onEquipSkill(skill.id);
                onMessage(`${skill.name} · 已装备至快捷栏`);
              } else {
                onMessage(skillTip(skill, level).replace(/\n+/g, ' · '));
              }
            }} />
          <span className="lobby-skill-name">{skill.name}（{KIND_LABEL[skill.kind]}）</span>
          <div className="lobby-skill-bar" style={{ ...art('ui/skillBar.png'), backgroundSize: `${bar}px 31px` }}>
            <span className="lobby-skill-bar-pending" data-level={level}
              style={{ ...art('ui/skillBarPending.png'), width: assets.barWidths[level], backgroundSize: `${bar}px 31px` }} />
            <span className="lobby-skill-bar-learned" data-level={learned}
              style={{ ...art('ui/skillBarLearned.png'), width: assets.barWidths[learned], backgroundSize: `${bar}px 31px` }} />
          </div>
          <button className="lobby-art-button lobby-skill-remove" style={buttonArt('skillRemove')} disabled={level <= learned}
            aria-label={`降低${skill.name}等级`}
            onClick={() => { allocation.remove(index); onMessage(`${skill.name} · 等级 ${level - 1}`); }} />
          <button className="lobby-art-button lobby-skill-add" style={buttonArt('skillAdd')} disabled={level >= maxLevel || points <= 0}
            aria-label={`提升${skill.name}等级`}
            onClick={() => { allocation.add(index); onMessage(`${skill.name} · 等级 ${Math.min(level + 1, maxLevel)}`); }} />
        </article>;
      })}
      {skills.length === 0 && <p className="lobby-empty" role="status">当前职业没有可分配的职业技能</p>}
    </div> : <div className="lobby-boss-skills">
      {Array.from({ length: BOSS_SKILL_SLOTS }, (_, index) => {
        const bSkill = bossSkills[index];
        return <article key={bSkill?.id ?? index} className="lobby-boss-skill" data-boss-slot={index + 1}
          style={{ ...art('ui/bossSkillCard.png'), left: 9 + 288 * (index % 2), top: 13 + 141 * Math.floor(index / 2) }}>
          <span className="lobby-boss-skill-icon" aria-hidden="true"
            title={bSkill ? skillTip(bSkill, 1) : undefined}
            draggable={Boolean(bSkill)}
            onDragStart={(event) => { if (bSkill) event.dataTransfer.setData('text/plain', bSkill.id); }}
            style={bSkill ? { backgroundImage: `url("${lobbyUrl(bSkill.icon)}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', cursor: 'grab' } : undefined} />
          <div className="lobby-boss-skill-body" style={art('ui/bossSkillCardInner.png')}>
            <span className="lobby-boss-skill-name">{bSkill?.name ?? '未获得'}</span>
            <i className="lobby-boss-skill-line" style={art('ui/skillPartition.png')} />
            <span className="lobby-boss-skill-source" title={bSkill?.description ?? undefined}>{bSkill?.source ?? '副本技能由服务器发放'}</span>
            <button className="lobby-art-button lobby-boss-skill-get" style={buttonArt('bossSkillButton')}
              onClick={() => {
                if (bSkill) {
                  onEquipSkill?.(bSkill.id);
                  onMessage(`已解锁并装备副本首领技能：【${bSkill.name}】`);
                } else {
                  onMessage('副本技能需要连接游戏服务器领取');
                }
              }}>获取</button>
          </div>
        </article>;
      })}
    </div>}
    {tab === 'profession' && <>
      <button className="lobby-art-button lobby-skill-reset" style={buttonArt('button')} disabled={!dirty && spent === 0}
        onClick={() => { allocation.reset(); onMessage('技能点数已重置'); }}>重置</button>
      <div className="lobby-skill-points" style={art('ui/skillPoints.png')} role="status" aria-label="可用技能点数">
        <span>可用技能点数</span><b>{points}</b>
      </div>
      <button className="lobby-art-button lobby-skill-finish" style={buttonArt('button')} disabled={!dirty}
        onClick={() => { allocation.commit(); onMessage('技能点数已应用'); }}>完成</button>
    </>}
  </section>;
}

