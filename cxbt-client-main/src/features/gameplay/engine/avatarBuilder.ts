import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  assetUrl,
  loadCreationAssets,
  type CreationAssets,
  type CreationJob,
  type CreationPreset
} from '../../characterCreation/assets';

export interface BuildAvatarOptions {
  jobId?: CreationJob;
  gender?: number; // 0: 男, 1: 女
  hairIndex?: number;
  accessorySetIndex?: number;
  preset?: CreationPreset;
  assets?: CreationAssets;
}

export interface BuiltAvatar {
  root: any;
  skeleton: any;
  boneIndices: Map<string, number>;
  preset: CreationPreset;
  jobId: CreationJob;
  gender: number;
  hairIndex: number;
  materials: any[];
  textures: any[];
  dispose: () => void;
}

let cachedCreationAssets: CreationAssets | null = null;

export async function getCachedCreationAssets(): Promise<CreationAssets> {
  if (!cachedCreationAssets) {
    cachedCreationAssets = await loadCreationAssets();
  }
  return cachedCreationAssets;
}

/**
 * 完整构建与装配角色全身 3D 模型
 * 包含：躯干(body01)、面部(head01)、眼睛(l_eye, r_eye)、嘴巴(mouth)、鼻子(nose)、
 * 耳朵(ears)、发型(hair)、固定部件(fixedParts如生化兵外套)与饰品(accessories)。
 * 所有网格均重定向至主骨架并配置正确的贴图、材质与渲染次序。
 */
export async function buildFullAvatar(options: BuildAvatarOptions = {}): Promise<BuiltAvatar> {
  const assets = options.assets ?? await getCachedCreationAssets();
  const jobId: CreationJob = options.jobId ?? 'assassin';
  const gender = options.gender ?? 0;

  const jobConfig = assets.jobs[jobId];
  const preset = options.preset ?? jobConfig?.presets[gender];
  if (!preset) {
    throw new Error(`[avatarBuilder] 找不到职业 ${jobId} 性别索引 ${gender} 的配置预设`);
  }

  const hairIndex = options.hairIndex ?? preset.defaultHair ?? 0;
  const accessorySetIndex = options.accessorySetIndex ?? Math.max(0, (preset.accessorySets?.length ?? 1) - 1);

  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();

  const textures: any[] = [];
  const materials: any[] = [];

  const loadModel = async (path: string) => {
    const gltf = await loader.loadAsync(assetUrl(path));
    return gltf.scene;
  };

  const loadTexture = async (path: string) => {
    const tex = await textureLoader.loadAsync(assetUrl(path));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    textures.push(tex);
    return tex;
  };

  const createMaterial = (map: any, color: string = '#ffffff', isFaceDecal: boolean = false) => {
    const mat = new THREE.MeshPhongMaterial({
      map,
      color,
      shininess: 12,
      specular: '#191319',
      transparent: isFaceDecal,
      depthWrite: !isFaceDecal,
      side: THREE.FrontSide,
      alphaTest: isFaceDecal ? 0.015 : 0
    });
    materials.push(mat);
    return mat;
  };

  // 1. 加载身体主体模型与贴图
  const [bodyScene, bodyTexture] = await Promise.all([
    loadModel(assets.models.body01),
    loadTexture(preset.body)
  ]);

  let skeleton: any = null;
  bodyScene.traverse((obj: any) => {
    if (obj.isSkinnedMesh) {
      if (!skeleton || obj.skeleton.bones.length > skeleton.bones.length) {
        skeleton = obj.skeleton;
      }
      obj.material = createMaterial(bodyTexture);
      obj.frustumCulled = false;
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  if (!skeleton) {
    throw new Error('[avatarBuilder] 身体主体骨骼缺失');
  }

  const root = new THREE.Group();
  root.add(bodyScene);

  // 骨骼名称映射索引
  const boneIndices = new Map<string, number>();
  skeleton.bones.forEach((bone: any, idx: number) => {
    boneIndices.set(bone.name, idx);
  });

  // 挂载部件辅助函数 (自动蒙皮重定向到主骨架)
  const addPart = async (path: string, partMat: any, renderOrder: number = 0, offset?: number[]) => {
    try {
      const partScene = await loadModel(path);
      const meshes: any[] = [];
      partScene.traverse((obj: any) => {
        if (obj.isMesh) meshes.push(obj);
      });

      const partGroup = new THREE.Group();
      for (const mesh of meshes) {
        if (offset) {
          mesh.geometry.translate(offset[0], offset[1], offset[2]);
        }
        if (mesh.isSkinnedMesh) {
          const skinIndices = mesh.geometry.attributes.skinIndex;
          const oldSkeleton = mesh.skeleton;
          if (oldSkeleton) {
            for (let i = 0; i < skinIndices.array.length; i++) {
              const oldBone = oldSkeleton.bones[skinIndices.array[i]];
              const boneName = oldBone?.name;
              let targetIdx = boneName ? boneIndices.get(boneName) : undefined;
              if (targetIdx === undefined && boneName) {
                // 模糊别名匹配
                const lower = boneName.toLowerCase();
                for (const [name, idx] of boneIndices.entries()) {
                  if (name.toLowerCase() === lower) {
                    targetIdx = idx;
                    break;
                  }
                }
              }
              if (targetIdx !== undefined) {
                skinIndices.array[i] = targetIdx;
              }
            }
            skinIndices.needsUpdate = true;
          }
          mesh.bind(skeleton, new THREE.Matrix4());
          if (oldSkeleton) oldSkeleton.dispose();
        }
        mesh.material = partMat;
        mesh.renderOrder = renderOrder;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        partGroup.add(mesh);
      }

      root.add(partGroup);
      return partGroup;
    } catch (err) {
      console.warn(`[avatarBuilder] 部件加载失败: ${path}`, err);
      return null;
    }
  };

  // 2. 加载头部与面部五官
  const skinColor = preset.skinColor ?? assets.skinColor ?? '#f4c691';
  const skinMaterial = createMaterial(null, skinColor);

  const eyeTextures = await Promise.all(preset.eyes.map(loadTexture));
  const rightEyeTextures = preset.rightEyes
    ? await Promise.all(preset.rightEyes.map(loadTexture))
    : eyeTextures.map(tex => {
        const mirror = tex.clone();
        mirror.repeat.x = -1;
        mirror.offset.x = 1;
        mirror.needsUpdate = true;
        textures.push(mirror);
        return mirror;
      });
  const mouthTextures = await Promise.all(preset.mouths.map(loadTexture));

  const eyeMat = createMaterial(eyeTextures[0], '#ffffff', true);
  const rightEyeMat = createMaterial(rightEyeTextures[0], '#ffffff', true);
  const mouthMat = createMaterial(mouthTextures[0], '#ffffff', true);

  // 组装头部
  const headPromise = preset.headTexture
    ? loadTexture(preset.headTexture).then(map => addPart(assets.models.head01, createMaterial(map)))
    : addPart(assets.models.head01, skinMaterial);

  const eyesPromise = Promise.all([
    addPart(assets.models.l_eye, eyeMat, 2),
    addPart(assets.models.r_eye, rightEyeMat, 2)
  ]);

  const mouthPromise = addPart(assets.models.mouth, mouthMat, 3);

  const nosePromise = preset.noseTexture === null
    ? Promise.resolve(null)
    : loadTexture(preset.noseTexture ?? assets.models.noseTexture).then(map =>
        addPart(assets.models.nose, createMaterial(map, '#ffffff', true), 4)
      );

  const earsPromise = Promise.all(
    preset.ears.map((earPath, idx) =>
      addPart(earPath, skinMaterial, 0, [idx === 0 ? 0.235 : -0.235, 1.04, 0.035])
    )
  );

  // 3. 组装发型 / 头部装备
  const activeHair = preset.hair[hairIndex] ?? preset.hair[0];
  const hairPromise = activeHair
    ? loadTexture(activeHair.texture).then(map => addPart(activeHair.model, createMaterial(map)))
    : Promise.resolve(null);

  // 4. 组装固定外饰部件 (如生化兵外套)
  const fixedPartsPromise = Promise.all(
    preset.fixedParts.map(async part => {
      const tex = await loadTexture(part.texture);
      return addPart(part.model, createMaterial(tex));
    })
  );

  // 5. 组装饰品 (如战术腰带、徽章)
  const activeAccessoryIndices = preset.accessorySets[accessorySetIndex] ?? [];
  const accessoriesPromise = Promise.all(
    preset.accessories
      .filter((_, idx) => activeAccessoryIndices.includes(idx))
      .map(async part => {
        const tex = await loadTexture(part.texture);
        return addPart(part.model, createMaterial(tex));
      })
  );

  await Promise.all([
    headPromise,
    eyesPromise,
    mouthPromise,
    nosePromise,
    earsPromise,
    hairPromise,
    fixedPartsPromise,
    accessoriesPromise
  ]);

  const dispose = () => {
    root.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
      }
    });
    materials.forEach(m => m.dispose());
    textures.forEach(t => t.dispose());
  };

  return {
    root,
    skeleton,
    boneIndices,
    preset,
    jobId,
    gender,
    hairIndex,
    materials,
    textures,
    dispose
  };
}
