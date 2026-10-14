import { weaponKind, type WeaponKind } from '../projectiles';

export interface WeaponState {
  id: string;
  family: string;
  kind: WeaponKind;
  magAmmo: number;
  maxMag: number;
  reserveAmmo: number;
  fireDelay: number;      // 毫秒
  damage: number;
  isReloading: boolean;
  reloadTime: number;     // 毫秒
}

const DEFAULT_MAG_CAPACITIES: Record<string, number> = {
  pistol: 12,
  sniperrifle: 5,
  shotgun: 8,
  rpg: 1,
  bow: 1,
  crossbow: 1,
  machinegun: 80,
  smg: 30,
  sprayer: 60,
  grenadelauncher: 6,
  grenade: 1,
  knives: 0,
  shield: 0,
  stick: 0
};

const DEFAULT_DAMAGE: Record<string, number> = {
  pistol: 220,
  sniperrifle: 1200,
  shotgun: 140,
  smg: 110,
  machinegun: 125,
  rpg: 1400,
  grenadelauncher: 950,
  grenade: 1200,
  bow: 750,
  crossbow: 800,
  knives: 650,
  shield: 450,
  sprayer: 85
};

/**
 * 武器与弹药战斗系统引擎模块
 * 负责槽位管理、开火CD、弹夹与后备弹药管理、换弹状态控制
 */
export class WeaponSystem {
  public weapons: WeaponState[] = [];
  public selectedIndex: number = 0;

  private lastFireTime: number = 0;
  private reloadTimer: number = 0;

  constructor(weaponIds: string[] = []) {
    if (weaponIds.length > 0) {
      this.initWeapons(weaponIds);
    }
  }

  public initWeapons(weaponIds: string[]) {
    this.weapons = weaponIds.map(id => {
      const family = id.split('_')[0];
      const kind = weaponKind(id);
      const maxMag = DEFAULT_MAG_CAPACITIES[family] ?? 30;
      const damage = DEFAULT_DAMAGE[family] ?? 20;
      const fireDelay = kind === 'melee' ? 430 : kind === 'grenade' ? 800 : family === 'sniperrifle' ? 650 : family === 'shotgun' ? 500 : 130;

      return {
        id,
        family,
        kind,
        magAmmo: maxMag,
        maxMag,
        reserveAmmo: maxMag * 4,
        fireDelay,
        damage,
        isReloading: false,
        reloadTime: 1800
      };
    });
    this.selectedIndex = 0;
  }

  public getCurrentWeapon(): WeaponState | null {
    return this.weapons[this.selectedIndex] ?? null;
  }

  public switchWeapon(index: number): boolean {
    if (index < 0 || index >= this.weapons.length || index === this.selectedIndex) {
      return false;
    }
    // 中断当前换弹状态
    const current = this.getCurrentWeapon();
    if (current) current.isReloading = false;
    this.reloadTimer = 0;
    this.selectedIndex = index;
    return true;
  }

  public canFire(): boolean {
    const weapon = this.getCurrentWeapon();
    if (!weapon) return false;
    if (weapon.isReloading) return false;
    if (performance.now() - this.lastFireTime < weapon.fireDelay) return false;
    if (weapon.kind !== 'melee' && weapon.magAmmo <= 0) return false;
    return true;
  }

  public fire(): { fired: boolean; needReload: boolean; damage: number; kind: WeaponKind } {
    const weapon = this.getCurrentWeapon();
    if (!weapon || !this.canFire()) {
      return { fired: false, needReload: false, damage: 0, kind: 'bullet' };
    }

    this.lastFireTime = performance.now();
    if (weapon.kind !== 'melee') {
      weapon.magAmmo = Math.max(0, weapon.magAmmo - 1);
    }

    return {
      fired: true,
      needReload: weapon.kind !== 'melee' && weapon.magAmmo === 0,
      damage: weapon.damage,
      kind: weapon.kind
    };
  }

  public reload(): boolean {
    const weapon = this.getCurrentWeapon();
    if (!weapon || weapon.kind === 'melee' || weapon.isReloading) return false;
    if (weapon.magAmmo >= weapon.maxMag || weapon.reserveAmmo <= 0) return false;

    weapon.isReloading = true;
    this.reloadTimer = weapon.reloadTime / 1000;
    return true;
  }

  public update(delta: number): boolean {
    const weapon = this.getCurrentWeapon();
    if (!weapon || !weapon.isReloading) return false;

    this.reloadTimer -= delta;
    if (this.reloadTimer <= 0) {
      const needed = weapon.maxMag - weapon.magAmmo;
      const toLoad = Math.min(needed, weapon.reserveAmmo);
      weapon.magAmmo += toLoad;
      weapon.reserveAmmo -= toLoad;
      weapon.isReloading = false;
      return true; // 换弹完成
    }
    return false;
  }
}
