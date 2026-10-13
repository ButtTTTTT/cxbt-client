import type { CreationAttachment, CreationJob, CreationPreset, CreationWeapon } from '../characterCreation/assets';

export type AvatarCard = {
  id: string;
  name: string;
  icon: string;
  preset: CreationPreset;
  appearanceData: Record<string, string>;
  source: { log: string; packet: number; sid?: string };
};

export type InventoryCategory = 'equipment' | 'items' | 'gestures' | 'avatars';
export type InventoryItem = {
  id: string;
  name: string;
  category: InventoryCategory;
  icon: string;
  weapon?: string;
  attachment?: CreationAttachment;
  animation?: string | null;
  preset?: { jobId: CreationJob; gender: number };
  avatarCard?: AvatarCard;
};
export type LobbyAssets = {
  ui: Record<string, string>;
  maps: { id: string; name: string; cover: string | null; roomImage: string | null; coverCard?: boolean }[];
  items: InventoryItem[];
  weapons: Record<string, CreationWeapon>;
  counts: Record<InventoryCategory, number>;
};
export const lobbyUrl = (path: string) => `${import.meta.env.BASE_URL}assets/lobby/${path}`;

export async function loadLobbyAssets(signal?: AbortSignal): Promise<LobbyAssets> {
  const [response, cardsResponse] = await Promise.all([
    fetch(lobbyUrl('catalog.json'), { signal }),
    fetch(lobbyUrl('../avatar-cards/catalog.json'), { signal }),
  ]);
  if (!response.ok || !cardsResponse.ok) throw new Error('背包素材加载失败');
  const [assets, { cards }] = await Promise.all([
    response.json() as Promise<LobbyAssets>,
    cardsResponse.json() as Promise<{ cards: AvatarCard[] }>,
  ]);
  assets.items = [...cards.map((card): InventoryItem => ({
    id: card.id, name: card.name, icon: card.icon, category: 'avatars', avatarCard: card,
  })), ...assets.items];
  assets.counts.avatars = assets.items.filter((item) => item.category === 'avatars').length;
  return assets;
}
