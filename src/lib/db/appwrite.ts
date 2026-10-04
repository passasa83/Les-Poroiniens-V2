import "server-only";
import { Client, TablesDB, Query, ID, type Models } from "node-appwrite";
import {
  appwriteField,
  type DbDriver,
  type Filter,
  type ListQuery,
  type ListResult,
} from "./driver";
import { rowId as normalizeRowId } from "./ids";

type Row = Models.Row & Record<string, unknown>;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

function buildQueries(q?: ListQuery): string[] {
  const out: string[] = [];
  for (const f of q?.filters ?? []) {
    out.push(filterToQuery(f));
  }
  if (q?.order) {
    const field = appwriteField(q.order.field);
    out.push(
      q.order.dir === "desc" ? Query.orderDesc(field) : Query.orderAsc(field),
    );
  } else {
    out.push(Query.orderAsc("$createdAt"));
  }
  if (q?.offset) out.push(Query.offset(q.offset));
  if (q?.limit) out.push(Query.limit(Math.min(q.limit, 5000)));
  return out;
}

function filterToQuery(f: Filter): string {
  const field = appwriteField(f.field);
  switch (f.op) {
    case "eq":
      // le SDK typé accepte `string | any[]` : on laisse la valeur telle quelle
      return Query.equal(field, f.value as never);
    case "neq":
      return Query.notEqual(field, f.value as never);
    case "in":
      return Query.equal(field, f.value as (string | number)[]);
    case "gte":
      return Query.greaterThanEqual(field, f.value as number | string);
    case "lte":
      return Query.lessThanEqual(field, f.value as number | string);
    case "contains":
      return Query.contains(field, f.value as never);
    case "search":
      return Query.search(field, f.value);
  }
}

/** Normalise une ligne Appwrite : `$id` -> `id`, `ordre` -> `index` (pages). */
function mapRow<T>(table: string, row: Row): T {
  const { $id, $createdAt, $updatedAt, $sequence, $permissions, ...rest } = row;
  for (const [key, value] of Object.entries(rest)) {
    rest[key] = reviveJson(value);
  }
  if (table === "pages" && "ordre" in rest) {
    rest.index = rest.ordre;
    delete rest.ordre;
  }
  return {
    ...rest,
    id: $id,
    $createdAt: $createdAt,
    $updatedAt: $updatedAt,
  } as T;
}

/**
 * Les colonnes `longtext` stockent le JSON sous forme de texte : on le
 * relit en objet, en laissant tel quel tout ce qui n'est pas du JSON
 * (texte libre, valeur « 0 », etc.).
 */
function reviveJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Champs texte sur lesquels porte la recherche plein texte, par table.
 *
 * Contraintes Appwrite 2.3 :
 *  - `Query.search()` est refusé sur une colonne **array** (`titresAlt`,
 *    `auteurs`, `genres`…) ;
 *  - il exige un index de type **fulltext** sur la colonne (un index unique
 *    ou key ne suffit pas).
 * Seules les colonnes string indexées en fulltext sont donc listées ici ;
 * `appwrite:setup` crée ces index (`idx_titre`, `idx_slug_ft`, …).
 */
const SEARCH_FIELDS: Record<string, string[]> = {
  series: ["titre", "slug"],
  profiles: ["pseudo"],
  chapters: ["titre"],
};

/** Retire les champs internes ($id…) et l'`id` déjà porté par rowId. */
function toWriteData(table: string, data: Record<string, unknown>): Record<string, unknown> {
  const { id, $id, $createdAt, $updatedAt, $sequence, $permissions, ...rest } = data;
  if (table === "pages" && "index" in rest) {
    rest.ordre = rest.index;
    delete rest.index;
  }
  // Les objets/tableaux vont dans les colonnes `longtext` : JSON.stringify,
  // sinon Appwrite répond « Attribute … has invalid type ».
  for (const [key, value] of Object.entries(rest)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      rest[key] = JSON.stringify(value);
    } else if (value === undefined) {
      delete rest[key];
    }
  }
  return rest;
}

export class AppwriteDriver implements DbDriver {
  readonly name = "appwrite" as const;
  private readonly db: TablesDB;

  constructor() {
    const client = new Client()
      .setEndpoint(env("APPWRITE_ENDPOINT"))
      .setProject(env("APPWRITE_PROJECT_ID"))
      .setKey(env("APPWRITE_API_KEY"));
    this.db = new TablesDB(client);
  }

  private get databaseId(): string {
    return process.env.APPWRITE_DATABASE_ID || "poroiniens";
  }

  async list<T>(table: string, query?: ListQuery): Promise<ListResult<T>> {
    const fields = query?.search ? SEARCH_FIELDS[table] : undefined;

    // Recherche : une requête par champ texte, fusion côté serveur.
    if (query?.search && fields && fields.length > 0) {
      const settled = await Promise.allSettled(
        fields.map((field) =>
          this.db.listRows<Row>({
            databaseId: this.databaseId,
            tableId: table,
            queries: [
              ...buildQueries({ ...query, search: undefined }),
              Query.search(field, query.search!),
            ],
            total: false,
          }),
        ),
      );
      // Un champ refusé par Appwrite (colonne array, index manquant…) ne
      // doit pas mettre tout le site en erreur : on garde les champs qui
      // répondent et on ne propage l'erreur que si aucun n'a abouti.
      const runs = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
      if (runs.length === 0) {
        const failure = settled.find((s) => s.status === "rejected");
        throw (failure as PromiseRejectedResult).reason;
      }
      const unique = new Map<string, Row>();
      for (const run of runs) for (const row of run.rows) unique.set(row.$id, row);
      let rows = [...unique.values()].map((r) => mapRow<T>(table, r));
      if (query.order) {
        const { field, dir } = query.order;
        rows = rows.sort((a, b) => {
          const av = (a as Record<string, unknown>)[field];
          const bv = (b as Record<string, unknown>)[field];
          const cmp =
            typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av ?? "").localeCompare(String(bv ?? ""), "fr");
          return dir === "desc" ? -cmp : cmp;
        });
      }
      const offset = query.offset ?? 0;
      const limit = query.limit ?? rows.length;
      return { items: rows.slice(offset, offset + limit), total: rows.length };
    }

    const res = await this.db.listRows<Row>({
      databaseId: this.databaseId,
      tableId: table,
      queries: buildQueries(query),
    });
    return { items: res.rows.map((r) => mapRow<T>(table, r)), total: res.total };
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    try {
      const row = await this.db.getRow<Row>({
        databaseId: this.databaseId,
        tableId: table,
        rowId: normalizeRowId(id),
      });
      return mapRow<T>(table, row);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async create<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
    const row = await this.db.createRow<Row>({
      databaseId: this.databaseId,
      tableId: table,
      rowId: normalizeRowId(id),
      data: toWriteData(table, data),
    });
    return mapRow<T>(table, row);
  }

  async update<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
    const row = await this.db.updateRow<Row>({
      databaseId: this.databaseId,
      tableId: table,
      rowId: normalizeRowId(id),
      data: toWriteData(table, data),
    });
    return mapRow<T>(table, row);
  }

  async remove(table: string, id: string): Promise<void> {
    await this.db.deleteRow({
      databaseId: this.databaseId,
      tableId: table,
      rowId: normalizeRowId(id),
    });
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { code?: number; status?: number };
  return e?.code === 404 || e?.status === 404;
}

export { ID, Query };
