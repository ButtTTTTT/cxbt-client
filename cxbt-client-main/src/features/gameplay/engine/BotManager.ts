import * as THREE from 'three';
import { PlayerEntity } from './PlayerEntity';
import { WEAPON_SUITES, getWeaponActionSuite, type WeaponPartConfig } from './configs/weaponSuites';
import type { CollisionEnvironment } from './types';
import type { CreationJob, CreationPreset } from '../../characterCreation/assets';

export type BotBehaviorMode = 'dummy' | 'patrol' | 'chase';

export interface BotItem {
  id: string;
  entity: PlayerEntity;
  name: string;
  jobId: CreationJob;
  weaponId: string;
  hp: number;
  maxHp: number;
  mode: BotBehaviorMode;
  damageMultiplier: number;
  patrolTimer: number;
  patrolDir: any;
  attackCooldown: number;
  respawnTimer: number;
  hpBar: { sprite: any; updateHp: (currentHp: number, maxHp: number) => void };
}

export interface BotSnapshot {
  id: string;
  name: string;
  jobId: CreationJob;
  weaponId: string;
  hp: number;
  maxHp: number;
  mode: BotBehaviorMode;
}

export interface BotManagerCallbacks {
  onStateChange?: (bots: BotSnapshot[]) => void;
  onStatus?: (msg: string) => void;
  onPlayerAttacked?: (damage: number, bot: BotItem) => void;
  onBotKilled?: (bot: BotItem) => void;
  playAudio?: (soundName: string, volume?: number) => void;
}

const BOT_JOBS: CreationJob[] = ['guardian', 'assassin', 'gunner', 'biochemist'];

export function createEntityHpBar(name: string, initialHp = 3200, maxHp = 3200, borderColor = '#38bdf8') {
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 44;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(0, 2.2, 0);
  sprite.scale.set(1.25, 0.32, 1);

  const updateHp = (currentHp: number, totalHp: number) => {
    ctx.clearRect(0, 0, 180, 44);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(0, 0, 180, 44);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 178, 42);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(name.slice(0, 10), 8, 16);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`${Math.max(0, Math.round(currentHp))}/${totalHp}`, 102, 16);

    const pct = Math.max(0, Math.min(1, currentHp / Math.max(1, totalHp)));
    ctx.fillStyle = '#334155';
    ctx.fillRect(8, 25, 164, 10);
    ctx.fillStyle = pct > 0.5 ? '#22c55e' : (pct > 0.25 ? '#eab308' : '#ef4444');
    ctx.fillRect(8, 25, 164 * pct, 10);

    texture.needsUpdate = true;
  };

  updateHp(initialHp, maxHp);
  return { sprite, updateHp };
}

/**
 * 战术假人 / AI 怪物实体管理器 (沙盒、地图编辑器与正式游戏全局同源共用)
 * 支持：静止靶机 (dummy)、随机巡逻 (patrol)、主动追击与挥刀反击 (chase)、自定义怪物/BOSS体型血量光环
 */
export class BotManager {
  public scene: any;
  public bots: BotItem[] = [];
  public globalMode: BotBehaviorMode = 'chase';
  public autoRespawn: boolean = false;
  public showHitbox: boolean = false;
  public callbacks: BotManagerCallbacks;

  constructor(scene: any, callbacks: BotManagerCallbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks;
  }

  public getSnapshots(): BotSnapshot[] {
    return this.bots.map(b => ({
      id: b.id,
      name: b.name,
      jobId: b.jobId,
      weaponId: b.weaponId,
      hp: b.hp,
      maxHp: b.maxHp,
      mode: b.mode
    }));
  }

  private notifyChange() {
    this.callbacks.onStateChange?.(this.getSnapshots());
  }

  public async spawnBot(options: {
    mode?: BotBehaviorMode;
    customName?: string;
    jobId?: CreationJob;
    gender?: number;
    preset?: CreationPreset;
    weaponId?: string;
    weaponParts?: WeaponPartConfig[];
    maxHp?: number;
    bodyScale?: number;
    speedMultiplier?: number;
    damageMultiplier?: number;
    auraColor?: string;
    forcedAction?: string | null;
    exactPosition?: { x: number; y: number; z: number; yaw?: number };
    originPosition: any;
    collisionEnv: CollisionEnvironment;
  }): Promise<BotItem | null> {
    const id = 'bot_' + Math.random().toString(36).substring(2, 7);
    const num = this.bots.length + 1;
    const botName = options.customName || `假人 #${num}`;
    const jobId = options.jobId ?? BOT_JOBS[(num - 1) % BOT_JOBS.length];
    const gender = options.gender ?? (num % 2 === 0 ? 1 : 0);
    const weaponId = options.weaponId ?? 'knives_01';
    const maxHp = Math.max(100, Math.round(options.maxHp ?? 3200));
    const bodyScale = Math.max(0.5, Math.min(3.5, options.bodyScale ?? 1.0));
    const damageMultiplier = options.damageMultiplier ?? 1.0;

    this.callbacks.onStatus?.(`正在部署 ${botName}...`);

    try {
      const bot = new PlayerEntity(this.scene);
      bot.maxHealth = maxHp;
      bot.health = maxHp;
      if (options.speedMultiplier) {
        bot.setSpeed(bot.getBaseSpeed() * options.speedMultiplier);
      }

      await bot.loadFullAvatar({ jobId, gender, preset: options.preset });

      if (bodyScale !== 1.0) {
        bot.modelGroup.scale.setScalar(bodyScale);
      }

      if (options.auraColor) {
        const ringGeo = new THREE.TorusGeometry(0.65, 0.045, 8, 28);
        const ringMat = new THREE.MeshBasicMaterial({
          color: options.auraColor,
          transparent: true,
          opacity: 0.85
        });
        const auraRing = new THREE.Mesh(ringGeo, ringMat);
        auraRing.rotation.x = Math.PI / 2;
        auraRing.position.y = 0.06;
        bot.modelGroup.add(auraRing);
      }

      const suite = getWeaponActionSuite(weaponId) || WEAPON_SUITES[0];
      const parts = options.weaponParts ?? suite.parts;
      await Promise.all([
        bot.loadAnimations(suite.actions),
        parts ? bot.equipWeaponParts(parts, 0, weaponId) : Promise.resolve([])
      ]);

      if (options.forcedAction) {
        bot.setForcedAction(options.forcedAction);
      }

      const hpBar = createEntityHpBar(botName, maxHp, maxHp, options.auraColor || '#38bdf8');
      bot.modelGroup.add(hpBar.sprite);

      let spawnX = 0;
      let spawnZ = 0;
      let floorY = 0;
      let spawnYaw = Math.random() * Math.PI * 2;

      if (options.exactPosition) {
        spawnX = options.exactPosition.x;
        spawnZ = options.exactPosition.z;
        floorY = options.exactPosition.y;
        if (options.exactPosition.yaw !== undefined) spawnYaw = options.exactPosition.yaw;
      } else {
        const pPos = options.originPosition;
        const angle = (num * 1.2) + Math.random() * 0.8;
        const dist = 3.2 + Math.random() * 1.5;
        spawnX = pPos.x + Math.sin(angle) * dist;
        spawnZ = pPos.z + Math.cos(angle) * dist;
        floorY = options.collisionEnv.floorAt?.(spawnX, spawnZ, 90) ?? pPos.y;
      }

      bot.setTransform(spawnX, floorY, spawnZ, spawnYaw);
      bot.setCollisionEnvironment(options.collisionEnv);
      bot.setHitboxVisible(this.showHitbox);

      const botEntry: BotItem = {
        id,
        entity: bot,
        name: botName,
        jobId,
        weaponId,
        hp: maxHp,
        maxHp,
        mode: options.mode || this.globalMode,
        damageMultiplier,
        patrolTimer: 2.0,
        patrolDir: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
        attackCooldown: 1.0,
        respawnTimer: 0,
        hpBar
      };

      bot.hitbox.userData = {
        isPlayer: true,
        isBot: true,
        userId: id,
        entity: bot,
        botEntry
      };

      bot.events = {
        onDamage: (_amount, currentHp) => {
          botEntry.hp = currentHp;
          hpBar.updateHp(currentHp, botEntry.maxHp);
          this.notifyChange();
        },
        onDeath: () => {
          botEntry.hp = 0;
          botEntry.respawnTimer = 4.0;
          hpBar.updateHp(0, botEntry.maxHp);
          this.notifyChange();
          this.callbacks.onBotKilled?.(botEntry);
          this.callbacks.onStatus?.(`💀 [${botName}] 已阵亡倒地！`);
        },
        onRevive: () => {
          botEntry.hp = bot.health;
          hpBar.updateHp(botEntry.hp, botEntry.maxHp);
          this.notifyChange();
        }
      };

      this.bots.push(botEntry);
      this.notifyChange();
      this.callbacks.onStatus?.(
        `🤖 已成功生成 ${botName}！当前模式: ${botEntry.mode === 'chase' ? '追击玩家' : botEntry.mode === 'patrol' ? '随机巡逻' : '静止木桩'}`
      );
      return botEntry;
    } catch (err) {
      console.error('[BotManager] Bot spawn error:', err);
      this.callbacks.onStatus?.(`生成假人失败: ${err}`);
      return null;
    }
  }

  public damageBotById(botId: string, amount: number): BotItem | null {
    const bot = this.bots.find(b => b.id === botId);
    if (!bot || bot.hp <= 0) return null;
    bot.entity.takeDamage(Math.round(amount));
    return bot;
  }

  public findByEntity(entity: PlayerEntity): BotItem | undefined {
    return this.bots.find(b => b.entity === entity);
  }

  public findById(id: string): BotItem | undefined {
    return this.bots.find(b => b.id === id);
  }

  public getAliveHitboxes(): any[] {
    const list: any[] = [];
    for (const b of this.bots) {
      if (b.hp > 0 && b.entity?.hitbox) {
        list.push(b.entity.hitbox);
      }
    }
    return list;
  }

  public getAliveTargets(): { userId: string; position: any; bot: BotItem }[] {
    return this.bots
      .filter(b => b.hp > 0 && b.entity?.modelGroup)
      .map(b => ({ userId: b.id, position: b.entity.modelGroup.position, bot: b }));
  }

  public setBotMode(id: string, mode: BotBehaviorMode) {
    const target = this.bots.find(b => b.id === id);
    if (target) {
      target.mode = mode;
      this.notifyChange();
      this.callbacks.onStatus?.(
        `已将 [${target.name}] 切换为: ${mode === 'chase' ? '主动追击' : mode === 'patrol' ? '自由巡逻' : '静止靶子'}`
      );
    }
  }

  public setAllBotsMode(mode: BotBehaviorMode) {
    this.globalMode = mode;
    this.bots.forEach(b => { b.mode = mode; });
    this.notifyChange();
  }

  public reviveAllBots() {
    this.bots.forEach(b => {
      b.entity.revive(b.maxHp);
      b.hp = b.maxHp;
      b.hpBar.updateHp(b.maxHp, b.maxHp);
    });
    this.notifyChange();
    this.callbacks.onStatus?.('已复活全部假人！');
  }

  public clearAllBots() {
    this.bots.forEach(b => {
      b.entity.dispose();
      if (b.hpBar.sprite.parent) b.hpBar.sprite.parent.remove(b.hpBar.sprite);
    });
    this.bots = [];
    this.notifyChange();
    this.callbacks.onStatus?.('已清除所有假人实体');
  }

  public setHitboxVisible(visible: boolean) {
    this.showHitbox = visible;
    this.bots.forEach(b => b.entity?.setHitboxVisible(visible));
  }

  public relocateAllBots(centerPos: any, collisionEnv: CollisionEnvironment) {
    for (const bot of this.bots) {
      bot.entity.setCollisionEnvironment(collisionEnv);
      const angle = Math.random() * Math.PI * 2;
      const dist = 3.5 + Math.random() * 2.5;
      const bx = centerPos.x + Math.sin(angle) * dist;
      const bz = centerPos.z + Math.cos(angle) * dist;
      const by = collisionEnv.floorAt?.(bx, bz, 90) ?? centerPos.y;
      bot.entity.modelGroup.position.set(bx, by, bz);
    }
  }

  /**
   * 帧更新：驱动全部假人 AI 状态机、追击挥刀反击与自动复活
   */
  public update(delta: number, playerEntity: PlayerEntity | null, isPlayerStealthed: boolean = false) {
    const pPos = playerEntity?.modelGroup?.position;

    for (const bot of this.bots) {
      if (!bot.entity.isAlive) {
        if (this.autoRespawn) {
          bot.respawnTimer -= delta;
          if (bot.respawnTimer <= 0) {
            bot.entity.revive(bot.maxHp);
          }
        }
        bot.entity.update(delta);
        continue;
      }

      if (!pPos || !playerEntity || !playerEntity.isAlive) {
        bot.entity.setInput(new THREE.Vector3(0, 0, 0), bot.entity.modelGroup.rotation.y, false);
        bot.entity.update(delta);
        continue;
      }

      const bPos = bot.entity.modelGroup.position;
      const toPlayer = pPos.clone().sub(bPos);
      const distToPlayer = toPlayer.length();

      // 若玩家处于潜行隐身且距离大于 2.2m，追击模式退化为巡逻
      const effectiveMode = (bot.mode === 'chase' && isPlayerStealthed && distToPlayer > 2.2)
        ? 'patrol'
        : bot.mode;

      if (effectiveMode === 'dummy') {
        bot.entity.setInput(new THREE.Vector3(0, 0, 0), bot.entity.modelGroup.rotation.y, false);
      } else if (effectiveMode === 'patrol') {
        bot.patrolTimer -= delta;
        if (bot.patrolTimer <= 0) {
          bot.patrolTimer = 2.0 + Math.random() * 2.5;
          bot.patrolDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        }
        const yaw = Math.atan2(bot.patrolDir.x, bot.patrolDir.z);
        bot.entity.setInput(new THREE.Vector3(0, 0, 1), yaw, false);
      } else if (effectiveMode === 'chase') {
        if (distToPlayer > 1.8) {
          toPlayer.y = 0;
          toPlayer.normalize();
          const yaw = Math.atan2(toPlayer.x, toPlayer.z);
          bot.entity.setInput(new THREE.Vector3(0, 0, 1), yaw, false);
        } else {
          toPlayer.y = 0;
          toPlayer.normalize();
          const yaw = Math.atan2(toPlayer.x, toPlayer.z);
          bot.entity.setInput(new THREE.Vector3(0, 0, 0), yaw, false);
          bot.entity.modelGroup.rotation.y = yaw;
          bot.attackCooldown -= delta;

          if (bot.attackCooldown <= 0) {
            bot.attackCooldown = 1.3 + Math.random() * 0.4;
            bot.entity.attack();
            this.callbacks.playAudio?.('fire-knives', 0.65);
            const dmg = Math.floor((180 + Math.random() * 90) * (bot.damageMultiplier || 1));
            this.callbacks.onPlayerAttacked?.(dmg, bot);
            this.callbacks.onStatus?.(`⚠️ [${bot.name}] 挥刀反击命中玩家！造成 ${dmg} 伤害`);
          }
        }
      }

      bot.entity.update(delta);
    }
  }

  public dispose() {
    this.clearAllBots();
  }
}
