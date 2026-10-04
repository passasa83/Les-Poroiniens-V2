/**
 * Modèle de domaine — aligné sur la section 13 du cahier des charges.
 * Les mêmes types servent au back Appwrite et au jeu de démonstration.
 */

export type Role = "visiteur" | "membre" | "modo" | "admin" | "owner";
export type Classification = "all" | "adult";
export type SeriesStatus = "en_cours" | "termine" | "hiatus" | "abandonne";
export type SeriesType = "manga" | "manhwa" | "manhua";
export type ChapterStatus = "draft" | "scheduled" | "published";
export type LibraryStatus = "en_cours" | "a_lire" | "termine" | "en_pause" | "abandonne";

export interface Series {
  id: string;
  slug: string;
  titre: string;
  titresAlt: string[];
  synopsis: string;
  couverture: string;
  banniere?: string;
  statut: SeriesStatus;
  type: SeriesType;
  annee: number | null;
  langue: string;
  classification: Classification;
  genres: string[];
  tags: string[];
  auteurs: string[];
  noteMoy: number;
  nbVotes: number;
  vues: number;
  populaire: number;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  series_id: string;
  numero: number;
  volume: number | null;
  titre: string;
  statut: ChapterStatus;
  publish_at: string | null;
  source: "nas";
  nb_pages: number;
  likes?: number;
  classification: Classification;
  vues: number;
  created_by: string;
  created_at: string;
}

export interface ScanPage {
  id: string;
  chapter_id: string;
  index: number;
  /** Chemin **relatif** au CDN (`public/<slug>/chapitres/0012/001.webp`) ou
   *  route locale `/api/img/…` en démonstration (§5.2). */
  chemin: string;
  largeur: number;
  hauteur: number;
  /** Taille en octets et hash du fichier : la version d'URL en dérive (§5.2). */
  bytes?: number | null;
  hash?: string | null;
}

export interface Profile {
  user_id: string;
  pseudo: string;
  avatar: string | null;
  bio: string;
  role: Role;
  date_inscription: string;
  adult_ok: boolean;
  adult_ok_at: string | null;
  confidentialite: { bibliothequePublique: boolean; statsPubliques: boolean };
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: "dark" | "light" | "system";
  sens_lecture: "ltr" | "rtl";
  mode_lecture: "vertical" | "single" | "double";
  langue: string;
  adult_ok: boolean;
  notifications: boolean;
  tagsMasques: string[];
}

export interface LibraryEntry {
  user_id: string;
  series_id: string;
  statut: LibraryStatus;
  favori: boolean;
  note: number | null;
  last_chapter_id: string | null;
  last_page: number;
  updated_at: string;
}

export interface HistoryEntry {
  user_id: string;
  chapter_id: string;
  series_id: string;
  page: number;
  completed: boolean;
  read_at: string;
}

export interface Comment {
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
}

export interface Report {
  id: string;
  type: "comment" | "chapter" | "series";
  target_id: string;
  reporter_id: string;
  raison: string;
  details: string;
  statut: "ouvert" | "traite" | "rejete";
  handled_by: string | null;
  created_at: string;
}

export interface Recommendation {
  id: string;
  placement: "home" | "series" | "end_chapter";
  titre: string;
  series_id: string;
  ordre: number;
  debut: string | null;
  fin: string | null;
  actif: boolean;
}

export interface Notification {
  id: string;
  user_id: string;
  type: "chapter" | "mention" | "system";
  payload: Record<string, unknown>;
  lu: boolean;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  actor_pseudo: string;
  action: string;
  cible: string;
  avant: string | null;
  apres: string | null;
  ip: string;
  created_at: string;
}

export interface ImportJob {
  id: string;
  type: "upload" | "nas" | "drive" | "batch";
  statut: "attente" | "cours" | "termine" | "erreur";
  progression: number;
  message: string;
  erreurs: string[];
  created_by: string;
  created_at: string;
}

export interface SiteSetting {
  cle: string;
  valeur: string;
}

/** Utilisateur connecté tel que renvoyé par getCurrentUser(). */
export interface CurrentUser {
  id: string;
  pseudo: string;
  email: string;
  role: Role;
  avatar: string | null;
  adult_ok: boolean;
  preferences: UserPreferences;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  sens_lecture: "rtl",
  mode_lecture: "vertical",
  langue: "fr",
  adult_ok: false,
  notifications: true,
  tagsMasques: [],
};

export const SERIES_STATUT_LABELS: Record<SeriesStatus, string> = {
  en_cours: "En cours",
  termine: "Terminé",
  hiatus: "Hiatus",
  abandonne: "Abandonné",
};
