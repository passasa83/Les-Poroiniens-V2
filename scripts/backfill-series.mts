/**
 * Backfill des couvertures des séries déjà en base — **DRY-RUN PAR DÉFAUT**.
 *
 *   npx tsx scripts/backfill-series.mts                  # dry-run : lecture seule, rapport
 *   npx tsx scripts/backfill-series.mts --apply          # ⚠ ÉCRITURE Appwrite (flag obligatoire)
 *   npx tsx scripts/backfill-series.mts --serie=<filtre> # ne traite qu'une série (slug)
 *
 * Pour chaque série dont la couverture stockée est **vide** (ni vivante ni
 * générée de la graine — voir états ci-dessous), et qui compte des chapitres
 * ImgChest avec pages, la **1re planche du chapitre au plus petit numéro**
 * devient `couverture` + `banniere` (même règle que les futurs imports dans
 * `scripts/import-ancien.mts`). Une couverture vivante n'est **jamais**
 * touchée ; les 10 lignes de la graine (`/api/img/cover/…`) non plus.
 *
 * `updated_at` n'est jamais modifié : un backfill ne doit pas faire remonter
 * des séries dans le tri « màj » ni le sitemap.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
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

const COVER_HOSTS = ["file.garden", "imgchest.com", "cdn.imgchest.com"];
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

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
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

/* ── États de couverture ─────────────────────────────────────────────────── */

type EtatCouverture = "vide" | "generee" | "vivante" | "morte" | "autre";

function etatCouverture(raw: unknown): EtatCouverture {
  const value = String(raw ?? "").trim();
  if (!value) return "vide";
  if (value.startsWith("/api/img/cover/")) return "generee"; // graine de démo : intouchable
  if (/img\.lesporoiniens\.org|les_poro_img/i.test(value)) return "morte";
  if (COVER_HOSTS.includes(hostOf(value))) return "vivante";
  return "autre";
}

/* ── Main ────────────────────────────────────────────────────────────────── */

interface Proposition {
  id: string;
  slug: string;
  data: Record<string, unknown>;
  detail: string[];
}

async function main(): Promise<void> {
  console.log(APPLY ? "▶ Mode --apply : écriture Appwrite AUTORISÉE." : "▶ Dry-run : aucune écriture (--apply absent).");

  const series = await listAll("series");
  console.log(`▶ ${series.length} séries en base.`);

  const etats = new Map<EtatCouverture, number>();
  const propositions: Proposition[] = [];
  const exemples: string[] = [];

  for (const row of series) {
    const slug = String(row.slug ?? "");
    if (SERIE_FILTER && !slug.toLowerCase().includes(SERIE_FILTER)) continue;
    const etat = etatCouverture(row.couverture);
    etats.set(etat, (etats.get(etat) ?? 0) + 1);

    const data: Record<string, unknown> = {};
    const detail: string[] = [];

    // Couvertures : seules les vides sont remplies (jamais de vivante écrasée).
    if (etat === "vide") {
      const chapters = await listAll("chapters", [Query.equal("series_id", row.$id)]);
      const imgchest = chapters
        .filter((c) => String(c.source ?? "") === "imgchest")
        .map((c) => ({ id: String(c.$id), numero: Number(c.numero) }))
        .filter((c) => Number.isFinite(c.numero))
        .sort((a, b) => a.numero - b.numero);
      let remplie = false;
      for (const chapter of imgchest) {
        const pages = await listAll("pages", [
          Query.equal("chapter_id", chapter.id),
          Query.orderAsc("ordre"),
          Query.limit(1),
        ]);
        const first = pages[0];
        const chemin = typeof first?.chemin === "string" ? first.chemin.trim() : "";
        if (chemin && /^https?:\/\//i.test(chemin)) {
          data.couverture = chemin;
          data.banniere = chemin;
          detail.push(`couverture ← 1re planche du ch. ${chapter.numero}`);
          remplie = true;
          break;
        }
      }
      if (!remplie) detail.push("couverture vide conservée (aucune page ImgChest)");
    }

    if (Object.keys(data).length > 0) {
      propositions.push({ id: String(row.$id), slug, data, detail });
      if (exemples.length < 8) exemples.push(`${slug} : ${detail.join(" ; ")}`);
    }
  }

  console.log("");
  console.log("ÉTATS DE COUVERTURE (base réelle)");
  for (const etat of ["vide", "generee", "vivante", "morte", "autre"] as const) {
    console.log(`  ${etat.padEnd(9)} : ${etats.get(etat) ?? 0}`);
  }
  const covers = propositions.filter((p) => p.data.couverture !== undefined).length;
  console.log("");
  console.log(`Séries à mettre à jour : ${propositions.length} (couvertures ${covers})`);
  for (const ex of exemples) console.log(`  · ${ex}`);

  if (!APPLY) {
    console.log("\nDry-run terminé : rien n'a été écrit dans Appwrite.");
    return;
  }

  let ok = 0;
  const ko: string[] = [];
  await runPool(propositions, CONCURRENCE, async (p) => {
    try {
      await withRetry(
        () => tables.updateRow({ databaseId: DB_ID, tableId: "series", rowId: p.id, data: p.data }),
        `update series/${p.slug}`,
      );
      ok += 1;
    } catch (err) {
      ko.push(`${p.slug} : ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  console.log(`\n✔ séries mises à jour : ${ok}/${propositions.length} (échecs : ${ko.length})`);
  for (const line of ko.slice(0, 20)) console.error(`  ✖ ${line}`);
  if (ko.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("✖ Échec :", err instanceof Error ? err.message : err);
  process.exit(1);
});
