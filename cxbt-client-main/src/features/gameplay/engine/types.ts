/**
 * 引擎通用类型与接口定义
 */

export type ActionName = 
  | 'idle' 
  | 'run' 
  | 'jump' 
  | 'roll' 
  | 'attack' 
  | 'reload' 
  | 'hit' 
  | 'death'
  | string;

export interface MovementInput {
  direction: any;       // THREE.Vector3
  cameraYaw: number;
  jump: boolean;
}

export interface CollisionEnvironment {
  floorAt?: (x: number, z: number, fromY: number) => number | undefined;
  isBlocked?: (from: any, to: any) => boolean;
  bounds?: number[] | null;
}

export interface WeaponPartSlot {
  model: string;
  bone: string;
  texture?: string;
}

export interface WeaponEntityConfig {
  id: string;
  name: string;
  family?: string;
  parts?: WeaponPartSlot[];
  actions?: {
    idle?: string;
    run?: string;
    jump?: string;
    roll?: string;
    attack?: string;
    reload?: string;
    death?: string;
  };
  magCapacity?: number;
  reloadTime?: number;
  fireRate?: number;    // 射击间隔 (ms)
}

export interface EntityEvents {
  onFootstep?: (stepIndex: number) => void;
  onJump?: () => void;
  onLand?: () => void;
  onRoll?: () => void;
  onAttack?: (actionName: string) => void;
  onReload?: () => void;
  onDamage?: (amount: number, currentHealth: number) => void;
  onDeath?: () => void;
  onRevive?: () => void;
  onActionChange?: (prevAction: string, nextAction: string) => void;
}
