/**
 * Backfill des couvertures des séries déjà en base — **DRY-RUN PAR DÉFAUT**.
 *
 *   npx tsx scripts/backfill-series.mts                  # dry-run : lecture seule, rapport
 *   npx tsx scripts/backfill-series.mts --apply          # ⚠ ÉCRITURE Appwrite (flag obligatoire)
 *   npx tsx scripts/backfill-series.mts --serie=<filtre> # ne traite qu'une série (slug)
 *
 * Deux comblements, par ordre de priorité, pour chaque série dont la
 * couverture stockée est **vide** ou **générée** (graine de démo) :
 *  1. **couverture NAS du JSON** (`cover: https://img.lesporoiniens.org/…`,
 *     phase 1 « tout sur le NAS ») : le **chemin relatif** est stocké dans
 *     `couverture` + `banniere` (jamais l'URL absolue) ;
 *  2. sinon (série vide sans couverture au corpus) : la **1re planche du
 *     chapitre au plus petit numéro** (sources `imgchest` et `nas`), même
 *     règle que les imports dans `scripts/import-ancien.mts`.
 *
 * Une couverture **vivante** (`file.garden`, ImgChest) n'est **jamais**
 * touchée ; les lignes déjà comblées en relatif NAS non plus (état `nas`) ;
 * les états `morte`/`autre` sont signalés mais conservés.
 *
 * `updated_at` n'est jamais modifié : un backfill ne doit pas faire remonter
 * des séries dans le tri « màj » ni le sitemap.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve as resolvePath, join } from "node:path";
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

/** Corpus de l'ancien site : source des couvertures NAS (`cover: img.…`). */
const ANCIEN_CORPUS =
  process.env.ANCIEN_CORPUS || "C:/Users/test/Documents/Ancien Poroiniens/Complet/data/series";

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

type EtatCouverture = "vide" | "generee" | "vivante" | "nas" | "morte" | "autre";

function etatCouverture(raw: unknown): EtatCouverture {
  const value = String(raw ?? "").trim();
  if (!value) return "vide";
  if (value.startsWith("/api/img/cover/")) return "generee"; // graine de démo
  if (/img\.lesporoiniens\.org|les_poro_img/i.test(value)) return "morte";
  if (COVER_HOSTS.includes(hostOf(value))) return "vivante";
  // Chemin relatif déjà comblé par un backfill NAS : intouchable.
  if (!/^https?:\/\//i.test(value) && !value.startsWith("/")) return "nas";
  return "autre";
}

/** Même algorithme que `slugify()` de `src/lib/db/seed.ts`. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function truncate(value: string, size: number): string {
  return value.length > size ? value.slice(0, size) : value;
}

/** Retire le préfixe `IMG_BASE_URL` d'une URL `img.` → chemin relatif stockable. */
function stripImgBase(url: string): string {
  const base = (process.env.IMG_BASE_URL || process.env.CDN_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const clean = url.trim().split("?")[0];
  if (base && clean.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
    return clean.slice(base.length + 1).replace(/^\/+/, "");
  }
  return "";
}

/** Chemin NAS relatif valide : ni URL, ni `..`, ni préfixe `/proxy/`. */
function assertNasRelPath(relPath: string, context: string): string {
  const clean = relPath.trim().replace(/^\/+/, "").split("?")[0];
  if (!clean) throw new Error(`chemin NAS vide (${context})`);
  if (/^https?:\/\//i.test(clean)) throw new Error(`chemin NAS absolu refusé (${context})`);
  if (/les_poro_img|img\.lesporoiniens\.org|\/proxy\/api\//i.test(clean)) {
    throw new Error(`chemin NAS refusé (${context}) : ${truncate(clean, 140)}`);
  }
  // Anti traversal par segment : les noms à points (« Her Nickname is... »)
  // restent stockables, seuls les segments `..` / `.` sont refusés.
  if (clean.includes("\\") || clean.split("/").some((seg) => seg === ".." || seg === ".")) {
    throw new Error(`chemin NAS refusé (${context}) : ${truncate(clean, 140)}`);
  }
  return clean;
}

/**
 * Couverture NAS d'un JSON du corpus : premier candidat `img.` (cover,
 * galerie, vignette, aperçu) converti en chemin relatif. Chaîne vide sinon.
 */
function pickNasCover(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const serie = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const candidates: string[] = [str(serie.cover)];
  for (const key of ["covers_gallery", "Covers_gallery"] as const) {
    const gallery = serie[key];
    if (Array.isArray(gallery)) {
      for (const entry of gallery) {
        if (entry && typeof entry === "object") {
          const row = entry as Record<string, unknown>;
          candidates.push(str(row.url_lq));
          candidates.push(str(row.url_hq));
        }
      }
    }
  }
  candidates.push(str(serie.vignette));
  candidates.push(str(serie.preview_image));
  for (const candidate of candidates) {
    const relative = stripImgBase(candidate);
    if (!relative) continue;
    try {
      return assertNasRelPath(relative, "couverture NAS");
    } catch {
      continue;
    }
  }
  return "";
}

/**
 * Indexe le corpus : slug (titre **et** nom de fichier, même `slugify()`
 * que l'import) → couverture NAS relative. Les fichiers sans couverture
 * `img.` sont absents de l'index.
 */
function indexCorpusCovers(): { index: Map<string, string>; fichiers: number; collisions: string[] } {
  const index = new Map<string, string>();
  const collisions: string[] = [];
  let fichiers = 0;
  if (!existsSync(ANCIEN_CORPUS)) {
    console.error(`✖ Corpus introuvable : ${ANCIEN_CORPUS}`);
    process.exit(1);
  }
  for (const file of readdirSync(ANCIEN_CORPUS).filter((f) => f.toLowerCase().endsWith(".json"))) {
    fichiers += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(ANCIEN_CORPUS, file), "utf8"));
    } catch {
      continue;
    }
    const cover = pickNasCover(parsed);
    if (!cover) continue;
    const stem = file.replace(/\.json$/i, "");
    const title =
      parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).title === "string"
        ? ((parsed as Record<string, unknown>).title as string).trim()
        : "";
    for (const key of [slugify(title || stem), slugify(stem)]) {
      if (!key) continue;
      if (index.has(key) && index.get(key) !== cover) collisions.push(`${key} (${file})`);
      else index.set(key, cover);
    }
  }
  return { index, fichiers, collisions };
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

  const { index: nasCovers, fichiers, collisions } = indexCorpusCovers();
  console.log(`▶ Corpus : ${fichiers} fichiers, ${nasCovers.size} slugs avec couverture NAS.`);
  for (const collision of collisions.slice(0, 10)) {
    console.log(`  ! collision de slug (1er gardé) : ${collision}`);
  }

  const etats = new Map<EtatCouverture, number>();
  const propositions: Proposition[] = [];
  const exemples: string[] = [];
  let combleNas = 0;
  let comblePlanche = 0;
  let sansCorrespondance = 0;

  for (const row of series) {
    const slug = String(row.slug ?? "");
    if (SERIE_FILTER && !slug.toLowerCase().includes(SERIE_FILTER)) continue;
    const etat = etatCouverture(row.couverture);
    etats.set(etat, (etats.get(etat) ?? 0) + 1);

    const data: Record<string, unknown> = {};
    const detail: string[] = [];

    // Séries éligibles : couverture vide ou générée (jamais de vivante écrasée).
    if (etat === "vide" || etat === "generee") {
      const nas = nasCovers.get(slug) ?? "";
      if (nas) {
        // Priorité au NAS du JSON : chemin relatif, jamais l'URL absolue.
        data.couverture = nas;
        data.banniere = nas;
        detail.push(`couverture NAS ← ${nas}`);
        combleNas += 1;
      } else if (etat === "vide") {
        sansCorrespondance += 1;
        const chapters = await listAll("chapters", [Query.equal("series_id", row.$id)]);
        const importes = chapters
          .filter((c) => ["imgchest", "nas"].includes(String(c.source ?? "")))
          .map((c) => ({ id: String(c.$id), numero: Number(c.numero) }))
          .filter((c) => Number.isFinite(c.numero))
          .sort((a, b) => a.numero - b.numero);
        let remplie = false;
        for (const chapter of importes) {
          const pages = await listAll("pages", [
            Query.equal("chapter_id", chapter.id),
            Query.orderAsc("ordre"),
            Query.limit(1),
          ]);
          const first = pages[0];
          const chemin = typeof first?.chemin === "string" ? first.chemin.trim() : "";
          // URLs complètes (ImgChest) et chemins relatifs NAS acceptés
          // (`resolveCover` préfixe ces derniers) ; jamais de `/api/…` démo.
          if (!chemin || chemin.startsWith("/api/")) continue;
          data.couverture = chemin;
          data.banniere = chemin;
          detail.push(`couverture ← 1re planche du ch. ${chapter.numero}`);
          remplie = true;
          comblePlanche += 1;
          break;
        }
        if (!remplie) detail.push("couverture vide conservée (aucune page importée)");
      } else {
        detail.push("couverture générée conservée (aucune couverture NAS au corpus)");
      }
    }

    if (Object.keys(data).length > 0) {
      propositions.push({ id: String(row.$id), slug, data, detail });
      if (exemples.length < 8) exemples.push(`${slug} : ${detail.join(" ; ")}`);
    }
  }

  console.log("");
  console.log("ÉTATS DE COUVERTURE (base réelle)");
  for (const etat of ["vide", "generee", "vivante", "nas", "morte", "autre"] as const) {
    console.log(`  ${etat.padEnd(9)} : ${etats.get(etat) ?? 0}`);
  }
  const covers = propositions.filter((p) => p.data.couverture !== undefined).length;
  console.log("");
  console.log(`Séries à mettre à jour : ${propositions.length} (couvertures ${covers})`);
  console.log(`  · comblées par le NAS du JSON : ${combleNas}`);
  console.log(`  · comblées par 1re planche    : ${comblePlanche}`);
  console.log(`  · vides sans couverture NAS au corpus : ${sansCorrespondance}`);
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
