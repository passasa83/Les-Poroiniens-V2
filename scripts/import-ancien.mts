/**
 * Import de l'ancien corpus vers le nouveau site (Appwrite) — **DRY-RUN PAR DÉFAUT**.
 *
 *   npx tsx scripts/import-ancien.mts                   # dry-run : lecture seule, rapport
 *   npx tsx scripts/import-ancien.mts --no-resolve      # sans appel réseau ImgChest (cache seul)
 *   npx tsx scripts/import-ancien.mts --verbose         # détail complet des ignorés
 *   npx tsx scripts/import-ancien.mts --serie=<filtre>  # ne traite qu'une série (slug ou nom de fichier)
 *   npx tsx scripts/import-ancien.mts --include-no-cover
 *   npx tsx scripts/import-ancien.mts --apply           # ⚠ ÉCRITURE Appwrite (flag obligatoire)
 *
 * ─── Règles absolues ───────────────────────────────────────────────────────
 *  1. **Aucune écriture sans `--apply`** : par défaut le script ne fait que
 *     lire le corpus, Appwrite, ImgChest et le NAS. `--apply` est le seul chemin qui
 *     appelle `createRow`.
 *  2. **NAS actif (phase 1 « tout sur le NAS », 06/10/2026)** : les groupes
 *     `/proxy/api/les_poro_img/<Série>/<Chapitre N>` sont résolus via
 *     `NAS_API_BASE/list?path=<relPath>` et stockés en **chemin relatif**
 *     (`source: "nas"`), préfixés par `IMG_BASE_URL` à la lecture
 *     (`pageUrl`/`resolveCover` de `src/lib/media.ts`). `assertCleanUrl()`
 *     continue d'interdire toute URL morte **absolue** dans les champs qui
 *     n'en portent que des vivantes ; les chemins NAS relatifs sont validés
 *     par `assertNasRelPath()` (ni `..`, ni absolu, ni préfixe `/proxy/`).
 *     Seuls les albums **ImgChest** et les dossiers **NAS** sont indexés ;
 *     un chapitre qui porte les deux sources est importé **via ImgChest**
 *     (jamais dupliqué).
 *  3. **Idempotent** : chaque ligne porte un identifiant déterministe ; une
 *     ligne déjà présente est comptée « déjà là » et n'est pas réécrite, ce qui
 *     rend la ré-exécution et la reprise sûres (les pages manquantes d'un
 *     chapitre déjà créé sont comblées).
 *  4. **Quotas Appwrite** : écritures parallèles bornées à 12 (motif de
 *     `src/app/api/cron/seed/route.ts`), 6 pour la résolution ImgChest, avec
 *     reprise sur 429/5xx et isolation des erreurs par ligne.
 *
 * ─── Mapping ancien → nouveau (champ par champ) ────────────────────────────
 *
 * TABLE `series` (un fichier `data/series/*.json`)
 *   title                 → titre                tel quel (max 255)
 *   (dérivé)              → slug                 `slugify(title)`, même algorithme
 *                                                 que `src/lib/db/seed.ts`
 *   alternative_titles[]  → titresAlt[]          non vides, sans doublon, ≤20
 *   description           → synopsis             tel quel
 *   cover / covers_gallery[].url_lq|url_hq / vignette / preview_image
 *                         → couverture           hôtes vivants (`file.garden`,
 *                                                 `imgchest.com`,
 *                                                 `cdn.imgchest.com`) sinon
 *                                                 couverture NAS du JSON en
 *                                                 **chemin relatif**, sinon ""
 *                                                 → image générée
 *                                                 `/api/img/cover/<slug>`
 *   (même valeur)         → banniere             identique à `couverture`
 *                                                 (convention `src/lib/db/seed.ts`)
 *   release_status        → statut               Terminé/Fini/Finis → `termine`,
 *                                                 sinon `en_cours`
 *   manga_type + webtoon + magazine
 *                         → type                 `manhwa` si `webtoon:true` ou
 *                                                 éditeur coréen (TopToon, Lezhin,
 *                                                 DayComics, Postype…), sinon
 *                                                 `manga` (aucun manhua au corpus)
 *   manga_type            → classification       `Pornographique` → `adult`,
 *                                                 sinon `all` (les drapeaux
 *                                                 `pornwha`/`doujinshi` ne
 *                                                 concernent que des « Pornographique »)
 *   release_year          → annee                entier, sinon omis
 *   tags[]                → genres[] / tags[]    vocabulaire `GENRES` → `genres`,
 *                                                 le reste → `tags`
 *   chapters[*].groups (clés)
 *                         → teams[] (chapitre)   noms de groupes **de ce
 *                                                 chapitre**, ordre stable,
 *                                                 sans alias — pastilles des
 *                                                 lignes de la fiche
 *   author + artist       → auteurs[]            uniques et non vides
 *   (constante)           → langue               "FR"
 *   (convention admin)    → noteMoy, nbVotes, vues, populaire
 *                                                 0
 *   (dénombrement)        → nb_chapitres         chapitres importables (NAS + ImgChest)
 *   titresAlt / auteurs   → recherche_alt / recherche_auteurs
 *                                                 `join(" ")` tronqué à 512 (§6.4)
 *   chapters[*].last_updated (Unix)
 *                         → created_at, updated_at
 *                                                 ISO min/max du corpus, plafonné à `now`
 *   (dérivé)              → id                   `rowId("s-" + slug)`
 *
 * TABLE `chapters` (un objet de `chapters`)
 *   clé d'objet ("12","8.5")
 *                         → numero               **entier ou décimal > 0**
 *                                                 (`double` en base, tri
 *                                                 numérique) ; la clé "0"
 *                                                 devient `1` si `1` est
 *                                                 libre, sinon elle est
 *                                                 ignorée ; clés non
 *                                                 numériques (`Oneshot`,
 *                                                 `1 en couleur`) → ignorées
 *   groupe `…/imgchest/chapter/<id>`
 *                         → source               "imgchest" (pages : URL CDN
 *                                                 complètes, voir ci-dessous)
 *   groupe `/proxy/api/les_poro_img/<Série>/<Chapitre N>`
 *                         → source               "nas" (**sans** équivalent
 *                                                 ImgChest sur le chapitre —
 *                                                 jamais de doublon) ; pages
 *                                                 résolues via
 *                                                 `NAS_API_BASE/list?path=`,
 *                                                 `chemin` **relatif**
 *                                                 (préfixé par `IMG_BASE_URL`
 *                                                 dans `pageUrl()`)
 *   clés de `groups`      → teams                noms des équipes de ce
 *                                                 chapitre (pastilles fiche)
 *   title                 → titre                sinon `Chapitre <numero>`
 *   volume                → volume               entier, sinon omis
 *   last_updated (sec.)   → publish_at, created_at
 *                                                 ISO ; `statut = published`
 *   (dénormalisés)        → series_id, series_type, classification
 *   (résolution album)    → nb_pages              fichiers de l'album
 *   (conventions)         → vues=0, likes=0
 *   (compte Gérant)       → created_by            id Appwrite de
 *                                                 APPWRITE_OWNER_EMAIL, sinon "user-owner"
 *   (dérivé)              → id                    `rowId(\`${seriesId}-c${numero}\`)`
 *   (sans groupe ni dossier) → —                   **ignorés** (aucune source)
 *
 * TABLE `pages` (un fichier de l'album ImgChest résolu, ou une entrée
 * `NAS_API_BASE/list?path=` pour la source `nas`)
 *   rang dans l'album     → ordre                 0..n-1 (la colonne publique
 *                                                 `index` est mappée sur `ordre`
 *                                                 par `src/lib/db/appwrite.ts`)
 *   file.link             → chemin                URL CDN **complète**
 *                                                 `https://cdn.imgchest.com/…` :
 *                                                 `pageUrl()` la sert telle quelle
 *                                                 (§7.1 « URL héritée »)
 *   entrée `NAS_API_BASE/list?path=` (URL absolue `img.`)
 *                         → chemin                **relatif** (préfixe `IMG_BASE_URL`
 *                                                 retiré, encodage `%20` conservé) :
 *                                                 `pageUrl()` le préfixe à la lecture
 *   file.width/height     → largeur/hauteur       défaut 1200 × 1800 (`/list`
 *                                                 ne donne pas de dimensions)
 *   file.size             → bytes                 défaut 0
 *   file.id               → hash                  version d'URL `?v=`
 *   (dérivé)              → id                    `rowId(chapterId, "p<i>")`
 *   (dérivé)              → chapter_id            id du chapitre
 *
 * ─── Décisions éditoriales ─────────────────────────────────────────────────
 *  A. **Séries sans aucun chapitre importable** : la fiche est importée (avec
 *     `nb_chapitres = 0`) **si et seulement si** une couverture vivante existe ;
 *     sinon la série est ignorée et listée dans le rapport. Justification : une
 *     fiche lisible avec image vaut mieux qu'une ligne cassée, mais une fiche
 *     sans image ni chapitre n'a aucune valeur et pollue le catalogue.
 *     `--include-no-cover` force l'import de ces fiches (couverture générée).
 *  B. **Séries sans couverture vivante mais avec des chapitres** : fiche
 *     importée quand même (les chapitres sont la valeur) ; la couverture
 *     devient la couverture NAS du JSON (chemin relatif) si elle existe,
 *     sinon la **1re planche du chapitre au plus petit numéro** (plutôt
 *     que l'image générée). Une couverture vivante n'est jamais écrasée.
 *  C. **Chapitres NAS** : **importés** via `NAS_API_BASE/list?path=` (chemin
 *     relatif, `source: "nas"`), sauf dossier absent ou API injoignable
 *     (comptés « non résolus », rien n'est écrit pour eux). Un chapitre qui
 *     porte aussi un album ImgChest est importé **via ImgChest** (jamais
 *     dupliqué) ; les teams (clés de `groups`) s'appliquent aux deux sources.
 *  D. **Chapitres sans groupe de scan** : ignorés (aucune source).
 *  E. **Numéros non entiers** (`8.5`, `10.51`) : **importés** (`numero`
 *     `double` en base, tri numérique, précédent/suivant corrects,
 *     affichage « Chapitre 8.5 »). Seules les clés non numériques
 *     (`Oneshot`, `1 en couleur`) restent ignorées, avec rapport.
 *  F. **Chapitre `0`** : renuméroté `1` si `1` est libre dans la série,
 *     sinon ignoré (collision).
 *  G. **Dates** : `last_updated` devient `publish_at` ; les dates sont anciennes,
 *     aucune série importée n'apparaîtra donc en « Nouveautés » (7 jours).
 *  H. **Ordre des pages** : `position` croissante de l'album, comme dans
 *     `POST /api/owner/import`.
 *  I. **Comptes** : rien migré (décision client) ; `created_by` ne fait que
 *     référencer le compte Gérant existant.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { Client, Query, TablesDB, Users } from "node-appwrite";
import { rowId } from "../src/lib/db/ids";

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

const USAGE = [
  "Usage : npx tsx scripts/import-ancien.mts [options]",
  "",
  "  (sans argument)     dry-run : lecture seule + rapport, aucune écriture",
  "  --apply             autorise l'écriture Appwrite (seul flag d'écriture)",
  "  --no-resolve        ne résout pas les albums hors du cache local",
  "  --verbose           détail complet des séries/chapitres ignorés",
  "  --include-no-cover  importe aussi les fiches sans couverture vivante",
  "  --serie=<filtre>    ne traite qu'une série (slug ou fragment de nom)",
  "  --help              cette aide",
].join("\n");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RESOLVE = !args.includes("--no-resolve");
const VERBOSE = args.includes("--verbose");
const INCLUDE_NO_COVER = args.includes("--include-no-cover");
const SERIE_FILTER = (
  args.find((a) => a.startsWith("--serie=")) ?? ""
)
  .slice("--serie=".length)
  .trim()
  .toLowerCase();

for (const arg of args) {
  if (arg === "--help") {
    console.log(USAGE);
    process.exit(0);
  }
  const known = ["--apply", "--no-resolve", "--verbose", "--include-no-cover", "--serie="].some(
    (k) => arg === k || arg.startsWith(k),
  );
  if (!known) {
    console.error(`✖ Argument inconnu : ${arg}\n\n${USAGE}`);
    process.exit(1);
  }
}
if (APPLY && !RESOLVE) {
  console.error("✖ --apply exige la résolution des albums et dossiers (retirez --no-resolve).");
  process.exit(1);
}

/* ── Constantes ──────────────────────────────────────────────────────────── */

const ANCIEN_CORPUS =
  process.env.ANCIEN_CORPUS || "C:/Users/test/Documents/Ancien Poroiniens/Complet/data/series";

/** Écritures parallèles bornées — motif de `src/app/api/cron/seed/route.ts`. */
const CONCURRENCE = 12;
/** Résolution des albums ImgChest : on reste poli envers ImgChest. */
const CONCURRENCE_ALBUMS = 6;
/** Listings NAS : l'API du proprio supporte la parallélisation modérée. */
const CONCURRENCE_NAS = 6;
const TTL_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
/** Cache local des albums résolus : %TEMP%, sans lien avec Appwrite. */
const CACHE_FILE = join(tmpdir(), "poroiniens-imgchest-cache.json");
/** Cache local des dossiers NAS résolus : %TEMP%, sans lien avec Appwrite. */
const NAS_CACHE_FILE = join(tmpdir(), "poroiniens-nas-cache.json");

const IMGCHEST_CHAPTER = /\/imgchest\/chapter\/([a-z0-9]{4,32})(?:[/?#]|$)/i;
const IMGCHEST_POST = /imgchest\.com\/p\/([a-z0-9]{4,32})(?:[/?#]|$)/i;
const IMGCHEST_ID = /^[a-z0-9]{4,32}$/i;
/** Groupes de l'ancien site qui pointent vers un dossier du NAS. */
const NAS_PROXY_PREFIX = /\/proxy\/api\/les_poro_img\//i;
/** Domaine public qui sert les fichiers du NAS (préfixe retiré au stockage). */
function imgBaseOf(): string {
  return (process.env.IMG_BASE_URL || process.env.CDN_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
}
/** API de listing du NAS (`/list?path=…`, pattern validé par le proprio). */
function nasApiBaseOf(): string {
  return (process.env.NAS_API_BASE || process.env.NAS_API_URL || "").trim().replace(/\/+$/, "");
}
/** Domaines encore en vie pour une couverture. */
const COVER_HOSTS = ["file.garden", "imgchest.com", "cdn.imgchest.com"];
/** Ce qui ne doit **jamais** être écrit : NAS mort et domaine mort. */
const FORBIDDEN = /les_poro_img|img\.lesporoiniens\.org|\/proxy\/api\//i;

/** Vocabulaire de genres (le reste des `tags` de l'ancien site va dans `tags`). */
const GENRES = new Set(
  [
    "Action",
    "Aventure",
    "Comédie",
    "Drame",
    "École",
    "Fantastique",
    "Historique",
    "Horreur",
    "Romance",
    "Science-fiction",
    "Slice of life",
    "Tranche de vie",
    "Thriller",
    "Mystère",
    "Psychologie",
    "Tragédie",
    "Sport",
    "Musique",
    "Cuisine",
    "Guerre",
    "Politique",
    "Surnaturel",
    "Vampires",
    "Isekai",
    "Yuri",
    "Yaoi",
    "Harem",
    "Magie",
    "Érotique",
  ].map((g) => g.toLowerCase()),
);

/** Éditeurs coréens : `manga_type` de l'ancien site est une cible, pas un format. */
const KOREAN_MAGAZINES = new Set(
  [
    "toptoon",
    "top toon",
    "lezhin",
    "daycomics",
    "postype",
    "naver",
    "kakao",
    "toomics",
    "bomtoon",
    "ridibooks",
  ].map((m) => m.toLowerCase()),
);

const STATUTS_TERMINES = new Set(["terminé", "termines", "terminée", "fini", "finis"]);

/* ── Types ───────────────────────────────────────────────────────────────── */

type AppwriteRow = { $id: string } & Record<string, unknown>;

interface AncienChapitre {
  title?: string;
  volume?: string;
  last_updated?: string;
  groups?: Record<string, string>;
}

interface AncienSerie {
  title?: string;
  description?: string;
  artist?: string;
  author?: string;
  cover?: string;
  vignette?: string;
  preview_image?: string;
  manga_type?: string;
  magazine?: string;
  release_year?: number;
  tags?: string[];
  alternative_titles?: string[];
  release_status?: string;
  covers_gallery?: Array<{ url_hq?: string; url_lq?: string }>;
  Covers_gallery?: Array<{ url_hq?: string; url_lq?: string }>;
  doujinshi?: boolean;
  pornwha?: boolean;
  webtoon?: boolean;
  chapters?: Record<string, AncienChapitre>;
}

/** Ligne `pages` : exactement les colonnes de la table, plus l'id déterministe. */
interface PagePlan {
  id: string;
  chapter_id: string;
  ordre: number;
  chemin: string;
  largeur: number;
  hauteur: number;
  bytes: number;
  hash: string;
}

interface ChapterPlan {
  serie: string;
  key: string;
  numero: number;
  remapped: boolean;
  /** Source du chapitre : album ImgChest ou dossier NAS (jamais les deux). */
  source: "imgchest" | "nas";
  albumId: string;
  /** Dossier NAS relatif décodé (ex. `Fruit of the Underworld/Chapitre 1`). */
  nasPath: string;
  titre: string;
  /** Équipes de scantrad du chapitre (clés de `groups`, ordre stable). */
  teams: string[];
  volume: number | null;
  publishAt: string;
  chapterId: string;
  /** Résolution ImgChest (null = album non résolu). */
  pages: PagePlan[] | null;
  /** Ligne déjà en base (même `source`) : jamais réécrite. */
  existing: AppwriteRow | null;
  /** Ligne à écrire, buildée après résolution. */
  row: Record<string, unknown> | null;
  /** Raison pour laquelle les pages d'un chapitre existant sont laissées telles quelles. */
  pagesSkipped: string | null;
}

interface SeriesPlan {
  file: string;
  titre: string;
  slug: string;
  seriesId: string;
  row: Record<string, unknown>;
  chapters: ChapterPlan[];
  /** Présente en base avec le même titre : ligne réutilisée. */
  existing: AppwriteRow | null;
  /** Slug déjà pris par une autre œuvre : rien n'est touché. */
  duplicate: boolean;
}

type Ignored = { titre: string; detail: string };

/* ── Compteurs & rapport ─────────────────────────────────────────────────── */

const stats = {
  fichiers: 0,
  fichiersEnErreur: 0,
  seriesAnalysees: 0,
  seriesACreer: 0,
  seriesFicheSeule: 0,
  seriesReutilisees: 0,
  seriesIgnorees: 0,
  seriesDoublons: 0,
  couverturesVivantes: 0,
  couverturesSansSource: 0,
  couverturesAuto: 0,
  chaptersAvecTeams: 0,
  chapitresTotal: 0,
  chapitresImgchest: 0,
  chapitresNas: 0,
  chapitresNasSansApi: 0,
  chapitresNasDossierAbsent: 0,
  chapitresNasDoublonDossier: 0,
  seriesMixtes: 0,
  seriesNasSeul: 0,
  chapitresSansSource: 0,
  chapitresIgnoresNumero: 0,
  chapitresIgnoresAutreSource: 0,
  chapitresRenumerotes: 0,
  chapitresExistants: 0,
  chapitresACreer: 0,
  chapitresNonResolus: 0,
  pagesACreer: 0,
  pagesExistantes: 0,
  albumsResolus: 0,
  albumsDepuisCache: 0,
  albumsNonResolus: 0,
  dossiersNasResolus: 0,
  dossiersNasDepuisCache: 0,
  dossiersNasNonResolus: 0,
};

const ignoredSeries: Ignored[] = [];
const duplicateSeries: Ignored[] = [];
const ignoredChapters: Ignored[] = [];
const errors: string[] = [];

function recordError(label: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const line = `${label} : ${message}`;
  if (errors.length < 50) errors.push(line);
  console.error(`  ✖ ${line}`);
}

function verbose(...parts: unknown[]): void {
  if (VERBOSE) console.log(...parts);
}

function list(label: string, items: string[], max = 12): void {
  if (items.length === 0) return;
  console.log(`   ${label}`);
  const shown = VERBOSE ? items : items.slice(0, max);
  for (const item of shown) console.log(`     · ${item}`);
  if (!VERBOSE && items.length > max) {
    console.log(`     … et ${items.length - max} de plus (--verbose)`);
  }
}

/* ── Utilitaires ─────────────────────────────────────────────────────────── */

/** Même algorithme que `slugify()` de `src/lib/db/seed.ts`. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Garde-fou central : **aucune** URL morte ni chemin NAS ne doit partir en
 * base. Toute violation lève une erreur — comptée en erreur, jamais écrite.
 */
function assertCleanUrl(url: string, context: string): string {
  if (!url) return "";
  if (FORBIDDEN.test(url)) {
    throw new Error(`URL interdite (${context}) : ${truncate(url, 140)}`);
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(`URL non absolue (${context}) : ${truncate(url, 140)}`);
  }
  return url;
}

function isoFromUnix(value: string | undefined, now: Date): { iso: string; ok: boolean } {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return { iso: now.toISOString(), ok: false };
  const date = new Date(n * 1000);
  if (Number.isNaN(date.getTime())) return { iso: now.toISOString(), ok: false };
  // Pas de date future : elle ferait basculer la ligne en « planifié ».
  return { iso: (date.getTime() > now.getTime() ? now : date).toISOString(), ok: true };
}

function parseVolume(value: string | undefined): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/* ── Client Appwrite (lecture ; écriture sous `--apply`) ─────────────────── */

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const tables = new TablesDB(client);

function errCode(err: unknown): number | undefined {
  const e = err as { code?: number; response?: { code?: number } };
  return e?.code ?? e?.response?.code;
}

function isDuplicate(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return errCode(err) === 409 || /already exists/i.test(message);
}

function isRetryable(err: unknown): boolean {
  const code = errCode(err);
  if (code === undefined) return true; // erreur réseau
  return code === 429 || code === 502 || code === 503 || code === 504;
}

/** Reprise sur 429/5xx (quotas Appwrite), échec après 5 tentatives.
 *  Un dossier NAS absent n'est jamais rejoué (constaté en 1 appel). */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof NasMissingError) throw err;
      attempt += 1;
      if (attempt >= 5 || !isRetryable(err)) throw err;
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

type CreateResult = "cree" | "deja-la";

async function createRow(
  table: string,
  id: string,
  data: Record<string, unknown>,
): Promise<CreateResult> {
  try {
    await withRetry(
      () => tables.createRow({ databaseId: DB_ID, tableId: table, rowId: id, data }),
      `create ${table}/${id}`,
    );
    return "cree";
  } catch (err) {
    if (isDuplicate(err)) return "deja-la";
    throw err;
  }
}

/** Traitement parallèle borné : une erreur par ligne n'arrête jamais le lot. */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
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

/* ── Résolution des albums ImgChest (lecture réseau uniquement) ──────────── */

type AlbumFile = {
  url: string;
  position: number;
  width?: number;
  height?: number;
  bytes?: number;
  hash?: string;
};

const albumCache = new Map<string, { at: number; files: AlbumFile[] }>();
let cacheDirty = false;

function loadCache(): void {
  try {
    if (!existsSync(CACHE_FILE)) return;
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Record<
      string,
      { at: number; files: AlbumFile[] }
    >;
    for (const [id, entry] of Object.entries(raw)) albumCache.set(id, entry);
  } catch {
    /* cache illisible : on repart de zéro */
  }
}

function saveCache(): void {
  if (!cacheDirty) return;
  try {
    const out: Record<string, { at: number; files: AlbumFile[] }> = {};
    for (const [id, entry] of albumCache) out[id] = entry;
    writeFileSync(CACHE_FILE, JSON.stringify(out), "utf8");
    cacheDirty = false;
  } catch (err) {
    recordError("cache ImgChest", err);
  }
}

/** Décodage d'attribut HTML — copie de `decodeAttribute()` de `src/lib/imgchest.ts`
 *  (module `server-only`, non importable depuis un script hors Next). */
function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** `GET /p/<id>` : l'album complet est embarqué dans l'attribut `data-page`. */
async function fetchAlbum(id: string): Promise<AlbumFile[]> {
  const res = await fetch(`https://imgchest.com/p/${id}`, {
    headers: {
      "User-Agent": "Les-Poroiniens-Reader/2.0 (+https://lesporoiniens.org)",
      Accept: "text/html",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ImgChest a répondu ${res.status}`);
  const html = await res.text();
  const match = html.match(/<div id="app" data-page="([^"]+)"><\/div>/);
  if (!match || !match[1]) throw new Error("album introuvable (protocole)");
  let data: unknown;
  try {
    data = JSON.parse(decodeAttribute(match[1]));
  } catch {
    throw new Error("album illisible (JSON invalide)");
  }
  const files = ((data as { props?: { post?: { files?: unknown }; files?: unknown } })?.props?.post as
    | { files?: unknown }
    | undefined)?.files ??
    ((data as { props?: { files?: unknown } })?.props?.files ?? []) as unknown[];
  if (!Array.isArray(files)) throw new Error("aucun fichier dans l'album");

  const out: AlbumFile[] = [];
  for (const raw of files) {
    // Repli observé sur l'ancien site : `props.files` et `link || url`.
    const row = (typeof raw === "string" ? { link: raw } : raw) as Record<string, unknown> | null;
    if (!row || typeof row !== "object") continue;
    const link = typeof row.link === "string" ? row.link.trim() : "";
    const alt = typeof row.url === "string" ? row.url.trim() : "";
    const url = link || alt;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (row.mp4 === 1 || row.mp4 === true || /\.mp4($|\?)/i.test(url)) continue;
    out.push({
      url,
      position: num(row.position) ?? out.length + 1,
      width: num(row.width),
      height: num(row.height),
      bytes: num(row.size),
      hash: typeof row.id === "string" && row.id ? row.id : undefined,
    });
  }
  out.sort((a, b) => a.position - b.position);
  if (out.length === 0) throw new Error("aucune image dans l'album");
  return out;
}

/** Cache local (%TEMP%) puis réseau ; `--no-resolve` ne sort jamais du cache. */
async function resolveAlbum(id: string): Promise<AlbumFile[] | null> {
  const hit = albumCache.get(id);
  if (hit && Date.now() - hit.at < TTL_CACHE_MS) {
    stats.albumsDepuisCache += 1;
    return hit.files;
  }
  if (!RESOLVE) return null;
  try {
    const files = await withRetry(() => fetchAlbum(id), `imgchest/${id}`);
    albumCache.set(id, { at: Date.now(), files });
    cacheDirty = true;
    stats.albumsResolus += 1;
    return files;
  } catch (err) {
    stats.albumsNonResolus += 1;
    recordError(`album ImgChest ${id}`, err);
    return null;
  }
}

/* ── Résolution des dossiers NAS (`/list?path=…`, lecture réseau) ──────── */

type NasFile = {
  /** Chemin relatif stockable (préfixe `IMG_BASE_URL` retiré). */
  chemin: string;
  position: number;
  width?: number;
  height?: number;
  bytes?: number;
  hash?: string;
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

const nasCache = new Map<string, { at: number; files: NasFile[]; missing: boolean }>();
let nasCacheDirty = false;

function loadNasCache(): void {
  try {
    if (!existsSync(NAS_CACHE_FILE)) return;
    const raw = JSON.parse(readFileSync(NAS_CACHE_FILE, "utf8")) as Record<
      string,
      { at: number; files: NasFile[]; missing?: boolean }
    >;
    for (const [id, entry] of Object.entries(raw)) {
      nasCache.set(id, { at: entry.at, files: entry.files ?? [], missing: entry.missing ?? false });
    }
  } catch {
    /* cache illisible : on repart de zéro */
  }
}

function saveNasCache(): void {
  if (!nasCacheDirty) return;
  try {
    const out: Record<string, { at: number; files: NasFile[]; missing: boolean }> = {};
    for (const [id, entry] of nasCache) out[id] = entry;
    writeFileSync(NAS_CACHE_FILE, JSON.stringify(out), "utf8");
    nasCacheDirty = false;
  } catch (err) {
    recordError("cache NAS", err);
  }
}

/** Dossier absent du NAS : pas une erreur réseau, aucune reprise. */
class NasMissingError extends Error {
  constructor(path: string) {
    super(`dossier absent du NAS : ${truncate(path, 120)}`);
    this.name = "NasMissingError";
  }
}

function nasAuthHeaders(): Record<string, string> {
  const out: Record<string, string> = { Accept: "application/json" };
  const id = process.env.NAS_API_CLIENT_ID;
  const secret = process.env.NAS_API_CLIENT_SECRET;
  if (id && secret) {
    out["CF-Access-Client-Id"] = id;
    out["CF-Access-Client-Secret"] = secret;
  }
  const key = process.env.NAS_API_KEY;
  if (key) {
    out["X-Api-Key"] = key;
    out.Authorization = `Bearer ${key}`;
  }
  return out;
}

function naturalFr(a: string, b: string): number {
  return a.localeCompare(b, "fr", { numeric: true });
}

/**
 * `GET <NAS_API_BASE>/list?path=<relPath encodé>` : l'API renvoie un tableau
 * d'URLs absolues `img.` (ou des objets `{ name, path, url, … }`). Seuls les
 * chemins relatifs sont conservés, triés en ordre naturel (`1.png` avant
 * `10.png`). Dimensions inconnues : 1200 × 1800 par défaut, comme ImgChest
 * sans métadonnées.
 */
async function fetchNasListing(nasPath: string): Promise<NasFile[]> {
  const base = nasApiBaseOf();
  if (!base) throw new Error("API du NAS non configurée (NAS_API_BASE).");
  const res = await fetch(`${base}/list?path=${encodeURIComponent(nasPath)}`, {
    headers: { ...nasAuthHeaders(), "User-Agent": "Les-Poroiniens-Reader/2.0 (+https://lesporoiniens.org)" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    // Dossier absent : l'API répond 500 + `ENOENT` (pas de reprise).
    if (/ENOENT|no such file|not found/i.test(text)) throw new NasMissingError(nasPath);
    throw new Error(`le NAS a répondu ${res.status}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("listing NAS illisible (JSON invalide)");
  }
  const raws: unknown[] = Array.isArray(data) ? data : [];
  const out: Array<NasFile & { name: string }> = [];
  for (const raw of raws) {
    let chemin = "";
    let width: number | undefined;
    let height: number | undefined;
    let bytes: number | undefined;
    let hash: string | undefined;
    if (typeof raw === "string") {
      const relative = stripImgBase(raw);
      if (!relative) continue;
      chemin = relative;
    } else if (raw && typeof raw === "object") {
      const row = raw as Record<string, unknown>;
      const candidate =
        stripImgBase(typeof row.url === "string" ? row.url : "") ||
        (typeof row.path === "string" && !/^https?:\/\//i.test(row.path) ? row.path : "");
      if (!candidate) continue;
      chemin = candidate;
      const n = (v: unknown): number | undefined => {
        const parsed = typeof v === "number" ? v : Number(v);
        return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
      };
      width = n(row.width ?? row.w);
      height = n(row.height ?? row.h);
      bytes = n(row.bytes ?? row.size);
      hash = typeof row.hash === "string" && row.hash ? row.hash : undefined;
    } else {
      continue;
    }
    let name = chemin.split("/").pop() ?? chemin;
    try {
      name = decodeURIComponent(name);
    } catch {
      /* nom brut */
    }
    if (!IMAGE_EXT.test(name)) continue;
    try {
      out.push({
        name,
        chemin: assertNasRelPath(chemin, `page NAS ${truncate(nasPath, 80)}`),
        position: out.length + 1,
        width,
        height,
        bytes,
        hash,
      });
    } catch {
      continue;
    }
  }
  out.sort((a, b) => naturalFr(a.name, b.name));
  if (out.length === 0) throw new NasMissingError(nasPath);
  return out.map(({ name: _name, ...file }) => file);
}

/** Cache local (%TEMP%) puis réseau ; `--no-resolve` ne sort jamais du cache. */
async function resolveNas(nasPath: string): Promise<{ files: NasFile[] } | { missing: true } | null> {
  const hit = nasCache.get(nasPath);
  if (hit && Date.now() - hit.at < TTL_CACHE_MS) {
    stats.dossiersNasDepuisCache += 1;
    return hit.missing ? { missing: true } : { files: hit.files };
  }
  if (!RESOLVE) return null;
  try {
    const files = await withRetry(() => fetchNasListing(nasPath), `nas/${truncate(nasPath, 60)}`);
    nasCache.set(nasPath, { at: Date.now(), files, missing: false });
    nasCacheDirty = true;
    stats.dossiersNasResolus += 1;
    return { files };
  } catch (err) {
    if (err instanceof NasMissingError) {
      nasCache.set(nasPath, { at: Date.now(), files: [], missing: true });
      nasCacheDirty = true;
      // Compté par chapitre dans `resolvePages` (un dossier peut être partagé).
      return { missing: true };
    }
    stats.dossiersNasNonResolus += 1;
    recordError(`dossier NAS ${truncate(nasPath, 80)}`, err);
    return null;
  }
}

/* ── Lecture du corpus ───────────────────────────────────────────────────── */

function pickCover(serie: AncienSerie): string {
  /* Certains fichiers anciens portent des objets (ex. `vignette`
     `{ color, text }`) : seules les chaînes sont des URL candidates. */
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const candidates: string[] = [str(serie.cover)];
  const gallery = [...(serie.covers_gallery ?? []), ...(serie.Covers_gallery ?? [])];
  for (const entry of gallery) {
    candidates.push(str(entry?.url_lq));
    candidates.push(str(entry?.url_hq));
  }
  candidates.push(str(serie.vignette));
  candidates.push(str(serie.preview_image));
  for (const candidate of candidates) {
    const url = candidate.trim();
    if (!url || FORBIDDEN.test(url)) continue;
    if (COVER_HOSTS.includes(hostOf(url))) return url;
  }
  return "";
}

/**
 * Couverture NAS du JSON (`cover: https://img.lesporoiniens.org/<chemin>`) :
 * **chemin relatif** stockable, jamais l'URL absolue. Vide si le JSON ne
 * porte aucune couverture `img.` (les file.garden/ImgChest vivantes restent
 * prioritaires via `pickCover()`).
 */
function pickNasCover(serie: AncienSerie): string {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const candidates: string[] = [str(serie.cover)];
  const gallery = [...(serie.covers_gallery ?? []), ...(serie.Covers_gallery ?? [])];
  for (const entry of gallery) {
    candidates.push(str(entry?.url_lq));
    candidates.push(str(entry?.url_hq));
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

function mapStatut(releaseStatus: unknown): "en_cours" | "termine" {
  const value = (typeof releaseStatus === "string" ? releaseStatus : "").trim().toLowerCase();
  return STATUTS_TERMINES.has(value) ? "termine" : "en_cours";
}

function mapType(serie: AncienSerie): "manga" | "manhwa" | "manhua" {
  if (serie.webtoon === true) return "manhwa";
  const magazine = (typeof serie.magazine === "string" ? serie.magazine : "")
    .trim()
    .toLowerCase();
  return KOREAN_MAGAZINES.has(magazine) ? "manhwa" : "manga";
}

function mapClassification(serie: AncienSerie): "all" | "adult" {
  const mangaType = typeof serie.manga_type === "string" ? serie.manga_type : "";
  return mangaType.trim().toLowerCase() === "pornographique" ? "adult" : "all";
}

function extractAlbumId(groups: Record<string, string> | undefined): string {
  for (const path of Object.values(groups ?? {})) {
    const match = path.match(IMGCHEST_CHAPTER) ?? path.match(IMGCHEST_POST);
    if (match && match[1] && IMGCHEST_ID.test(match[1])) return match[1].toLowerCase();
  }
  return "";
}

/**
 * Dossier NAS d'un chapitre (groupes `/proxy/api/les_poro_img/<relPath>`) :
 * partie après le préfixe, **décodée** (`%20` → espace) pour l'appel
 * `NAS_API_BASE/list?path=<relPath encodé>`. Chaîne vide si aucun groupe NAS.
 */
function extractNasRelPath(groups: Record<string, string> | undefined): string {
  for (const path of Object.values(groups ?? {})) {
    const idx = path.search(NAS_PROXY_PREFIX);
    if (idx < 0) continue;
    const encoded = path.slice(idx + "/proxy/api/les_poro_img/".length).replace(/^\/+/, "");
    if (!encoded) continue;
    let relPath = encoded;
    try {
      relPath = decodeURIComponent(encoded);
    } catch {
      /* encodage invalide : on garde la forme brute */
    }
    relPath = relPath.trim().replace(/^\/+/, "");
    // Anti traversal par segment (`..` exact) : les noms à points
    // (« Her Nickname is... ») restent importables.
    if (!relPath || relPath.includes("\\")) continue;
    if (relPath.split("/").some((seg) => seg === ".." || seg === ".")) continue;
    return relPath;
  }
  return "";
}

/**
 * Garde-fou des chemins NAS **relatifs** stockés en base : jamais d'URL
 * absolue (morte ou non), jamais de `..`, jamais de préfixe `/proxy/`.
 * L'encodage `%20` est conservé tel que servi par `img.` (rejeu exact dans
 * `pageUrl()`/`resolveCover()`).
 */
function assertNasRelPath(relPath: string, context: string): string {
  const clean = relPath.trim().replace(/^\/+/, "").split("?")[0];
  if (!clean) throw new Error(`chemin NAS vide (${context})`);
  if (/^https?:\/\//i.test(clean)) {
    throw new Error(`chemin NAS absolu refusé (${context}) : ${truncate(clean, 140)}`);
  }
  if (FORBIDDEN.test(clean) || clean.includes("\\")) {
    throw new Error(`chemin NAS refusé (${context}) : ${truncate(clean, 140)}`);
  }
  // Anti traversal par segment : les noms à points (« Her Nickname is... »)
  // restent stockables, seuls les segments `..` / `.` sont refusés.
  if (clean.split("/").some((seg) => seg === ".." || seg === ".")) {
    throw new Error(`chemin NAS refusé (${context}) : ${truncate(clean, 140)}`);
  }
  return clean;
}

/** Retire le préfixe `IMG_BASE_URL` d'une URL `img.` → chemin relatif stockable. */
function stripImgBase(url: string): string {
  const base = imgBaseOf();
  const clean = url.trim().split("?")[0];
  if (base && clean.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
    return clean.slice(base.length + 1);
  }
  return "";
}

/** `numero` : entier strictement positif **ou décimal** (`8.5`, `10.51`).
 *  Le lecteur accepte tout nombre fini > 0 (`parseNumero` dans
 *  `src/app/serie/[slug]/[n]/page.tsx` et `src/proxy.ts`) et `numero` est
 *  un `double` en base : seules les clés non numériques (`Oneshot`,
 *  `1 en couleur`) sont ignorées, avec rapport. */
function planChapterNumbers(
  keys: string[],
): { keep: Array<{ key: string; numero: number; remapped: boolean }>; skipped: Ignored[] } {
  const keep: Array<{ key: string; numero: number; remapped: boolean }> = [];
  const skipped: Ignored[] = [];
  const taken = new Set<number>();

  const numeric = keys.filter((k) => /^\d+(?:\.\d+)?$/.test(k));
  const others = keys.filter((k) => !/^\d+(?:\.\d+)?$/.test(k));
  // Tri numérique : `8.5` s'intercale entre `8` et `9` (précédent/suivant
  // corrects), et le « 0 » ne peut être renuméroté que si `1` est libre.
  const ordered = numeric.sort((a, b) => Number(a) - Number(b));

  for (const key of ordered) {
    const numero = Number(key);
    if (numero === 0) {
      if (taken.has(1)) {
        skipped.push({
          titre: "chapitre 0",
          detail: "numéro 1 déjà pris, renumérotation impossible",
        });
        continue;
      }
      taken.add(1);
      keep.push({ key, numero: 1, remapped: true });
      continue;
    }
    if (taken.has(numero)) {
      skipped.push({ titre: `chapitre ${key}`, detail: `numéro ${numero} déjà présent` });
      continue;
    }
    taken.add(numero);
    keep.push({ key, numero, remapped: false });
  }
  for (const key of others) {
    skipped.push({
      titre: `chapitre ${key}`,
      detail: "clé non numérique (ni entier ni décimal > 0)",
    });
  }
  return { keep, skipped };
}

interface SeriesBuild {
  plan: SeriesPlan | null;
  ignored?: Ignored;
  skipped: Ignored[];
}

function buildSeries(file: string, raw: AncienSerie, now: Date): SeriesBuild {
  const stem = file.replace(/\.json$/i, "");
  const titre =
    (typeof raw.title === "string" ? raw.title.trim() : "") || stem;
  let slug = slugify(titre);
  if (!slug) slug = slugify(stem);
  const skipped: Ignored[] = [];
  if (!slug) return { plan: null, ignored: { titre, detail: "slug vide" }, skipped };

  /* ── Chapitres : albums ImgChest + dossiers NAS (phase 1) ──────────── */
  const nasConfigured = nasApiBaseOf() !== "";
  const importableKeys: string[] = [];
  const sourceOf = new Map<string, { source: "imgchest" | "nas"; albumId: string; nasPath: string }>();
  for (const [key, chapter] of Object.entries(raw.chapters ?? {})) {
    stats.chapitresTotal += 1;
    const album = extractAlbumId(chapter?.groups);
    if (album) {
      // Priorité ImgChest : un chapitre aux deux sources n'est jamais dupliqué.
      stats.chapitresImgchest += 1;
      importableKeys.push(key);
      sourceOf.set(key, { source: "imgchest", albumId: album, nasPath: "" });
      continue;
    }
    const nasPath = extractNasRelPath(chapter?.groups);
    if (nasPath) {
      stats.chapitresNas += 1;
      if (!nasConfigured) {
        stats.chapitresNasSansApi += 1;
        skipped.push({ titre: `chapitre ${key}`, detail: "source NAS (API non configurée)" });
        continue;
      }
      importableKeys.push(key);
      sourceOf.set(key, { source: "nas", albumId: "", nasPath });
      continue;
    }
    stats.chapitresSansSource += 1;
    skipped.push({ titre: `chapitre ${key}`, detail: "aucun groupe de scan" });
  }

  /* ── Couverture : vivante, sinon NAS (relatif), sinon générée ─────── */
  const cover = pickCover(raw);
  const nasCover = cover ? "" : pickNasCover(raw);
  if (cover) stats.couverturesVivantes += 1;
  else stats.couverturesSansSource += 1;

  if (importableKeys.length === 0 && !cover && !INCLUDE_NO_COVER) {
    return {
      plan: null,
      ignored: { titre, detail: "aucun chapitre importable et aucune couverture vivante" },
      skipped,
    };
  }

  /* ── Numéros ────────────────────────────────────────────────────────── */
  const { keep, skipped: skippedNumbers } = planChapterNumbers(importableKeys);
  for (const skip of skippedNumbers) {
    stats.chapitresIgnoresNumero += 1;
    skipped.push({ titre: skip.titre, detail: skip.detail });
  }

  const chapters: ChapterPlan[] = [];
  for (const entry of keep) {
    const chapter = raw.chapters?.[entry.key] ?? {};
    const src = sourceOf.get(entry.key) ?? { source: "imgchest" as const, albumId: "", nasPath: "" };
    const { iso, ok } = isoFromUnix(chapter.last_updated, now);
    if (!ok) verbose(`   ! chapitre ${entry.key} : last_updated absent → date du jour`);
    if (entry.remapped) stats.chapitresRenumerotes += 1;
    const titreChapitre =
      typeof chapter.title === "string" ? chapter.title.trim() : "";
    /* Équipes de scantrad : clés des groupes **de ce chapitre** (ordre
       stable, sans alias — pas de table). La team est une propriété du
       chapitre, réuploadée avec lui (pastilles de la fiche), pour les deux
       sources (ex. « Cosmea » sur un chapitre NAS). */
    const teams = uniqueStrings(Object.keys(chapter.groups ?? {}))
      .slice(0, 20)
      .map((t) => truncate(t, 64));
    chapters.push({
      serie: titre,
      key: entry.key,
      numero: entry.numero,
      remapped: entry.remapped,
      source: src.source,
      albumId: src.albumId,
      nasPath: src.nasPath,
      titre: titreChapitre || `Chapitre ${entry.numero}`,
      teams,
      volume: parseVolume(chapter.volume),
      publishAt: iso,
      chapterId: "",
      pages: null,
      existing: null,
      row: null,
      pagesSkipped: null,
    });
  }

  /* ── Fiche ──────────────────────────────────────────────────────────── */
  const dates = Object.values(raw.chapters ?? {})
    .map((c) => isoFromUnix(c?.last_updated, now))
    .filter((d) => d.ok)
    .map((d) => d.iso)
    .sort();

  const titresAlt = uniqueStrings(raw.alternative_titles ?? [])
    .slice(0, 20)
    .map((t) => truncate(t, 255));
  const auteurs = uniqueStrings([raw.author, raw.artist]).map((a) => truncate(a, 128));
  const genres: string[] = [];
  const tags: string[] = [];
  for (const tag of uniqueStrings(raw.tags ?? []).slice(0, 60)) {
    const clean = truncate(tag, 64);
    if (GENRES.has(clean.toLowerCase())) genres.push(clean);
    else tags.push(clean);
  }
  const seriesId = rowId(`s-${slug}`);
  /* Couverture : vivante d'abord, sinon NAS relatif du JSON, sinon "" (la
     1re planche du plus petit chapitre comblera à la finalisation). */
  const couverture = cover ? assertCleanUrl(cover, `couverture ${slug}`) : nasCover;
  const row: Record<string, unknown> = {
    slug,
    titre: truncate(titre, 255),
    titresAlt,
    synopsis: (typeof raw.description === "string" ? raw.description : "").trim(),
    couverture,
    banniere: couverture,
    statut: mapStatut(raw.release_status),
    type: mapType(raw),
    langue: "FR",
    classification: mapClassification(raw),
    genres,
    tags,
    auteurs,
    noteMoy: 0,
    nbVotes: 0,
    vues: 0,
    populaire: 0,
    nb_chapitres: chapters.length,
    recherche_alt: truncate(titresAlt.join(" "), 512),
    recherche_auteurs: truncate(auteurs.join(" "), 512),
    created_at: dates[0] ?? now.toISOString(),
    updated_at: dates[dates.length - 1] ?? now.toISOString(),
  };
  const annee = raw.release_year;
  if (Number.isInteger(annee)) row.annee = annee;

  return {
    plan: { file, titre, slug, seriesId, row, chapters, existing: null, duplicate: false },
    skipped,
  };
}

/* ── Plan d'import ───────────────────────────────────────────────────────── */

const seriesPlans: SeriesPlan[] = [];

function buildPlan(): void {
  if (!existsSync(ANCIEN_CORPUS)) {
    console.error(`✖ Corpus introuvable : ${ANCIEN_CORPUS}`);
    process.exit(1);
  }
  const files = readdirSync(ANCIEN_CORPUS)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "fr"));
  const now = new Date();
  stats.fichiers = files.length;

  for (const file of files) {
    let parsed: AncienSerie;
    try {
      parsed = JSON.parse(readFileSync(join(ANCIEN_CORPUS, file), "utf8")) as AncienSerie;
    } catch (err) {
      stats.fichiersEnErreur += 1;
      recordError(`lecture ${file}`, err);
      continue;
    }
    stats.seriesAnalysees += 1;

    if (SERIE_FILTER) {
      const haystack = `${slugify(parsed.title ?? file)} ${file}`.toLowerCase();
      if (!haystack.includes(SERIE_FILTER)) continue;
    }

    try {
      const built = buildSeries(file, parsed, now);
      const label = built.plan?.titre ?? parsed.title ?? file;
      for (const skip of built.skipped) {
        ignoredChapters.push({ titre: `${label} · ${skip.titre}`, detail: skip.detail });
        verbose(`   · ignoré — ${label} · ${skip.titre} (${skip.detail})`);
      }
      if (built.ignored) {
        stats.seriesIgnorees += 1;
        ignoredSeries.push(built.ignored);
        continue;
      }
      if (built.plan) seriesPlans.push(built.plan);
    } catch (err) {
      stats.fichiersEnErreur += 1;
      recordError(`plan ${file}`, err);
    }
  }
}

/* ── Croisement avec l'état de la base (doublons) ────────────────────────── */

const chaptersBySeries = new Map<string, Map<number, AppwriteRow>>();
const pagesByChapter = new Map<string, Map<string, AppwriteRow>>();
const existingSeriesBySlug = new Map<string, AppwriteRow>();

async function loadChapters(seriesId: string): Promise<Map<number, AppwriteRow>> {
  const hit = chaptersBySeries.get(seriesId);
  if (hit) return hit;
  const rows = await listAll("chapters", [Query.equal("series_id", seriesId)]);
  const map = new Map<number, AppwriteRow>();
  for (const row of rows) {
    const numero = Number(row.numero);
    if (Number.isFinite(numero)) map.set(numero, row);
  }
  chaptersBySeries.set(seriesId, map);
  return map;
}

async function loadPages(chapterId: string): Promise<Map<string, AppwriteRow>> {
  const hit = pagesByChapter.get(chapterId);
  if (hit) return hit;
  const rows = await listAll("pages", [Query.equal("chapter_id", chapterId)]);
  const map = new Map<string, AppwriteRow>();
  for (const row of rows) map.set(row.$id, row);
  pagesByChapter.set(chapterId, map);
  return map;
}

async function reconcile(): Promise<void> {
  for (const row of await listAll("series")) {
    const slug = String(row.slug ?? "");
    if (slug) existingSeriesBySlug.set(slug, row);
  }

  for (const plan of seriesPlans) {
    const existing = existingSeriesBySlug.get(plan.slug);
    if (existing) {
      if (String(existing.titre ?? "").trim().toLowerCase() !== plan.titre.trim().toLowerCase()) {
        // Slug pris par une autre œuvre : on ne touche à rien.
        plan.duplicate = true;
        stats.seriesDoublons += 1;
        duplicateSeries.push({
          titre: plan.titre,
          detail: `slug « ${plan.slug} » déjà porté par « ${String(existing.titre ?? "?")} »`,
        });
        continue;
      }
      plan.existing = existing;
      plan.seriesId = existing.$id;
      stats.seriesReutilisees += 1;
    } else {
      stats.seriesACreer += 1;
      if (plan.chapters.length === 0) stats.seriesFicheSeule += 1;
    }

    // La série existe déjà : on regarde quels chapitres sont déjà là.
    const known = existing ? await loadChapters(plan.seriesId) : new Map<number, AppwriteRow>();
    const hasNas = plan.chapters.some((c) => c.source === "nas");
    const hasImgchest = plan.chapters.some((c) => c.source === "imgchest");
    if (hasNas && hasImgchest) stats.seriesMixtes += 1;
    else if (hasNas) stats.seriesNasSeul += 1;
    for (const chapter of plan.chapters) {
      chapter.chapterId = rowId(`${plan.seriesId}-c${chapter.numero}`);
      const row = known.get(chapter.numero);
      if (!row) continue;
      if (String(row.source ?? "") !== chapter.source) {
        stats.chapitresIgnoresAutreSource += 1;
        ignoredChapters.push({
          titre: `${plan.titre} · chapitre ${chapter.numero}`,
          detail: `déjà en base avec une autre source (${String(row.source ?? "?")})`,
        });
        chapter.pagesSkipped = "chapitre déjà présent avec une autre source";
        continue;
      }
      chapter.existing = row;
      chapter.chapterId = row.$id;
      stats.chapitresExistants += 1;
    }
  }
}

/* ── Résolution des albums puis construction des lignes ──────────────────── */

async function resolvePages(): Promise<void> {
  const imgchest: ChapterPlan[] = [];
  const nas: ChapterPlan[] = [];
  for (const plan of seriesPlans) {
    if (plan.duplicate) continue;
    for (const chapter of plan.chapters) {
      (chapter.source === "nas" ? nas : imgchest).push(chapter);
    }
  }

  await runPool(imgchest, CONCURRENCE_ALBUMS, async (chapter) => {
    const files = await resolveAlbum(chapter.albumId);
    if (!files) {
      stats.chapitresNonResolus += 1;
      return;
    }
    chapter.pages = files.map((file, index) => ({
      id: rowId(chapter.chapterId, `p${index}`),
      chapter_id: chapter.chapterId,
      ordre: index,
      chemin: assertCleanUrl(file.url, `page ${chapter.chapterId}#${index}`),
      largeur: file.width ?? 1200,
      hauteur: file.height ?? 1800,
      bytes: file.bytes ?? 0,
      hash: truncate(file.hash ?? "", 64),
    }));
  });

  await runPool(nas, CONCURRENCE_NAS, async (chapter) => {
    const resolved = await resolveNas(chapter.nasPath);
    if (!resolved) {
      stats.chapitresNonResolus += 1;
      return;
    }
    if ("missing" in resolved) {
      stats.chapitresNasDossierAbsent += 1;
      return;
    }
    chapter.pages = resolved.files.map((file, index) => ({
      id: rowId(chapter.chapterId, `p${index}`),
      chapter_id: chapter.chapterId,
      ordre: index,
      // Chemin relatif : `pageUrl()` le préfixe par `IMG_BASE_URL` (§7.1).
      chemin: file.chemin,
      largeur: file.width ?? 1200,
      hauteur: file.height ?? 1800,
      bytes: file.bytes ?? 0,
      hash: truncate(file.hash ?? "", 64),
    }));
  });
}

/** Une fois les albums résolus : ligne de chapitre + totaux détaillés. */
async function finalizeAndCount(createdBy: string): Promise<void> {
  for (const plan of seriesPlans) {
    if (plan.duplicate) continue;

    /* Couverture auto : ni vivante ni NAS, mais des chapitres résolus
       (les deux sources) → 1re planche du chapitre au plus petit numéro
       (même règle que `scripts/backfill-series.mts` pour les séries déjà en
       base ; les lignes existantes ne sont jamais réécrites ici). */
    if (!plan.row.couverture) {
      const WithPages = plan.chapters
        .filter((c) => c.pages && c.pages.length > 0)
        .sort((a, b) => a.numero - b.numero);
      const first = WithPages[0]?.pages?.[0];
      if (first) {
        plan.row.couverture = first.chemin;
        plan.row.banniere = first.chemin;
        stats.couverturesAuto += 1;
      }
    }

    for (const chapter of plan.chapters) {
      if (!chapter.pages) continue; // album non résolu : rien à écrire

      chapter.row = {
        series_id: plan.seriesId,
        numero: chapter.numero,
        titre: chapter.titre,
        statut: "published",
        publish_at: chapter.publishAt,
        source: chapter.source,
        teams: chapter.teams,
        nb_pages: chapter.pages.length,
        likes: 0,
        classification: String(plan.row.classification ?? "all"),
        series_type: String(plan.row.type ?? "manga"),
        vues: 0,
        created_by: createdBy,
        created_at: chapter.publishAt,
      };
      if (chapter.volume !== null) chapter.row.volume = chapter.volume;
      if ((chapter.teams ?? []).length > 0) stats.chaptersAvecTeams += 1;

      if (!chapter.existing) {
        stats.chapitresACreer += 1;
        stats.pagesACreer += chapter.pages.length;
        continue;
      }

      /* Chapitre déjà en base : on ne complète ses pages que si son
         décompte correspond à l'album résolu (sinon c'est un import du
         Gérant depuis un autre album : on ne touche à rien). */
      const declared = Number(chapter.existing.nb_pages ?? -1);
      if (declared !== chapter.pages.length) {
        chapter.pagesSkipped = `chapitre déjà importé avec ${declared} pages (album différent ?)`;
        continue;
      }
      const existingPages = await loadPages(chapter.chapterId);
      for (const page of chapter.pages) {
        if (existingPages.has(page.id)) stats.pagesExistantes += 1;
        else stats.pagesACreer += 1;
      }
    }
  }
}

/* ── Rapport ─────────────────────────────────────────────────────────────── */

function printReport(createdBy: string): void {
  const bar = "─".repeat(68);
  const nonResolus = ignoredChapters.filter(
    (c) =>
      !c.detail.startsWith("source NAS") &&
      !c.detail.startsWith("aucun groupe") &&
      !c.detail.startsWith("déjà en base"),
  );
  const chapitresIgnores =
    stats.chapitresNasSansApi +
    stats.chapitresNasDossierAbsent +
    stats.chapitresSansSource +
    stats.chapitresIgnoresNumero +
    stats.chapitresIgnoresAutreSource;

  console.log("");
  console.log(bar);
  console.log(APPLY ? "RAPPORT D'IMPORT — mode --apply" : "DRY-RUN — aucune écriture");
  console.log(bar);
  console.log(`Corpus               : ${ANCIEN_CORPUS}`);
  console.log(`Fichiers lus         : ${stats.fichiers} (${stats.fichiersEnErreur} en erreur)`);
  console.log(`Séries analysées     : ${stats.seriesAnalysees}`);
  console.log(
    `Séries NAS seul / mixtes : ${stats.seriesNasSeul} / ${stats.seriesMixtes}`,
  );
  console.log(
    `Chapitres au corpus  : ${stats.chapitresTotal} — ImgChest ${stats.chapitresImgchest} · NAS ${stats.chapitresNas} · sans source ${stats.chapitresSansSource}`,
  );
  console.log(
    `Albums ImgChest      : cache ${stats.albumsDepuisCache} · réseau ${stats.albumsResolus} · non résolus ${stats.albumsNonResolus}`,
  );
  console.log(
    `Dossiers NAS         : cache ${stats.dossiersNasDepuisCache} · réseau ${stats.dossiersNasResolus} · non résolus ${stats.dossiersNasNonResolus}`,
  );
  console.log(
    `Couvertures vivantes : ${stats.couverturesVivantes} · sans couverture vivante : ${stats.couverturesSansSource} · auto (1re planche) : ${stats.couverturesAuto}`,
  );
  console.log(`Chapitres avec teams   : ${stats.chaptersAvecTeams}`);
  console.log("");
  console.log("SÉRIES");
  console.log(`  à créer             : ${stats.seriesACreer} (dont ${stats.seriesFicheSeule} fiche seule, 0 chapitre)`);
  console.log(`  déjà en base (réutil.) : ${stats.seriesReutilisees}`);
  console.log(`  doublons de slug     : ${stats.seriesDoublons}`);
  console.log(`  ignorées            : ${stats.seriesIgnorees}`);
  list(
    "Séries ignorées :",
    ignoredSeries.map((s) => `${s.titre} — ${s.detail}`),
  );
  list(
    "Doublons de slug :",
    duplicateSeries.map((s) => `${s.titre} — ${s.detail}`),
  );
  console.log("");
  console.log("CHAPITRES");
  console.log(`  à créer             : ${stats.chapitresACreer}`);
  console.log(`  déjà en base        : ${stats.chapitresExistants}`);
  console.log(`  ignorés             : ${chapitresIgnores}`);
  console.log(`      · NAS sans API            : ${stats.chapitresNasSansApi}`);
  console.log(`      · dossier NAS absent      : ${stats.chapitresNasDossierAbsent}`);
  console.log(`      · aucune source           : ${stats.chapitresSansSource}`);
  console.log(`      · numéro refusé/non numérique: ${stats.chapitresIgnoresNumero}`);
  console.log(`      · déjà en base, autre src. : ${stats.chapitresIgnoresAutreSource}`);
  console.log(`  renumérotés 0 → 1   : ${stats.chapitresRenumerotes}`);
  console.log(`  non résolu (réseau) : ${stats.chapitresNonResolus}`);
  list(
    "Chapitres ignorés (hors NAS / sans source) :",
    nonResolus.map((c) => `${c.titre} — ${c.detail}`),
    15,
  );
  console.log("");
  console.log("PAGES");
  console.log(`  à créer             : ${stats.pagesACreer}`);
  console.log(`  déjà en base        : ${stats.pagesExistantes}`);
  const pagesLeftAlone: string[] = [];
  for (const plan of seriesPlans) {
    for (const chapter of plan.chapters) {
      if (chapter.pagesSkipped) {
        pagesLeftAlone.push(`${plan.titre} · chapitre ${chapter.numero} — ${chapter.pagesSkipped}`);
      }
    }
  }
  list("Pages laissées telles quelles :", pagesLeftAlone, 15);
  console.log("");
  console.log(`COMPTES : created_by = ${createdBy} (APPWRITE_OWNER_EMAIL, sinon graine)`);
  console.log(`ERREURS (${errors.length})`);
  for (const err of errors) console.log(`  ✖ ${err}`);
  if (errors.length === 0) console.log("  aucune");
  console.log(bar);
}

/* ── Écriture (`--apply` uniquement) ─────────────────────────────────────── */

async function apply(): Promise<void> {
  const write = { series: 0, seriesSkip: 0, chapters: 0, chaptersSkip: 0, pages: 0, pagesSkip: 0 };
  const seriesToCreate = seriesPlans.filter((p) => !p.duplicate && !p.existing);

  console.log(
    `\n▶ Écriture Appwrite : ${seriesToCreate.length} séries, ${stats.chapitresACreer} chapitres, ${stats.pagesACreer} pages (concurrence ${CONCURRENCE})`,
  );

  await runPool(seriesToCreate, CONCURRENCE, async (plan) => {
    try {
      const result = await createRow("series", plan.seriesId, plan.row);
      if (result === "cree") write.series += 1;
      else write.seriesSkip += 1;
    } catch (err) {
      recordError(`series/${plan.slug}`, err);
    }
  });
  console.log(`  ✔ séries    : ${write.series} créées, ${write.seriesSkip} déjà présentes`);

  const chaptersToCreate: ChapterPlan[] = [];
  const pagesToCreate: PagePlan[] = [];
  for (const plan of seriesPlans) {
    if (plan.duplicate) continue;
    for (const chapter of plan.chapters) {
      if (!chapter.row || !chapter.pages) continue;
      if (!chapter.existing) {
        chaptersToCreate.push(chapter);
        pagesToCreate.push(...chapter.pages);
      } else if (!chapter.pagesSkipped) {
        // reprise : seules les pages manquantes du chapitre sont créées
        const existingPages = pagesByChapter.get(chapter.chapterId);
        for (const page of chapter.pages) {
          if (!existingPages?.has(page.id)) pagesToCreate.push(page);
        }
      }
    }
  }

  await runPool(chaptersToCreate, CONCURRENCE, async (chapter) => {
    try {
      const result = await createRow("chapters", chapter.chapterId, chapter.row ?? {});
      if (result === "cree") write.chapters += 1;
      else write.chaptersSkip += 1;
    } catch (err) {
      recordError(`chapters/${chapter.chapterId}`, err);
    }
  });
  console.log(`  ✔ chapitres : ${write.chapters} créés, ${write.chaptersSkip} déjà présents`);

  await runPool(pagesToCreate, CONCURRENCE, async (page) => {
    try {
      // l'id est passé à part (rowId), jamais comme attribut de la ligne
      const { id, ...data } = page;
      const result = await createRow("pages", id, data);
      if (result === "cree") write.pages += 1;
      else write.pagesSkip += 1;
    } catch (err) {
      recordError(`pages/${page.id}`, err);
    }
  });
  console.log(`  ✔ pages     : ${write.pages} créées, ${write.pagesSkip} déjà présentes`);

  console.log("\nRésumé de l'écriture :");
  console.log(`  series   : ${write.series} créées / ${write.seriesSkip} déjà présentes`);
  console.log(`  chapters : ${write.chapters} créés / ${write.chaptersSkip} déjà présents`);
  console.log(`  pages    : ${write.pages} créées / ${write.pagesSkip} déjà présentes`);
  console.log(`  erreurs  : ${errors.length}`);
  console.log("  (les caches du site expirent en 30–60 s : aucune purge nécessaire)");
}

/* ── Main ────────────────────────────────────────────────────────────────── */

/** Compte Gérant : `created_by` référence un compte existant, jamais créé ici. */
async function resolveCreatedBy(): Promise<string> {
  const email = process.env.APPWRITE_OWNER_EMAIL;
  if (!email) return "user-owner";
  try {
    const users = new Users(client);
    const res = await withRetry(
      () => users.list({ queries: [Query.equal("email", email)] }),
      "users.list",
    );
    return res.users[0]?.$id ?? "user-owner";
  } catch {
    return "user-owner";
  }
}

async function main(): Promise<void> {
  console.log(
    APPLY
      ? "▶ Mode --apply : écriture Appwrite AUTORISÉE."
      : "▶ Dry-run : aucune écriture (flag --apply absent).",
  );
  console.log(`▶ Corpus : ${ANCIEN_CORPUS}`);

  loadCache();
  loadNasCache();
  buildPlan();
  console.log(`▶ ${seriesPlans.length} séries retenues après filtre éditorial.`);

  await reconcile();
  const createdBy = await resolveCreatedBy();
  await resolvePages();
  await finalizeAndCount(createdBy);
  saveCache();
  saveNasCache();

  printReport(createdBy);

  if (!APPLY) {
    console.log("");
    console.log("Dry-run terminé : rien n'a été écrit dans Appwrite.");
    console.log("Pour écrire : npx tsx scripts/import-ancien.mts --apply");
    return;
  }

  await apply();
}

main().catch((err) => {
  console.error("✖ échec de l'import :", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
