import { CREATION_JOBS, type Appearance, type CreationJob } from './assets';

export type SavedCharacter = { version: 1; name: string; jobId: CreationJob; appearance: Appearance };
export const CHARACTER_KEY = 'avatarstar.character';

export function readCharacter(): SavedCharacter | null {
  try {
    const value = JSON.parse(localStorage.getItem(CHARACTER_KEY) ?? 'null');
    if (!value || value.version !== 1 || typeof value.name !== 'string' || !Object.hasOwn(CREATION_JOBS, value.jobId)) return null;
    if (!value.appearance || !['gender', 'hair', 'eyes', 'mouth', 'accessory'].every((key) => Number.isInteger(value.appearance[key]) && value.appearance[key] >= 0)) return null;
    return value;
  } catch {
    return null;
  }
}
