/**
 * Backfill des `teams` des chapitres déjà en base — **DRY-RUN PAR DÉFAUT**.
 *
 *   npx tsx scripts/backfill-chapters-teams.mts                  # dry-run : lecture seule, rapport
 *   npx tsx scripts/backfill-chapters-teams.mts --apply          # ⚠ ÉCRITURE Appwrite (flag obligatoire)
 *   npx tsx scripts/backfill-chapters-teams.mts --serie=<filtre> # ne traite qu'une série (slug)
 *
 * La team est une propriété du chapitre : les noms viennent des **clés** de
 * `chapters.groups` de chaque chapitre des JSON vanilla (corpus Complet +
 * essai dev, le premier fichier trouvé pour un slug l'emporte), ordre
 * stable, sans alias. Chaque chapitre en base est apparié à son chapitre de
 * corpus par `(slug de sa série, numero)` — y compris la renumérotation
 * `0 → 1` de l'import — et mis à jour quand ses teams diffèrent.
 *
 * Ne touche jamais : aux chapitres sans correspondance au corpus (graine de
 * démo, imports manuels du Gérant), ni aux lignes déjà bonnes. `updated_at`
 * des séries n'est pas modifié (aucune écriture sur `series`).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { Client, Query, TablesDB } from "node-appwrite";

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

/* ── Arguments ───────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SERIE_FILTER = (args.find((a) => a.startsWith("--serie=")) ?? "")
  .slice("--serie=".length)
  .trim()
  .toLowerCase();
for (const arg of args) {
  if (arg === "--apply" || arg.startsWith("--serie=")) continue;
  console.error(`✖ Argument inconnu : ${arg} (usage : --apply --serie=<filtre>)`);
  process.exit(1);
}

const CORPUS_DIRS = [
  process.env.ANCIEN_CORPUS || "C:/Users/test/Documents/Ancien Poroiniens/Complet/data/series",
  "C:/Users/test/Documents/Ancien Poroiniens/Les-Poroiniens-dev/Les_Poroiniens_Site/series",
];
const CONCURRENCE = 12;

/* ── Client Appwrite (lecture ; écriture sous `--apply`) ─────────────────── */

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const tables = new TablesDB(client);

type AppwriteRow = { $id: string } & Record<string, unknown>;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errCode(err: unknown): number | undefined {
  const e = err as { code?: number };
  return e?.code;
}

function truncate(value: string, size: number): string {
  return value.length > size ? value.slice(0, size) : value;
}

function uniqueStrings(values: Array<unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = (typeof raw === "string" ? raw : "").trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

async function listAll(table: string, queries: string[] = []): Promise<AppwriteRow[]> {
  const rows = new Map<string, AppwriteRow>();
  const limit = 500;
  for (let offset = 0; offset < 50_000; offset += limit) {
    const res = await withRetry(
      () =>
        tables.listRows({
          databaseId: DB_ID,
          tableId: table,
          queries: [...queries, Query.limit(limit), Query.offset(offset)],
        }),
      `list ${table}`,
    );
    for (const row of res.rows as unknown as AppwriteRow[]) rows.set(row.$id, row);
    if (res.rows.length < limit) break;
  }
  return [...rows.values()];
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

/* ── Corpus : slug → (clé de chapitre → teams) ───────────────────────────── */

const corpusParSlug = new Map<string, Map<string, string[]>>();

function loadCorpus(): void {
  for (const dir of CORPUS_DIRS) {
    if (!existsSync(dir)) {
      console.warn(`  ! corpus introuvable (ignoré) : ${dir}`);
      continue;
    }
    for (const file of readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json"))) {
      let parsed: { title?: string; chapters?: Record<string, { groups?: Record<string, string> }> };
      try {
        parsed = JSON.parse(readFileSync(join(dir, file), "utf8"));
      } catch {
        continue;
      }
      const titre = (typeof parsed.title === "string" ? parsed.title.trim() : "") || file.replace(/\.json$/i, "");
      const slug = slugify(titre) || slugify(file);
      if (!slug || corpusParSlug.has(slug)) continue;
      const parCle = new Map<string, string[]>();
      for (const [key, chapter] of Object.entries(parsed.chapters ?? {})) {
        parCle.set(
          key,
          uniqueStrings(Object.keys(chapter?.groups ?? {}))
            .slice(0, 20)
            .map((t) => truncate(t, 64)),
        );
      }
      corpusParSlug.set(slug, parCle);
    }
  }
  console.log(`▶ Corpus : ${corpusParSlug.size} séries lues (${CORPUS_DIRS.join(" + ")}).`);
}

/** Teams attendues d'un chapitre : clé exacte d'abord (`8.5`), sinon la
 *  renumérotation `0 → 1` de l'import (base `1` issue de la clé `"0"`). */
function teamsAttendues(parCle: Map<string, string[]>, numero: number): string[] | null {
  const exact = parCle.get(String(numero));
  if (exact !== undefined) return exact;
  if (numero === 1 && parCle.has("0") && ![...parCle.keys()].some((k) => Number(k) === 1)) {
    return parCle.get("0") ?? null;
  }
  return null;
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(APPLY ? "▶ Mode --apply : écriture Appwrite AUTORISÉE." : "▶ Dry-run : aucune écriture (--apply absent).");
  loadCorpus();

  const [series, chapters] = await Promise.all([listAll("series"), listAll("chapters")]);
  const slugParSerie = new Map(series.map((s) => [String(s.$id), String(s.slug ?? "")]));
  console.log(`▶ ${series.length} séries, ${chapters.length} chapitres en base.`);

  let sansCorpus = 0;
  let sansChapitreCorpus = 0;
  let dejaBonnes = 0;
  let videsConservees = 0;
  const updates: Array<{ id: string; label: string; teams: string[] }> = [];
  const exemples: string[] = [];

  for (const row of chapters) {
    const slug = slugParSerie.get(String(row.series_id)) ?? "";
    if (SERIE_FILTER && !slug.toLowerCase().includes(SERIE_FILTER)) continue;
    const numero = Number(row.numero);
    const label = `${slug} · ch. ${String(row.numero)}`;
    if (!slug || !Number.isFinite(numero)) {
      sansCorpus += 1;
      continue;
    }
    const parCle = corpusParSlug.get(slug);
    if (!parCle) {
      sansCorpus += 1; // graine de démo, imports manuels : jamais touchés
      continue;
    }
    const attendues = teamsAttendues(parCle, numero);
    if (attendues === null) {
      sansChapitreCorpus += 1;
      continue;
    }
    const actuelles = Array.isArray(row.teams) ? (row.teams as unknown[]).map(String) : [];
    const differ = attendues.length !== actuelles.length || attendues.some((t, i) => t !== actuelles[i]);
    if (!differ) {
      dejaBonnes += 1;
      continue;
    }
    if (attendues.length === 0) {
      videsConservees += 1; // chapitre sans groupe au corpus : on ne blanchit rien
      continue;
    }
    updates.push({ id: String(row.$id), label, teams: attendues });
    if (exemples.length < 10) exemples.push(`${label} ← ${attendues.join(", ")}`);
  }

  console.log("");
  console.log(`Chapitres à mettre à jour : ${updates.length}`);
  console.log(`Déjà bons : ${dejaBonnes} · sans correspondance (démo/manuels) : ${sansCorpus} · sans chapitre au corpus : ${sansChapitreCorpus} · vides conservées : ${videsConservees}`);
  for (const ex of exemples) console.log(`  · ${ex}`);

  if (!APPLY) {
    console.log("\nDry-run terminé : rien n'a été écrit dans Appwrite.");
    return;
  }

  let ok = 0;
  const ko: string[] = [];
  await runPool(updates, CONCURRENCE, async (u) => {
    try {
      await withRetry(
        () => tables.updateRow({ databaseId: DB_ID, tableId: "chapters", rowId: u.id, data: { teams: u.teams } }),
        `update chapters/${u.id}`,
      );
      ok += 1;
    } catch (err) {
      ko.push(`${u.label} : ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  console.log(`\n✔ chapitres mis à jour : ${ok}/${updates.length} (échecs : ${ko.length})`);
  for (const line of ko.slice(0, 20)) console.error(`  ✖ ${line}`);
  if (ko.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("✖ Échec :", err instanceof Error ? err.message : err);
  process.exit(1);
});
