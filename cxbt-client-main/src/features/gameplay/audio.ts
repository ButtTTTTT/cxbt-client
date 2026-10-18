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
  const pools = new Map<string, { items: HTMLAudioElement[]; cursor: number; lastPlayedAt: number }>();

  const start = () => {
    if (music.paused) void music.play().catch(() => {});
    if (ambience.paused) void ambience.play().catch(() => {});
  };
  const pause = () => { music.pause(); ambience.pause(); };
  const play = (name: string, volume = 0.55) => {
    const resolved = SOUND_ALIASES[name] ?? name;
    const now = performance.now();
    let entry = pools.get(resolved);
    if (!entry) {
      const items: HTMLAudioElement[] = [];
      for (let i = 0; i < 4; i++) {
        const el = new Audio(`${BASE}${resolved}.wav`);
        el.preload = 'auto';
        items.push(el);
      }
      entry = { items, cursor: 0, lastPlayedAt: 0 };
      pools.set(resolved, entry);
    }
    // Prevent audio decode/channel storms when multi-pellet weapons or rapid hits trigger in the same frame
    if (now - entry.lastPlayedAt < 38) return;
    entry.lastPlayedAt = now;

    const effect = entry.items[entry.cursor];
    entry.cursor = (entry.cursor + 1) % entry.items.length;
    try {
      effect.volume = volume;
      effect.currentTime = 0;
      void effect.play().catch(() => {});
    } catch {}
  };
  const dispose = () => {
    pause();
    for (const entry of pools.values()) {
      for (const el of entry.items) {
        el.pause();
      }
    }
    pools.clear();
  };
  return { start, pause, play, dispose };
}

