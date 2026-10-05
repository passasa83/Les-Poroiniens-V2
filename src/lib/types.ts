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
  /** Nombre de chapitres (dénormalisé, §6.3 « One-shot »). */
  nb_chapitres: number;
  /** Texte de recherche concaténé (§6.4) : titres alternatifs et auteurs,
   *  indexés en fulltext car `Query.search()` refuse les colonnes array. */
  recherche_alt?: string;
  recherche_auteurs?: string;
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
  /** Origine des images : `nas` (chemins relatifs) ou `imgchest` (URLs CDN). */
  source: "nas" | "imgchest";
  /** Format d'origine de la série, dénormalisé à l'écriture (§6.1 : filtres de
   *  « Dernières sorties »). Absent sur les lignes créées avant cette colonne. */
  series_type?: SeriesType;
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

/**
 * Session de connexion affichée dans « Mon compte › Sessions » (§6.8).
 * Métadonnées affichables uniquement : jamais de jeton ni de secret.
 */
export interface SessionInfo {
  /** Identifiant de la session, ou `courante` en mode démonstration. */
  id: string;
  /** Session de l'appareil en cours : sa révocation déconnecte l'utilisateur. */
  courante: boolean;
  /** Date ISO de création (null si le fournisseur ne la communique pas). */
  creeeLe: string | null;
  /** Date ISO d'expiration (null si inconnue). */
  expireLe: string | null;
  /** Appareil et navigateur, en toutes lettres. */
  appareil: string;
  /** Moyen de connexion : e-mail et mot de passe, compte tiers… */
  fournisseur: string;
  /** Adresse IP consignée à la création (null si absente). */
  ip: string | null;
  /** Pays déduit de l'IP (null si absent). */
  pays: string | null;
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
  type: "upload" | "nas" | "drive" | "batch" | "imgchest";
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

export const SERIES_TYPE_LABELS: Record<SeriesType, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
};
