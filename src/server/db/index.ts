import "server-only";
import { AppwriteDriver } from "./appwrite";
import { DemoDriver } from "./demo";
import type { DbDriver, Field, ListQuery, Row, TableName } from "./driver";

export { TABLES } from "./driver";
export { rowId, ROW_ID_MAX } from "./ids";
export type {
  DbDriver,
  Field,
  Filter,
  ListQuery,
  ListResult,
  Row,
  TableFilter,
  TableName,
  WriteData,
} from "./driver";

/** Appwrite est actif uniquement si une clé API est renseignée. */
export function appwriteEnabled(): boolean {
  return Boolean(process.env.APPWRITE_API_KEY);
}

let driver: DbDriver | null = null;

/**
 * Bascule automatique : Appwrite si configuré, jeu de démonstration sinon.
 * Le driver est mis en cache par process (le client Appwrite est un singleton).
 */
export function getDb(): DbDriver {
  if (!driver) {
    driver = appwriteEnabled() ? new AppwriteDriver() : new DemoDriver();
  }
  return driver;
}

/** Nom du mode courant, affiché dans la barre d'outils de dev. */
export function dataMode(): "appwrite" | "demo" {
  return appwriteEnabled() ? "appwrite" : "demo";
}

const LIST_ALL_BATCH = 1000;
const LIST_ALL_MAX = 50_000;

/**
 * Toutes les lignes correspondant à `query`, lues par lots de 1000 (au lieu
 * d'un `limit: 1000` qui tronquait sans le dire). Un plafond de sécurité
 * (`max`) est journalisé s'il est atteint. Préférer `select` pour ne
 * rapatrier que les colonnes utiles.
 */
export async function listAll<K extends TableName>(
  table: K,
  query: Omit<ListQuery<Field<K>>, "limit" | "offset"> = {},
  max = LIST_ALL_MAX,
): Promise<Row<K>[]> {
  const db = getDb();
  const rows: Row<K>[] = [];
  // Ordre stable obligatoire pour paginer par offset.
  const order = query.order ?? { field: "id" as Field<K>, dir: "asc" as const };
  for (let offset = 0; offset < max; offset += LIST_ALL_BATCH) {
    const { items } = await db.list(table, {
      ...query,
      order,
      offset,
      limit: Math.min(LIST_ALL_BATCH, max - offset),
    });
    rows.push(...items);
    if (items.length < LIST_ALL_BATCH) return rows;
  }
  console.warn(`[db] listAll(${table}) : plafond de ${max} lignes atteint, résultat tronqué.`);
  return rows;
}

/**
 * Applique `fn` à chaque élément, `concurrence` à la fois : remplace les
 * boucles d'écritures séquentielles (un aller-retour par ligne) sans
 * inonder Appwrite de requêtes simultanées.
 */
export async function parLots<T>(
  items: readonly T[],
  fn: (item: T) => Promise<unknown>,
  concurrence = 10,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrence) {
    await Promise.all(items.slice(i, i + concurrence).map(fn));
  }
}

/**
 * Lignes dont `field` (par défaut l'identifiant) vaut l'une des `valeurs` :
 * lots de 50 valeurs (filtre `in` loin des limites d'URL) lus en
 * parallèle. Remède aux N+1 et aux tables lues en entier « pour retrouver
 * quelques lignes ».
 */
export async function listParValeurs<K extends TableName>(
  table: K,
  valeurs: readonly string[],
  field: Field<K> = "id" as Field<K>,
  query: Omit<ListQuery<Field<K>>, "limit" | "offset"> = {},
): Promise<Row<K>[]> {
  const uniques = [...new Set(valeurs)].filter(Boolean);
  const lots: string[][] = [];
  for (let i = 0; i < uniques.length; i += 50) lots.push(uniques.slice(i, i + 50));
  const resultats = await Promise.all(
    lots.map((lot) =>
      listAll(table, {
        ...query,
        filters: [...(query.filters ?? []), { field, op: "in", value: lot }] as ListQuery<
          Field<K>
        >["filters"],
      }),
    ),
  );
  return resultats.flat();
}
