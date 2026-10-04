import "server-only";
import type { DbDriver, ListQuery, ListResult } from "./driver";
import { getDemoStore } from "./seed";

/**
 * Driver en mémoire utilisé tant que la clé API Appwrite n'est pas renseignée
 * (ou que l'instance est injoignable). Permet de piloter tout le site en local.
 * Le store est partagé par process : les écritures survivent aux requêtes,
 * un redémarrage repart du jeu de démonstration.
 */
function match(row: Record<string, unknown>, q?: ListQuery): boolean {
  if (q?.search) {
    const needle = normalize(q.search);
    const haystack = normalize(
      Object.entries(row)
        .filter(([, v]) => typeof v === "string" || Array.isArray(v))
        .map(([, v]) => (Array.isArray(v) ? v.join(" ") : String(v)))
        .join(" "),
    );
    if (!needle.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return (q?.filters ?? []).every((f) => {
    const v = row[f.field];
    switch (f.op) {
      case "eq":
        return v === f.value;
      case "neq":
        return v !== f.value;
      case "in":
        return f.value.some((x) => x === v);
      case "gte":
        return compare(v, f.value) >= 0;
      case "lte":
        return compare(v, f.value) <= 0;
      case "contains":
        return Array.isArray(v) && v.includes(f.value);
      case "search":
        return String(v ?? "")
          .toLowerCase()
          .includes(String(f.value).toLowerCase());
    }
  });
}

/** Normalisation insensible aux accents/casse : approximation de la tolérance aux fautes. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "fr");
}

export class DemoDriver implements DbDriver {
  readonly name = "demo" as const;

  async list<T>(table: string, q?: ListQuery): Promise<ListResult<T>> {
    const rows = [...getDemoStore()[table].values()].filter((r) => match(r, q));
    const dir = q?.order?.dir === "desc" ? -1 : 1;
    const field = q?.order?.field;
    if (field) {
      rows.sort((a, b) => dir * compare(a[field], b[field]));
    }
    const total = rows.length;
    const offset = q?.offset ?? 0;
    const limit = q?.limit ?? total;
    return { items: rows.slice(offset, offset + limit) as T[], total };
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    return (getDemoStore()[table].get(id) as T | undefined) ?? null;
  }

  async create<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
    const now = new Date().toISOString();
    const row = { id, ...data, created_at: data.created_at ?? now, $createdAt: now };
    getDemoStore()[table].set(id, row);
    return row as T;
  }

  async update<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
    const store = getDemoStore()[table];
    const current = store.get(id);
    if (!current) throw new Error(`Document introuvable : ${table}/${id}`);
    const row = { ...current, ...data, $updatedAt: new Date().toISOString() };
    store.set(id, row);
    return row as T;
  }

  async remove(table: string, id: string): Promise<void> {
    getDemoStore()[table].delete(id);
  }
}
