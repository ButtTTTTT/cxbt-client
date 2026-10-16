const BASE = `${import.meta.env.BASE_URL}assets/gameplay/audio/`;

const SOUND_ALIASES: Record<string, string> = {
  hit: 'hit_body',
  'grenade-explode': 'explosion_rpg',
  hit_crossbow: 'sb-at_crossbow-hit',
  'skill-wild': 'skill-overreaction',
  'skill-pet_skill01': 'skill-cure',
};

export function createBattleAudio(ambienceName?: string | null) {
  const music = new Audio(`${BASE}battle.ogg`);
  const ambienceFile = ['ambience_day', 'alien_boss', 'castle'].includes(ambienceName ?? '')
    ? ambienceName : 'ambience_day';
  const ambience = new Audio(`${BASE}${ambienceFile}.ogg`);
  music.loop = true;
  ambience.loop = true;
  music.volume = 0.25;
  ambience.volume = 0.16;
  const effects = new Set<HTMLAudioElement>();

  const start = () => {
    if (music.paused) void music.play().catch(() => {});
    if (ambience.paused) void ambience.play().catch(() => {});
  };
  const pause = () => { music.pause(); ambience.pause(); };
  const play = (name: string, volume = 0.55) => {
    const resolved = SOUND_ALIASES[name] ?? name;
    const effect = new Audio(`${BASE}${resolved}.wav`);
    effect.volume = volume;
    effects.add(effect);
    effect.addEventListener('ended', () => effects.delete(effect), { once: true });
    void effect.play().catch(() => effects.delete(effect));
  };
  const dispose = () => {
    pause();
    effects.forEach((effect) => effect.pause());
    effects.clear();
  };
  return { start, pause, play, dispose };
}

