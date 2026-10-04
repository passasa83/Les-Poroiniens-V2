/**
 * Petit langage de requête commun aux deux drivers (Appwrite / démo).
 * Une seule sémantique, traduite en `Query.*` côté Appwrite.
 */

export type FilterValue = string | number | boolean | null;

export type Filter =
  | { field: string; op: "eq"; value: FilterValue }
  | { field: string; op: "neq"; value: FilterValue }
  | { field: string; op: "in"; value: (string | number)[] }
  | { field: string; op: "gte"; value: number | string }
  | { field: string; op: "lte"; value: number | string }
  | { field: string; op: "contains"; value: string | number }
  | { field: string; op: "search"; value: string };

export interface ListQuery {
  filters?: Filter[];
  /** Recherche plein texte sur toutes les colonnes texte (Appwrite `search`). */
  search?: string;
  order?: { field: string; dir: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface DbDriver {
  readonly name: "appwrite" | "demo";
  list<T = Record<string, unknown>>(table: string, query?: ListQuery): Promise<ListResult<T>>;
  get<T = Record<string, unknown>>(table: string, id: string): Promise<T | null>;
  create<T = Record<string, unknown>>(
    table: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<T>;
  update<T = Record<string, unknown>>(
    table: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<T>;
  remove(table: string, id: string): Promise<void>;
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
  importJobs: "import_jobs",
  users: "users", // démo uniquement (Appwrite Auth gère les comptes réels)
} as const;

/** Correspondance `field` -> colonne Appwrite ($id pour l'identifiant,
 *  `index` étant un mot réservé SQL il est stocké sous `ordre`). */
export function appwriteField(field: string): string {
  if (field === "id") return "$id";
  if (field === "index") return "ordre";
  return field;
}
