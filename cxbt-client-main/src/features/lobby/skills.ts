import { useEffect, useMemo, useState } from 'react';
import type { CreationJob } from '../characterCreation/assets';
import { lobbyUrl } from './assets';

export type SkillKind = 'active' | 'passive';
export type Skill = {
  id: string;
  name: string;
  kind: SkillKind;
  icon: string;
  disabledIcon: string | null;
  tip?: string | null;
  source?: string | null;
  description: string | null;
  levels: (string | null)[];
};
export type SkillJob = { name: string; skills: Skill[] };
export type SkillAssets = {
  maxLevel: number;
  barWidths: number[];
  jobs: Record<CreationJob, SkillJob>;
  bossSkills?: Skill[];
};


// personalInfo.lua stores the server's leftpoints in skillLeave and lists five
// rows per class. The class screenshots show every skill at level 1 with 10
// points left, so the offline client starts from that display default (see
// README: 展示初值) instead of the server's own progression.
export const SKILL_BASE_LEVEL = 1;
export const SKILL_POINTS = 15;
export const BOSS_SKILL_SLOTS = 6;

// 内存级技能数据缓存，避免大厅重挂载时重复拉取解析 skills.json
let cachedSkillAssets: SkillAssets | null = null;

export async function loadSkillAssets(signal?: AbortSignal): Promise<SkillAssets> {
  if (cachedSkillAssets) return cachedSkillAssets;
  const response = await fetch(lobbyUrl('skills.json'), { signal });
  if (!response.ok) throw new Error('技能素材加载失败');
  const data = await response.json() as SkillAssets;
  cachedSkillAssets = data;
  return data;
}

export function skillTip(skill: Skill, level: number): string {
  const lines = [`${skill.name}（${skill.kind === 'active' ? '主动' : '被动'}）`];
  if (skill.description) lines.push(skill.description);
  if (level > 0 && skill.levels[level - 1]) lines.push(`等级 ${level}：\n${skill.levels[level - 1]}`);
  else if (level === 0) lines.push('尚未学习：点击 + 分配技能点数。');
  return lines.join('\n\n');
}

/** pending is the panel's working copy; 完成 commits it, 重置 refunds everything. */
export function useSkillAllocation(assets: SkillAssets | undefined, jobId: CreationJob) {
  const skills = useMemo(() => assets?.jobs[jobId]?.skills ?? [], [assets, jobId]);
  const maxLevel = assets?.maxLevel ?? 5;
  const [levels, setLevels] = useState<number[]>(() => skills.map(() => SKILL_BASE_LEVEL));
  const [pending, setPending] = useState<number[]>(() => skills.map(() => SKILL_BASE_LEVEL));
  useEffect(() => { setLevels(skills.map(() => SKILL_BASE_LEVEL)); setPending(skills.map(() => SKILL_BASE_LEVEL)); }, [skills]);
  const read = (values: number[], index: number) => values[index] ?? 0;
  const points = SKILL_POINTS - pending.reduce((total, value) => total + value, 0);
  const dirty = skills.some((_, index) => read(pending, index) !== read(levels, index));
  const add = (index: number) => setPending((values) => values.map((value, i) => i === index && value < maxLevel && points > 0 ? value + 1 : value));
  const remove = (index: number) => setPending((values) => values.map((value, i) => i === index && value > read(levels, index) ? value - 1 : value));
  const commit = () => setLevels(pending.map((value) => value));
  const reset = () => { setLevels(skills.map(() => 0)); setPending(skills.map(() => 0)); };
  return { skills, levels, pending, points, dirty, maxLevel, add, remove, commit, reset, read };
}
