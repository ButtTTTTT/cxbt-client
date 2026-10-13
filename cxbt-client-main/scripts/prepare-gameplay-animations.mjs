// Convert AvatarStar .anim clips into the gameplay animation JSON used by avatar.ts.
//
// The .anim container is: u32 version, u32 nodeCount, then per node
//   u32 nameLength, char[nameLength], u32 frameCount, u32 floatCount, f32[floatCount]
// where each frame is 3 position floats followed by 4 quaternion floats.
//
// Combo clips mirror the cached melee weapon animations: -attack1/2/3 come from
// stdshoot1/2/3 and -spurt from stdspurt1. Only the clips missing from the
// staged set are written, so the checked-in clips stay byte-identical.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(CLIENT, '../..');
const CACHE = join(ROOT, 'AvatarStar_cache/animation/character/thirdperson/male');
const OUTPUT = join(CLIENT, 'public/assets/gameplay/animations');
const FPS = 60;
const round = (value) => Math.round(value * 1e6) / 1e6;

// Python's json.dumps uses shortest-round-trip repr: scientific notation below
// 1e-4, a trailing .0 on whole floats and -0.0 for negative zero.
const number = (value) => {
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent < -4 || exponent >= 16) {
    return value.toExponential().replace(/e([+-])(\d)$/, 'e$10$2');
  }
  return Number.isInteger(value) ? `${value}.0` : String(value);
};
const floats = (values) => `[${values.map(number).join(',')}]`;

export function parseAnim(path) {
  const buffer = readFileSync(path);
  let offset = 0;
  const u32 = () => { const value = buffer.readUInt32LE(offset); offset += 4; return value; };
  const f32 = () => { const value = buffer.readFloatLE(offset); offset += 4; return value; };
  const version = u32();
  const nodeCount = u32();
  const tracks = [];
  for (let node = 0; node < nodeCount; node += 1) {
    const nameLength = u32();
    const name = buffer.toString('utf8', offset, offset + nameLength);
    offset += nameLength;
    const frameCount = u32();
    const floatCount = u32();
    if (floatCount !== frameCount * 7) throw new Error(`${path}: unexpected float count ${floatCount}`);
    const positions = [];
    const rotations = [];
    for (let frame = 0; frame < frameCount; frame += 1) {
      positions.push([round(f32()), round(f32()), round(f32())]);
      rotations.push([round(f32()), round(f32()), round(f32()), round(f32())]);
    }
    tracks.push({ name, positions, rotations });
  }
  return { version, tracks };
}

const constant = (track) => {
  const first = track.positions[0];
  const firstRotation = track.rotations[0];
  return track.positions.every((p) => p.every((v, i) => v === first[i]))
    && track.rotations.every((r) => r.every((v, i) => v === firstRotation[i]));
};

/** Long static tracks collapse to a single keyframe, mirroring the staged clips. */
export function toClip(source, absolute) {
  const { tracks } = parseAnim(absolute);
  const frames = tracks[0]?.positions.length ?? 1;
  const trimmed = tracks.map((track) => constant(track)
    ? { name: track.name, positions: [track.positions[0]], rotations: [track.rotations[0]] } : track);
  return { source, fps: FPS, duration: (frames - 1) / FPS, tracks: trimmed };
}

export function serializeClip(clip) {
  const tracks = clip.tracks.map((track) => `{"name":${JSON.stringify(track.name)},`
    + `"positions":[${track.positions.map(floats).join(',')}],`
    + `"rotations":[${track.rotations.map(floats).join(',')}]}`).join(',');
  return `{"source":${JSON.stringify(clip.source)},"fps":${clip.fps},`
    + `"duration":${number(clip.duration)},"tracks":[${tracks}]}`;
}

const CLIPS = [['attack1', 'stdshoot1'], ['attack2', 'stdshoot2'], ['attack3', 'stdshoot3'], ['spurt', 'stdspurt1']];

function main() {
  const sets = new Set();
  for (const entry of readdirSync(OUTPUT)) {
    const match = entry.match(/^(.*)-attack\.json$/);
    if (match) sets.add(match[1]);
  }
  let written = 0;
  for (const set of [...sets].sort()) {
    for (const [suffix, name] of CLIPS) {
      if (suffix === 'attack1') continue; // -attack.json already mirrors stdshoot1.
      const absolute = join(CACHE, set, `${name}.anim`);
      if (!existsSync(absolute)) continue;
      const source = `AvatarStar_cache/animation/character/thirdperson/male/${set}/${name}.anim`;
      mkdirSync(OUTPUT, { recursive: true });
      writeFileSync(join(OUTPUT, `${set}-${suffix}.json`), serializeClip(toClip(source, absolute)));
      written += 1;
    }
  }
  console.log(`Wrote ${written} combo clips for ${sets.size} melee weapon sets`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
