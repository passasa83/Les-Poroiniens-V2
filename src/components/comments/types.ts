export interface CommentNode {
  id: string;
  target_type: "series" | "chapter";
  target_id: string;
  parent_id: string | null;
  user_id: string;
  pseudo: string;
  contenu: string;
  spoiler: boolean;
  likes: number;
  dislikes: number;
  statut: "visible" | "masque" | "supprime";
  created_at: string;
  updated_at: string;
  liked?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  children?: CommentNode[];
}

export const MAX_LENGTH = 4000;

export const REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: "spoiler_non_masque", label: "Spoiler non masqué" },
  { value: "spam", label: "Spam / publicité" },
  { value: "harcèlement", label: "Harcèlement ou propos haineux" },
  { value: "hors_sujet", label: "Hors sujet" },
  { value: "autre", label: "Autre" },
];

export type Sort = "recents" | "populaires";

export function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}
