import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl, type Appearance, type CreationAssets, type CreationAttachment, type CreationPreset, type CreationWeapon } from '../characterCreation/assets';
import { createStylizedWeaponMesh, enhanceLoadedWeaponModel } from './engine/ProceduralWeaponBuilder';

type ClipData = {
  fps: number;
  duration?: number;
  tracks: { name: string; positions: number[][]; rotations: number[][] }[];
};

const LOWER_BODY_BONES = new Set([
  'root', 'pelvis', 'hip_l', 'leg_l', 'foot_l', 'toe_l', 'hip_r', 'leg_r', 'foot_r', 'toe_r'
]);

function makeUpperBodyClip(clip: any): any {
  if (!clip) return null;
  const upperTracks = clip.tracks.filter((track: any) => {
    const boneName = String(track.name || '').split('.')[0].toLowerCase();
    return !LOWER_BODY_BONES.has(boneName);
  });
  return new THREE.AnimationClip(`${clip.name}_upper`, clip.duration, upperTracks);
}

export type BattleAvatar = {
  root: any;
  skeleton?: any;
  update: (delta: number) => void;
  setMoving: (moving: boolean) => void;
  setWeapon: (index: number) => void;
  jump: () => void;
  doubleJump?: () => void;
  setFlying?: (flying: boolean) => void;
  roll: () => void;
  /** Plays one hit of the weapon combo; melee weapons carry up to three hits. */
  attack: (step?: number) => void;
  spurt: () => void;
  hit?: () => void;
  die?: () => void;
  revive?: () => void;
  playSkillAnim?: (skillAnimName: string) => Promise<void>;
  /** Fades the avatar while the stealth skill is active. */
  setGhost: (on: boolean) => void;
  /** Freezes or resumes the animation mixer (影像调整 · 播放角色动作). */
  setMotion: (on: boolean) => void;
  reload: () => void;
  getMuzzlePosition?: (outTarget?: any) => any;
  setAttachment?: (attachment?: CreationAttachment | null) => Promise<void>;
  getWingTipPositions?: () => { left: any; right: any; wingId: string } | null;
  playGesture?: (animationPath: string) => Promise<void>;
  dispose: () => void;
};

export async function createBattleAvatar(assets: CreationAssets, preset: CreationPreset,
  appearance: Appearance, weapons: CreationWeapon[]): Promise<BattleAvatar> {
  const effectiveWeapons = weapons && weapons.length > 0
    ? weapons
    : (assets.jobs.guardian?.weapons ?? []);
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const textures: any[] = [];
  const materials: any[] = [];
  const loadModel = async (path: string) => (await loader.loadAsync(assetUrl(path))).scene;
  const loadTexture = async (path: string) => {
    const texture = await textureLoader.loadAsync(assetUrl(path));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    textures.push(texture);
    return texture;
  };
  const material = (map: any, color = '#ffffff', transparent = false) => {
    const result = new THREE.MeshPhongMaterial({ map, color, shininess: 12,
      specular: '#191319', transparent, depthWrite: !transparent, alphaTest: transparent ? 0.015 : 0 });
    materials.push(result);
    return result;
  };
  const root = await loadModel(assets.models.body01);
  const bodyMap = await loadTexture(preset.body);
  let skeleton: any;
  root.traverse((object: any) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    if (!skeleton || (object.skeleton?.bones?.length ?? 0) > (skeleton?.bones?.length ?? 0)) {
      skeleton = object.skeleton;
    }
    object.material = material(bodyMap);
    object.frustumCulled = false;
  });
  if (!skeleton) throw new Error('角色骨骼缺失');
  const bones = skeleton;
  const boneIndices = new Map<string, number>(bones.bones.map((bone: any, index: number) => [bone.name, index]));
  root.updateMatrixWorld(true);
  const bindQuats = new Map<string, any>();
  for (const b of bones.bones) {
    const q = new THREE.Quaternion();
    b.getWorldQuaternion(q);
    bindQuats.set(b.name, q);
  }
  const addPart = async (path: string, partMaterial: any, offset?: number[]) => {
    const part = await loadModel(path);
    const group = new THREE.Group();
    const meshes: any[] = [];
    part.traverse((object: any) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    for (const object of meshes) {
      if (offset) object.geometry.translate(offset[0], offset[1], offset[2]);
      if (object instanceof THREE.SkinnedMesh) {
        const indices = object.geometry.attributes.skinIndex;
        const oldSkeleton = object.skeleton;
        for (let index = 0; index < indices.array.length; index += 1) {
          const target = boneIndices.get(oldSkeleton.bones[indices.array[index]].name);
          if (target === undefined) throw new Error('角色配件骨骼缺失');
          indices.array[index] = target;
        }
        indices.needsUpdate = true;
        object.bind(bones, new THREE.Matrix4());
      }
      object.material.dispose();
      object.material = partMaterial;
      object.frustumCulled = false;
      group.add(object);
    }
    root.add(group);
    return group;
  };

  const eyes = await Promise.all(preset.eyes.map(loadTexture));
  const rightEyes = preset.rightEyes ? await Promise.all(preset.rightEyes.map(loadTexture)) : eyes.map((texture) => {
    const mirror = texture.clone();
    mirror.repeat.x = -1;
    mirror.offset.x = 1;
    mirror.needsUpdate = true;
    textures.push(mirror);
    return mirror;
  });
  const mouths = await Promise.all(preset.mouths.map(loadTexture));
  await Promise.all([
    preset.headTexture ? loadTexture(preset.headTexture).then((map) => addPart(assets.models.head01, material(map)))
      : addPart(assets.models.head01, material(null, preset.skinColor ?? assets.skinColor)),
    addPart(assets.models.l_eye, material(eyes[appearance.eyes] ?? eyes[0], '#ffffff', true)),
    addPart(assets.models.r_eye, material(rightEyes[appearance.eyes] ?? rightEyes[0], '#ffffff', true)),
    addPart(assets.models.mouth, material(mouths[appearance.mouth] ?? mouths[0], '#ffffff', true)),
    ...(preset.noseTexture === null ? [] : [loadTexture(preset.noseTexture ?? assets.models.noseTexture)
      .then((map) => addPart(assets.models.nose, material(map, '#ffffff', true)))]),
    ...preset.ears.map((path, index) => addPart(path, material(null, preset.skinColor ?? assets.skinColor),
      [index === 0 ? 0.235 : -0.235, 1.04, 0.035])),
    ...preset.fixedParts.map(async (part) => addPart(part.model, material(await loadTexture(part.texture)))),
    ...preset.hair.map(async (part, index) => {
      const group = await addPart(part.model, material(await loadTexture(part.texture)));
      group.visible = index === appearance.hair;
    }),
    ...preset.accessories.map(async (part, index) => {
      const group = await addPart(part.model, material(await loadTexture(part.texture)));
      group.visible = (preset.accessorySets[appearance.accessory] ?? []).includes(index);
    }),
  ]);

  const makeClip = (data: ClipData, name: string, boneNameSet: { has: (name: string) => boolean } = boneIndices) => {
    const rawFps = data.fps || 60;
    const effectiveFps = rawFps === 60 ? 96 : rawFps;
    const effectiveDuration = (data.duration && data.duration > 0) ? data.duration * (rawFps / effectiveFps) : -1;
    return new THREE.AnimationClip(name, effectiveDuration,
      data.tracks.flatMap((track) => {
        if (!boneNameSet.has(track.name)) return [];
        const positionTimes = track.positions.map((_, index) => index / effectiveFps);
        const rotationTimes = track.rotations.map((_, index) => index / effectiveFps);
        return [new THREE.VectorKeyframeTrack(`${track.name}.position`, positionTimes, track.positions.flat()),
          new THREE.QuaternionKeyframeTrack(`${track.name}.quaternion`, rotationTimes, track.rotations.flat())];
      }));
  };
  const fetchClip = async (path: string, name: string) => {
    const response = await fetch(path.startsWith('gameplay:')
      ? `${import.meta.env.BASE_URL}assets/gameplay/animations/${path.slice(9)}` : assetUrl(path));
    if (!response.ok) throw new Error(`动画加载失败: ${name}`);
    return makeClip(await response.json() as ClipData, name);
  };
  const [commonDeathClip, commonHitClip, flyHoverClip, flyMoveClip, flyJumpClip, flyTakeoffClip] = await Promise.all([
    fetchClip('gameplay:common-death.json', 'common-death').catch(() => null),
    fetchClip('gameplay:common-hit.json', 'common-hit').catch(() => null),
    fetchClip('gameplay:fly-fly.json', 'fly-hover').catch(() => null),
    fetchClip('gameplay:fly-fly01.json', 'fly-move').catch(() => null),
    fetchClip('gameplay:fly-jumpfly.json', 'fly-jump').catch(() => null),
    fetchClip('gameplay:fly-takeoff.json', 'fly-takeoff').catch(() => null),
  ]);
  const skillClipCache = new Map<string, { full: any; upper: any }>();
  for (const sName of ['stdblast', 'stdcatch', 'stdeat', 'stdoutcry', 'stdtleibao_01_bomboff', 'stdtleibao_01_bombon', 'stdtread']) {
    void fetchClip(`gameplay:skill_anim-${sName}.json`, `skill-${sName}`)
      .then((c) => {
        if (c) skillClipCache.set(sName, { full: c, upper: makeUpperBodyClip(c) });
      })
      .catch(() => undefined);
  }

  const entries = await Promise.all(effectiveWeapons.map(async (weapon) => {
    const set = weapon.animation.match(/thirdperson-male-(.+)-stdidle/)?.[1]
      ?? weapon.animation.match(/animations\/(.+)\.json$/)?.[1]
      ?? weapon.id;
    // Melee sets ship stdshoot1/2/3 as the -attack/-attack2/-attack3 combo clips.
    const attackSources = [weapon.actions?.attack ?? `gameplay:${set}-attack.json`,
      `gameplay:${set}-attack2.json`, `gameplay:${set}-attack3.json`];
    const reloadSource = weapon.actions?.reload ?? `gameplay:${set}-reload.json`;
    const [idle, run, jump, roll, spurt, reload, hit, change] = await Promise.all([
      fetchClip(`gameplay:${set}-idle.json`, `${weapon.id}-idle`).catch(() => fetchClip(weapon.animation, `${weapon.id}-idle`)),
      fetchClip(`gameplay:${set}-run.json`, `${weapon.id}-run`).catch(() => fetchClip(weapon.animation, `${weapon.id}-run-fallback`)),
      fetchClip(`gameplay:${set}-jump.json`, `${weapon.id}-jump`).catch(() => null),
      fetchClip(`gameplay:${set}-roll.json`, `${weapon.id}-roll`).catch(() => null),
      fetchClip(`gameplay:${set}-spurt.json`, `${weapon.id}-spurt`).catch(() => null),
      fetchClip(reloadSource, `${weapon.id}-reload`).catch(() => fetchClip(`gameplay:${set}-reload.json`, `${weapon.id}-reload`).catch(() => null)),
      fetchClip(`gameplay:${set}-hit.json`, `${weapon.id}-hit`).catch(() => commonHitClip),
      fetchClip(`gameplay:${set}-change.json`, `${weapon.id}-change`).catch(() => null),
    ]);
    const attacks = (await Promise.all(attackSources.map((path, index) =>
      fetchClip(path, `${weapon.id}-attack${index + 1}`).catch(() => null))))
      .filter((clip) => Boolean(clip));
    const upperAttacks = attacks.map(makeUpperBodyClip);
    const upperReload = makeUpperBodyClip(reload);
    const upperChange = makeUpperBodyClip(change);

    const parts: any[] = [];
    for (const part of weapon.parts ?? []) {
      try {
        const model = await loadModel(part.model);
        const map = part.texture ? await loadTexture(part.texture).catch(() => null) : null;
        const partMaterial = material(map);
        model.traverse((object: any) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.material = partMaterial;
          object.frustumCulled = false;
        });
        enhanceLoadedWeaponModel(model, weapon.id);
        const bone = bones.bones[boneIndices.get(part.bone) ?? -1];
        if (!bone) throw new Error(`武器挂点缺失: ${part.bone}`);
        bone.add(model);
        parts.push(model);
      } catch {
        // Fallback handled below
      }
    }
    if (parts.length === 0) {
      const fallbackBoneName = weapon.id.startsWith('shield') ? 'handweapon_l' : 'handweapon_r';
      const bone = bones.bones[boneIndices.get(fallbackBoneName) ?? -1];
      if (bone) {
        const stylized = createStylizedWeaponMesh(weapon.id);
        bone.add(stylized);
        parts.push(stylized);
      }
    }
    return { idle, run, jump, roll, reload, spurt, hit, change, upperChange, attacks, upperAttacks, upperReload, parts };
  }));
  const ghostState = new Map<any, { transparent: boolean; opacity: number; depthWrite: boolean }>();
  const mixer = new THREE.AnimationMixer(root);
  let attachmentGroup: any = null;
  let attachmentMixer: any = null;
  let wingIdleClip: any = null;
  let wingFlyClip: any = null;
  let wingJumpClip: any = null;
  let wingLeftNode: any = null;
  let wingRightNode: any = null;
  let activeWingId = '';
  let selected = 0;
  let moving = false;
  let flying = false;
  let action: any = null;
  let upperAction: any = null;
  let transient = 0;

  const stopUpper = () => {
    if (upperAction) {
      upperAction.fadeOut(0.1);
      upperAction = null;
    }
  };

  const play = (clip: any, once = false) => {
    if (!clip) return;
    const next = mixer.clipAction(clip);
    if (action === next && !once) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (action && action !== next) next.crossFadeFrom(action, 0.12, true);
    action = next;
    transient = once ? clip.duration : 0;
  };

  const syncWingAnim = (mode: 'idle' | 'fly' | 'jump') => {
    if (!attachmentMixer) return;
    attachmentMixer.stopAllAction();
    if (mode === 'fly') {
      const clip = wingFlyClip ?? wingJumpClip ?? wingIdleClip;
      if (clip) {
        attachmentMixer.timeScale = wingFlyClip ? 1.45 : 2.35;
        attachmentMixer.clipAction(clip).reset().play();
      }
    } else if (mode === 'jump') {
      const clip = wingJumpClip ?? wingFlyClip ?? wingIdleClip;
      if (clip) {
        attachmentMixer.timeScale = 1.85;
        attachmentMixer.clipAction(clip).reset().play();
      }
    } else if (wingIdleClip) {
      attachmentMixer.timeScale = 1.0;
      attachmentMixer.clipAction(wingIdleClip).reset().play();
    }
  };

  const getBaseClip = () => {
    if (flying) {
      return moving
        ? (flyMoveClip ?? flyHoverClip ?? entries[selected].run)
        : (flyHoverClip ?? flyMoveClip ?? entries[selected].idle);
    }
    return moving ? entries[selected].run : entries[selected].idle;
  };

  const playUpper = (upperClip: any, fullClip: any) => {
    if ((moving || flying) && upperClip) {
      // 保持下半身播放 run 或飞行姿态，上半身叠加攻击/换弹动作 (边移动/飞行边射击)
      const legClip = getBaseClip();
      const runAct = mixer.clipAction(legClip);
      if (action !== runAct) {
        runAct.reset();
        runAct.setLoop(THREE.LoopRepeat, Infinity);
        runAct.play();
        if (action) runAct.crossFadeFrom(action, 0.1, true);
        action = runAct;
      }
      const nextUpper = mixer.clipAction(upperClip);
      if (upperAction && upperAction !== nextUpper) {
        upperAction.stop();
      }
      nextUpper.reset();
      nextUpper.setLoop(THREE.LoopOnce, 1);
      nextUpper.clampWhenFinished = true;
      nextUpper.play();
      upperAction = nextUpper;
      transient = upperClip.duration;
    } else {
      stopUpper();
      play(fullClip, true);
    }
  };

  const base = () => {
    stopUpper();
    play(getBaseClip());
  };

  const avatar: BattleAvatar = {
    root,
    skeleton: bones,
    update(delta) {
      mixer.update(delta);
      if (attachmentMixer) attachmentMixer.update(delta);
      if (transient > 0) {
        transient -= delta;
        if (transient <= 0) {
          transient = 0;
          base();
          syncWingAnim(flying ? 'fly' : 'idle');
        }
      }
    },
    setMoving(value) {
      if (moving !== value) {
        moving = value;
        if (!transient) {
          base();
        } else if (upperAction) {
          // 在上半身开火/换弹过程中切换下半身移动/待机/飞行姿态
          const legClip = getBaseClip();
          const legAct = mixer.clipAction(legClip);
          if (action !== legAct) {
            legAct.reset();
            legAct.setLoop(THREE.LoopRepeat, Infinity);
            legAct.play();
            if (action) legAct.crossFadeFrom(action, 0.1, true);
            action = legAct;
          }
        }
      }
    },
    setFlying(value) {
      if (flying !== value) {
        flying = value;
        syncWingAnim(flying ? 'fly' : 'idle');
        if (flying && flyTakeoffClip) {
          stopUpper();
          play(flyTakeoffClip, true);
          transient = Math.min(0.45, flyTakeoffClip.duration);
        } else {
          transient = 0;
          base();
        }
      }
    },
    setWeapon(index) {
      selected = Math.max(0, Math.min(index, entries.length - 1));
      entries.forEach((entry, slot) => entry.parts.forEach((part) => { part.visible = slot === selected; }));
      transient = 0;
      base();
    },
    attack(step = 0) {
      const entry = entries[selected];
      const clips = entry.attacks;
      const upperClips = entry.upperAttacks;
      const idx = clips.length ? step % clips.length : -1;
      if (idx >= 0) {
        playUpper(upperClips[idx], clips[idx]);
      } else {
        play(entry.idle, true);
      }
    },
    spurt() { const clip = entries[selected].spurt; if (clip) { stopUpper(); play(clip, true); } },
    hit() {
      const clip = entries[selected]?.hit ?? commonHitClip;
      if (clip && !moving && transient <= 0) {
        stopUpper();
        play(clip, true);
      }
    },
    die() {
      if (commonDeathClip) {
        stopUpper();
        play(commonDeathClip, true);
      }
    },
    revive() {
      stopUpper();
      transient = 0;
      moving = false;
      flying = false;
      base();
    },
    async playSkillAnim(skillAnimName: string) {
      try {
        let entry = skillClipCache.get(skillAnimName);
        if (!entry) {
          const full = await fetchClip(`gameplay:skill_anim-${skillAnimName}.json`, `skill-${skillAnimName}`);
          entry = { full, upper: makeUpperBodyClip(full) };
          skillClipCache.set(skillAnimName, entry);
        }
        if (entry?.full) {
          if (skillAnimName === 'stdtread') {
            stopUpper();
            play(entry.full, true);
          } else {
            playUpper(entry.upper, entry.full);
          }
        }
      } catch {
        // Fallback if skill animation does not exist
      }
    },
    setMotion(on) { mixer.timeScale = on ? 1 : 0; },
    setGhost(on) {
      root.traverse((object: any) => {
        if (!(object instanceof THREE.Mesh) || !object.material) return;
        const mat = object.material;
        let saved = ghostState.get(mat);
        if (!saved) {
          saved = { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite };
          ghostState.set(mat, saved);
        }
        mat.transparent = on || saved.transparent;
        mat.opacity = on ? 0.32 : saved.opacity;
        mat.depthWrite = on ? false : saved.depthWrite;
        mat.needsUpdate = true;
      });
    },
    reload() {
      const entry = entries[selected];
      if (entry.reload) {
        playUpper(entry.upperReload, entry.reload);
      }
    },
    jump() {
      if (entries[selected].jump) {
        stopUpper();
        play(entries[selected].jump, true);
      }
      syncWingAnim('jump');
    },
    doubleJump() {
      stopUpper();
      const clip = flyJumpClip ?? entries[selected].jump;
      if (clip) {
        play(clip, true);
      }
      syncWingAnim('jump');
    },
    roll() { if (entries[selected].roll) { stopUpper(); play(entries[selected].roll, true); } },
    getMuzzlePosition(outTarget = new THREE.Vector3()) {
      root.updateMatrixWorld(true);
      const activeParts = entries[selected]?.parts ?? [];
      for (const part of activeParts) {
        const fireNode =
          part.getObjectByName('Gun_Fire') ||
          part.getObjectByName('gun_fire') ||
          part.getObjectByName('Gun_MZ') ||
          part.getObjectByName('gun_mz') ||
          part.getObjectByName('Gun_shot_pos');
        if (fireNode) {
          fireNode.getWorldPosition(outTarget);
          return outTarget;
        }
      }
      const handBone =
        bones.bones[boneIndices.get('handweapon_r') ?? -1] ||
        bones.bones[boneIndices.get('handweapon_l') ?? -1];
      if (handBone) {
        handBone.getWorldPosition(outTarget);
        const worldQuat = new THREE.Quaternion();
        root.getWorldQuaternion(worldQuat);
        const fwd = new THREE.Vector3(0, 0.06, 0.42).applyQuaternion(worldQuat);
        outTarget.add(fwd);
        return outTarget;
      }
      root.getWorldPosition(outTarget);
      outTarget.y += 1.15;
      return outTarget;
    },
    getWingTipPositions() {
      if (!attachmentGroup || (!wingLeftNode && !wingRightNode)) return null;
      root.updateMatrixWorld(true);
      const left = new THREE.Vector3();
      const right = new THREE.Vector3();
      if (wingLeftNode) wingLeftNode.getWorldPosition(left);
      else root.getWorldPosition(left);
      if (wingRightNode) wingRightNode.getWorldPosition(right);
      else root.getWorldPosition(right);
      return { left, right, wingId: activeWingId || 'wing01' };
    },
    async setAttachment(attachment) {
      if (attachmentGroup && attachmentGroup.parent) {
        attachmentGroup.parent.remove(attachmentGroup);
        attachmentGroup = null;
      }
      if (attachmentMixer) {
        attachmentMixer.stopAllAction();
        attachmentMixer = null;
      }
      wingIdleClip = null;
      wingFlyClip = null;
      wingJumpClip = null;
      wingLeftNode = null;
      wingRightNode = null;
      activeWingId = '';
      if (!attachment) return;
      try {
        const [model, map] = await Promise.all([
          loadModel(attachment.model),
          attachment.texture ? loadTexture(attachment.texture).catch(() => null) : Promise.resolve(null),
        ]);
        const attMat = material(map);
        attMat.side = THREE.DoubleSide;
        attMat.alphaTest = 0.1;
        model.traverse((object: any) => {
          if (!object.isMesh) return;
          object.material.dispose();
          object.material = attMat;
          object.frustumCulled = false;
        });
        const anchor = model.getObjectByName(attachment.bone) ?? model.children.find((c: any) => c.isBone);
        const parentIndex = boneIndices.get(attachment.bone) ?? boneIndices.get('chest');
        if (parentIndex === undefined) return;
        if (anchor) {
          anchor.position.set(0, 0, 0);
          anchor.quaternion.identity();
          anchor.scale.set(1, 1, 1);
        }
        const host = bones.bones[parentIndex];
        const offset = new THREE.Group();
        const bindQuat = bindQuats.get(host.name);
        if (bindQuat) {
          offset.quaternion.copy(bindQuat).invert();
        } else {
          root.updateMatrixWorld(true);
          host.getWorldQuaternion(offset.quaternion).invert();
        }
        offset.add(model);
        host.add(offset);
        attachmentGroup = offset;
        activeWingId = attachment.id || 'wing01';
        wingLeftNode = model.getObjectByName('wing_vfx_l') || model.getObjectByName('wing_l5') || model.getObjectByName('wing_l3') || model.getObjectByName('wing_l');
        wingRightNode = model.getObjectByName('wing_vfx_r') || model.getObjectByName('wing_r5') || model.getObjectByName('wing_r3') || model.getObjectByName('wing_r');

        if (attachment.animation) {
          const names = new Set<string>();
          model.traverse((object: any) => { if (object.isBone && object !== anchor) names.add(object.name); });
          const loadWingClip = async (animPath: string, suffix: string) => {
            try {
              const resp = await fetch(assetUrl(animPath));
              if (!resp.ok) return null;
              const data: ClipData = await resp.json();
              const clip = makeClip(data, `${attachment.id}-${suffix}`, names);
              return clip.tracks.length ? clip : null;
            } catch {
              return null;
            }
          };
          const flyAnimPath = attachment.animation.replace(/-(idle|idle_an)\.json$/, '-fly.json');
          const jumpAnimPath = attachment.animation.replace(/-(idle|idle_an|fly)\.json$/, '-jumpup.json');
          const [idleC, flyC, jumpC] = await Promise.all([
            loadWingClip(attachment.animation, 'idle'),
            flyAnimPath !== attachment.animation ? loadWingClip(flyAnimPath, 'fly') : Promise.resolve(null),
            jumpAnimPath !== attachment.animation ? loadWingClip(jumpAnimPath, 'jumpup') : Promise.resolve(null),
          ]);
          wingIdleClip = idleC;
          wingFlyClip = flyC ?? idleC;
          wingJumpClip = jumpC ?? flyC ?? idleC;
          if (wingIdleClip || wingFlyClip) {
            attachmentMixer = new THREE.AnimationMixer(model);
            syncWingAnim(flying ? 'fly' : 'idle');
          }
        }
      } catch (err) {
        console.warn('[BattleAvatar] attachment load warning:', err);
      }
    },
    async playGesture(animationPath: string) {
      try {
        const clip = await fetchClip(animationPath, `gesture-${animationPath}`);
        stopUpper();
        play(clip, true);
      } catch (err) {
        console.warn('[BattleAvatar] gesture load warning:', err);
      }
    },
    dispose() {
      mixer.stopAllAction();
      attachmentMixer?.stopAllAction();
      root.traverse((object: any) => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      materials.forEach((entry) => entry.dispose());
      textures.forEach((entry) => entry.dispose());
      bones.dispose();
    },
  };
  avatar.setWeapon(0);
  return avatar;
}
