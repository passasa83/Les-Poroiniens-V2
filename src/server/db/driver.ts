/**
 * Petit langage de requête commun aux deux drivers (Appwrite / démo).
 * Une seule sémantique, traduite en `Query.*` côté Appwrite.
 */

import type {
  Annonce,
  AuditEntry,
  Chapter,
  ChapterLike,
  Comment,
  CommentLike,
  DemoUser,
  HistoryEntry,
  ImageError,
  ImportJob,
  LibraryEntry,
  Notification,
  Profile,
  Recommendation,
  Report,
  ScanPage,
  Series,
  SiteSetting,
} from "@/lib/types";

export type FilterValue = string | number | boolean | null;

export type Filter<F extends string = string> =
  | { field: F; op: "eq"; value: FilterValue }
  | { field: F; op: "neq"; value: FilterValue }
  | { field: F; op: "in"; value: (string | number)[] }
  | { field: F; op: "gte"; value: number | string }
  | { field: F; op: "lte"; value: number | string }
  | { field: F; op: "contains"; value: string | number }
  | { field: F; op: "search"; value: string };

export interface ListQuery<F extends string = string> {
  filters?: Filter<F>[];
  /** Recherche plein texte sur toutes les colonnes texte (Appwrite `search`). */
  search?: string;
  order?: { field: F; dir: "asc" | "desc" };
  limit?: number;
  offset?: number;
  /**
   * Colonnes à renvoyer (projection). `id` est toujours inclus. Les lignes
   * restent typées complètes : réservé aux lectures qui n'utilisent que ces
   * colonnes (index, comptages).
   */
  select?: readonly F[];
}

/** Type de ligne de chaque table (colonnes métier, sans `id`). */
export interface TableRows {
  series: Series;
  chapters: Chapter;
  pages: ScanPage;
  profiles: Profile;
  library: LibraryEntry;
  reading_history: HistoryEntry;
  comments: Comment;
  comment_likes: CommentLike;
  chapter_likes: ChapterLike;
  reports: Report;
  recommendations: Recommendation;
  notifications: Notification;
  audit_log: AuditEntry;
  site_settings: SiteSetting;
  annonces: Annonce;
  import_jobs: ImportJob;
  image_errors: ImageError;
  users: DemoUser;
}

export type TableName = keyof TableRows;

/** Ligne lue : colonnes métier + identifiant et horodatages système. */
export type Row<K extends TableName> = Omit<TableRows[K], "id"> & {
  id: string;
  $createdAt?: string;
  $updatedAt?: string;
};

/** Colonnes filtrables / triables d'une table. */
export type Field<K extends TableName> = Extract<keyof Row<K>, string>;

/** Filtre typé sur les colonnes d'une table. */
export type TableFilter<K extends TableName> = Filter<Field<K>>;

/** Données écrites : sous-ensemble typé des colonnes (jamais l'`id`). */
export type WriteData<K extends TableName> = Partial<Omit<TableRows[K], "id">>;

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface DbDriver {
  readonly name: "appwrite" | "demo";
  list<K extends TableName>(table: K, query?: ListQuery<Field<K>>): Promise<ListResult<Row<K>>>;
  get<K extends TableName>(table: K, id: string): Promise<Row<K> | null>;
  create<K extends TableName>(table: K, id: string, data: WriteData<K>): Promise<Row<K>>;
  update<K extends TableName>(table: K, id: string, data: WriteData<K>): Promise<Row<K>>;
  /** Crée la ligne ou met à jour l'existante, en un seul aller-retour. */
  upsert<K extends TableName>(table: K, id: string, data: WriteData<K>): Promise<Row<K>>;
  remove(table: TableName, id: string): Promise<void>;
}

export const TABLES = {
  series: "series",
  chapters: "chapters",
  pages: "pages",
  profiles: "profiles",
  library: "library",
  history: "reading_history",
  comments: "comments",
  commentLikes: "comment_likes",
  chapterLikes: "chapter_likes",
  reports: "reports",
  recommendations: "recommendations",
  notifications: "notifications",
  audit: "audit_log",
  settings: "site_settings",
  annonces: "annonces",
  importJobs: "import_jobs",
  imageErrors: "image_errors",
  users: "users", // démo uniquement (Appwrite Auth gère les comptes réels)
} as const satisfies Record<string, TableName>;

/** Correspondance `field` -> colonne Appwrite ($id pour l'identifiant,
 *  `index` étant un mot réservé SQL il est stocké sous `ordre`). */
export function appwriteField(field: string): string {
  if (field === "id") return "$id";
  if (field === "index") return "ordre";
  return field;
}
