import { type Appearance, type CreationJob } from './assets';
import { apiFetch } from '../../api';

export type SavedCharacter = { 
  version: 1; 
  name: string; 
  jobId: CreationJob; 
  appearance: Appearance; 
  userId: number;
  level?: number; 
  exp?: number; 
  coins?: number; 
  cash?: number;
  gems?: number;
  rating?: number; 
  power?: number;
  signInStreak?: number;
  lastSignInDate?: string;
  onlineClaimCount?: number;
  equippedWeapons?: string;
  activeWing?: string;
  activePet?: string;
  quickbarJson?: string;
  luckDrawPos?: number;
  luckDrawStamina?: number;
};

export const CHARACTER_KEY = 'avatarstar.character';
let localCharacterCache: SavedCharacter | null = null;

// Initial fast read for App.tsx state fallback
export function readCharacter(): SavedCharacter | null {
  return localCharacterCache;
}

export function mapServerCharacter(data: any): SavedCharacter {
  return {
    version: 1,
    name: data.name,
    jobId: (data.jobId || 'guardian') as CreationJob,
    appearance: data.appearance ?? { gender: 0, hair: 0, eyes: 0, mouth: 0, accessory: 0 },
    userId: data.userId ?? 0,
    level: data.level ?? 1,
    exp: data.exp ?? 0,
    coins: data.coins ?? 100000,
    cash: data.cash ?? 5000,
    gems: data.gems ?? 200,
    rating: data.rating ?? 1200,
    power: data.power ?? 1500,
    signInStreak: data.signInStreak ?? 0,
    lastSignInDate: data.lastSignInDate ?? '',
    onlineClaimCount: data.onlineClaimCount ?? 0,
    equippedWeapons: data.equippedWeapons ?? '',
    activeWing: data.activeWing ?? '',
    activePet: data.activePet ?? '',
    quickbarJson: data.quickbarJson ?? '',
    luckDrawPos: data.luckDrawPos ?? 0,
    luckDrawStamina: data.luckDrawStamina ?? 100,
  };
}

export async function fetchCharacterFromServer(): Promise<SavedCharacter | null> {
  try {
    const data = await apiFetch('/character');
    localCharacterCache = mapServerCharacter(data);
    return localCharacterCache;
  } catch (_e) {
    return null;
  }
}

export async function saveCharacter(name: string, jobId: CreationJob, appearance: Appearance): Promise<SavedCharacter> {
  const data = await apiFetch('/character', {
    method: 'POST',
    body: JSON.stringify({ name, jobId, appearance }),
  });
  
  localCharacterCache = mapServerCharacter(data);
  return localCharacterCache;
}
