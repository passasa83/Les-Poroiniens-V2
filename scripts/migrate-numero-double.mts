/**
 * Migration `chapters.numero` : `integer` → `double` — **DRY-RUN PAR DÉFAUT**.
 *
 *   npx tsx scripts/migrate-numero-double.mts           # dry-run : lecture seule, rapport
 *   npx tsx scripts/migrate-numero-double.mts --apply   # ⚠ ÉCRITURE Appwrite (flag obligatoire)
 *
 * Contexte : les chapitres à numéros décimaux (`8.5`, `10.51`) exigent un
 * `numero` flottant en base (`scripts/import-ancien.mts`, lecteur
 * `src/app/serie/[slug]/[n]/page.tsx`, `src/proxy.ts`). Appwrite ne change
 * pas le type d'une colonne en place : on sauvegarde les valeurs, on
 * supprime l'index puis la colonne, on la recrée en `double`, on réécrit
 * chaque valeur à l'identique, puis on recrée l'index. `npm run
 * appwrite:setup` seul ne migre rien (il ajoute les colonnes manquantes —
 * `teams` — mais laisse `numero` tel quel) : ce script est le seul chemin.
 *
 * Règles : aucune écriture sans `--apply`, reprise sûre (les valeurs sont
 * relues avant toute suppression), écritures bornées à 12 avec reprise sur
 * 429/5xx. Base partagée dev/prod : `--apply` est visible en prod
 * immédiatement (voulu pour du vrai contenu).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { Client, Query, TablesDB, TablesDBIndexType } from "node-appwrite";

/* ── Environnement (.env.local lu manuellement, hors Next) ───────────────── */

const envFile = resolvePath(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || "poroiniens";

if (!ENDPOINT || !PROJECT || !API_KEY) {
  console.error(
    "✖ APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID / APPWRITE_API_KEY manquants dans .env.local",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
for (const arg of args) {
  if (arg !== "--apply") {
    console.error(`✖ Argument inconnu : ${arg} (usage : --apply)`);
    process.exit(1);
  }
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new TablesDB(client);

type AppwriteRow = { $id: string } & Record<string, unknown>;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errCode(err: unknown): number | undefined {
  const e = err as { code?: number };
  return e?.code;
}

function isNotFound(err: unknown): boolean {
  return errCode(err) === 404;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      const code = errCode(err);
      const retryable = code === undefined || code === 429 || (code >= 502 && code <= 504);
      if (attempt >= 5 || !retryable) throw err;
      const delay = attempt * 1500;
      console.warn(`  … ${label} : tentative ${attempt}/5 échouée, reprise dans ${delay} ms`);
      await sleep(delay);
    }
  }
}

async function listAllChapters(): Promise<AppwriteRow[]> {
  const rows: AppwriteRow[] = [];
  const limit = 500;
  for (let offset = 0; offset < 50_000; offset += limit) {
    const res = await withRetry(
      () =>
        db.listRows({
          databaseId: DB_ID,
          tableId: "chapters",
          queries: [Query.limit(limit), Query.offset(offset)],
        }),
      "list chapters",
    );
    for (const row of res.rows as unknown as AppwriteRow[]) rows.push(row);
    if (res.rows.length < limit) break;
  }
  return rows;
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  const portion = Math.ceil(items.length / limit);
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, (_, i) =>
      items.slice(i * portion, (i + 1) * portion),
    ).map(async (lot) => {
      for (const item of lot) await worker(item);
    }),
  );
}

/** Attend la disponibilité d'une colonne (création asynchrone côté Appwrite). */
async function waitColumn(key: string, type: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const cols = await withRetry(
      () => db.listColumns({ databaseId: DB_ID, tableId: "chapters", queries: [Query.limit(100)] }),
      "listColumns",
    );
    const col = cols.columns.find((c) => c.key === key) as unknown as
      | { type: string; status: string }
      | undefined;
    if (col && col.type === type && col.status === "available") return;
    await sleep(2000);
  }
  throw new Error(`colonne ${key} toujours pas disponible après 60 s`);
}

async function main(): Promise<void> {
  console.log(APPLY ? "▶ Mode --apply : migration AUTORISÉE." : "▶ Dry-run : aucune écriture (--apply absent).");

  const cols = await withRetry(
    () => db.listColumns({ databaseId: DB_ID, tableId: "chapters", queries: [Query.limit(100)] }),
    "listColumns",
  );
  const numero = cols.columns.find((c) => c.key === "numero") as unknown as
    | { type: string; status: string }
    | undefined;
  console.log(`▶ Colonne chapters.numero : type=${numero?.type ?? "?"} statut=${numero?.status ?? "?"}`);
  if (numero?.type === "double") {
    console.log("✔ Déjà en `double` : rien à faire.");
    return;
  }
  if (!numero || numero.type !== "integer") {
    console.error(`✖ Type inattendu (${numero?.type ?? "absente"}) : migration manuelle requise.`);
    process.exit(1);
  }

  // Sauvegarde relue avant toute suppression (reprise sûre).
  const chapters = await listAllChapters();
  const backup = new Map<string, number>();
  for (const row of chapters) {
    const n = Number(row.numero);
    if (Number.isFinite(n)) backup.set(row.$id, n);
  }
  const sansNumero = chapters.length - backup.size;
  const numeros = [...backup.values()].sort((a, b) => a - b);
  console.log(`▶ Chapitres : ${chapters.length} lignes, ${backup.size} numeros sauvegardés, ${sansNumero} sans numero.`);
  if (numeros.length > 0) {
    console.log(`  min=${numeros[0]} max=${numeros[numeros.length - 1]} (entiers : aucune valeur perdue, réécriture à l'identique)`);
  }

  if (!APPLY) {
    console.log("Dry-run terminé : la migration supprimerait l'index `idx_series_numero`,");
    console.log("la colonne `numero`, la recréerait en `double`, réécrirait les");
    console.log(`${backup.size} valeurs puis recréerait l'index. Relancez avec --apply.`);
    return;
  }

  try {
    await withRetry(() => db.deleteIndex({ databaseId: DB_ID, tableId: "chapters", key: "idx_series_numero" }), "deleteIndex");
    console.log("  ✔ index idx_series_numero supprimé");
  } catch (err) {
    if (!isNotFound(err)) throw err;
    console.log("  · index idx_series_numero déjà absent");
  }
  await withRetry(() => db.deleteColumn({ databaseId: DB_ID, tableId: "chapters", key: "numero" }), "deleteColumn");
  console.log("  ✔ colonne numero supprimée");
  await withRetry(
    () =>
      db.createFloatColumn({ databaseId: DB_ID, tableId: "chapters", key: "numero", required: false }),
    "createFloatColumn",
  );
  await waitColumn("numero", "double");
  console.log("  ✔ colonne numero recréée en `double`");

  let ok = 0;
  const ko: string[] = [];
  await runPool([...backup.entries()], 12, async ([id, value]) => {
    try {
      await withRetry(() => db.updateRow({ databaseId: DB_ID, tableId: "chapters", rowId: id, data: { numero: value } }), `update ${id}`);
      ok += 1;
    } catch (err) {
      ko.push(`${id} : ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  console.log(`  ✔ numeros réécrits : ${ok}/${backup.size} (échecs : ${ko.length})`);
  for (const line of ko.slice(0, 20)) console.error(`  ✖ ${line}`);

  await withRetry(
    () =>
      db.createIndex({
        databaseId: DB_ID,
        tableId: "chapters",
        key: "idx_series_numero",
        type: "key" as unknown as TablesDBIndexType,
        columns: ["series_id", "numero"],
      }),
    "createIndex",
  );
  console.log("  ✔ index idx_series_numero recréé");

  // Vérification : égalité exacte sur un numero entier existant.
  const probe = numeros.length > 0 ? numeros[0] : 1;
  const check = await withRetry(
    () =>
      db.listRows({
        databaseId: DB_ID,
        tableId: "chapters",
        queries: [Query.equal("numero", probe), Query.limit(1)],
      }),
    "verify",
  );
  console.log(`  ✔ vérification : Query.equal(numero, ${probe}) → ${check.total} ligne(s).`);
  if (ko.length > 0) process.exit(1);
  console.log("✔ Migration terminée.");
}

main().catch((err) => {
  console.error("✖ Échec :", err instanceof Error ? err.message : err);
  process.exit(1);
});
