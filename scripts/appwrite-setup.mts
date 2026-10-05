/**
 * Provisioning de l'instance Appwrite auto-hébergée (Appwrite 1.8 — API TablesDB).
 *
 *   npx tsx scripts/appwrite-setup.mts
 *
 * Crée (de façon idempotente) : la base, les tables, les colonnes, les index
 * décrits au §13 du cahier des charges, le bucket d'avatars, et — optionnellement
 * — le profil « Gérant » du compte désigné par APPWRITE_OWNER_EMAIL.
 *
 * Variables lues dans .env.local / l'environnement :
 *   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY (obligatoires)
 *   APPWRITE_DATABASE_ID (défaut : poroiniens)
 *   APPWRITE_OWNER_EMAIL (optionnel : promeut ce compte en Gérant, le crée s'il
 *                         manque — mot de passe APPWRITE_OWNER_PASSWORD, défaut demo1234)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  Client,
  Databases,
  Storage,
  TablesDB,
  Users,
  ID,
  Query,
  TablesDBIndexType,
  OrderBy,
  type Models,
} from "node-appwrite";

/* ── Environnement (.env.local lu manuellement, hors Next) ────────────── */

const envFile = resolve(process.cwd(), ".env.local");
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
    "✖ Renseignez APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID et APPWRITE_API_KEY (créée dans le dashboard Appwrite, scopes : rows.read, rows.write, documents.read, documents.write, tables.read, tables.write, collections.read, collections.write, databases.read, databases.write, users.read, users.write, buckets.read, buckets.write, files.read, files.write).",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const db = new TablesDB(client);
const databases = new Databases(client);
const users = new Users(client);

/* ── Schéma ───────────────────────────────────────────────────────────── */

type Col = {
  key: string;
  type: "varchar" | "string" | "text" | "longtext" | "integer" | "double" | "boolean" | "enum";
  size?: number;
  elements?: string[];
  def?: string | number | boolean;
  array?: boolean;
};

type Idx = {
  key: string;
  type: "key" | "fulltext" | "unique";
  columns: string[];
  orders?: ("asc" | "desc")[];
};

type Table = { id: string; name: string; columns: Col[]; indexes?: Idx[] };

const DATE = { type: "varchar" as const, size: 35 };
const ID64 = { type: "varchar" as const, size: 64 };

const TABLES: Table[] = [
  {
    id: "series",
    name: "Séries",
    columns: [
      { key: "slug", type: "varchar", size: 128 },
      { key: "titre", type: "varchar", size: 255 },
      { key: "titresAlt", type: "string", size: 255, array: true },
      { key: "synopsis", type: "longtext" },
      { key: "couverture", type: "varchar", size: 512 },
      { key: "banniere", type: "varchar", size: 512 },
      { key: "statut", type: "enum", elements: ["en_cours", "termine", "hiatus", "abandonne"] },
      { key: "type", type: "enum", elements: ["manga", "manhwa", "manhua"] },
      { key: "annee", type: "integer" },
      { key: "langue", type: "varchar", size: 16, def: "FR" },
      { key: "classification", type: "enum", elements: ["all", "adult"], def: "all" },
      { key: "genres", type: "string", size: 64, array: true },
      { key: "tags", type: "string", size: 64, array: true },
      { key: "auteurs", type: "string", size: 128, array: true },
      { key: "noteMoy", type: "double", def: 0 },
      { key: "nbVotes", type: "integer", def: 0 },
      { key: "vues", type: "integer", def: 0 },
      { key: "populaire", type: "integer", def: 0 },
      // Compteur dénormalisé (§6.3) : alimenté à la création/suppression d'un
      // chapitre, il permet de filtrer « One-shot » sans jointure.
      { key: "nb_chapitres", type: "integer", def: 0 },
      // Texte de recherche concaténé (§6.4) : `Query.search()` refuse les
      // colonnes array (`titresAlt`, `auteurs`), on indexe donc leur copie
      // en chaîne dans un index fulltext dédié.
      { key: "recherche_alt", type: "varchar", size: 512 },
      { key: "recherche_auteurs", type: "varchar", size: 512 },
      { key: "created_at", ...DATE },
      { key: "updated_at", ...DATE },
    ],
    indexes: [
      { key: "idx_slug", type: "unique", columns: ["slug"] },
      { key: "idx_titre", type: "fulltext", columns: ["titre"] },
      // `Query.search()` exige un index fulltext : un index unique ne suffit
      // pas, d'où cet index dédié pour la recherche par slug.
      { key: "idx_slug_ft", type: "fulltext", columns: ["slug"] },
      { key: "idx_alt_ft", type: "fulltext", columns: ["recherche_alt"] },
      { key: "idx_auteurs_ft", type: "fulltext", columns: ["recherche_auteurs"] },
      { key: "idx_statut", type: "key", columns: ["statut"] },
      { key: "idx_type", type: "key", columns: ["type"] },
      { key: "idx_class", type: "key", columns: ["classification"] },
      // Pas d'index sur `genres`/`tags` (colonnes array) : Appwrite refuse
      // « Creating indexes on array attributes is not currently supported ».
      // Le filtrage par genre se fait sans index (effectif réduit).
      { key: "idx_populaire", type: "key", columns: ["populaire"], orders: ["desc"] },
      { key: "idx_note", type: "key", columns: ["noteMoy"], orders: ["desc"] },
      { key: "idx_vues", type: "key", columns: ["vues"], orders: ["desc"] },
      { key: "idx_created", type: "key", columns: ["created_at"], orders: ["desc"] },
      { key: "idx_updated", type: "key", columns: ["updated_at"], orders: ["desc"] },
    ],
  },
  {
    id: "chapters",
    name: "Chapitres",
    columns: [
      { key: "series_id", ...ID64 },
      { key: "numero", type: "integer" },
      { key: "volume", type: "integer" },
      { key: "titre", type: "varchar", size: 255 },
      { key: "statut", type: "enum", elements: ["draft", "scheduled", "published"] },
      { key: "publish_at", ...DATE },
      { key: "source", type: "enum", elements: ["nas", "imgchest"], def: "nas" },
      { key: "nb_pages", type: "integer", def: 0 },
      { key: "likes", type: "integer", def: 0 },
      { key: "classification", type: "enum", elements: ["all", "adult"], def: "all" },
      // Format d'origine de la série (manga/manhwa/manhua), dénormalisé pour
      // filtrer les sorties sans jointure — Appwrite TablesDB n'en opère pas (§6.1)
      { key: "series_type", type: "enum", elements: ["manga", "manhwa", "manhua"], def: "manga" },
      { key: "vues", type: "integer", def: 0 },
      { key: "created_by", ...ID64 },
      { key: "created_at", ...DATE },
    ],
    indexes: [
      { key: "idx_series_numero", type: "key", columns: ["series_id", "numero"] },
      { key: "idx_statut", type: "key", columns: ["statut"] },
      { key: "idx_publish", type: "key", columns: ["publish_at"], orders: ["desc"] },
      // filtres « Dernières sorties » par format (§6.1)
      { key: "idx_type_publish", type: "key", columns: ["series_type", "publish_at"], orders: ["asc", "desc"] },
      // requis par SEARCH_FIELDS.chapters (recherche plein texte)
      { key: "idx_titre_ft", type: "fulltext", columns: ["titre"] },
    ],
  },
  {
    id: "pages",
    name: "Pages",
    columns: [
      { key: "chapter_id", ...ID64 },
      // `index` est un mot réservé SQL : stocké sous `ordre` (mapping dans src/lib/db/appwrite.ts)
      { key: "ordre", type: "integer" },
      // Chemin **relatif** au CDN : `${IMG_BASE_URL}/${chemin}?v=${hash}` (§5.2)
      { key: "chemin", type: "varchar", size: 512 },
      { key: "largeur", type: "integer" },
      { key: "hauteur", type: "integer" },
      { key: "bytes", type: "integer", def: 0 },
      { key: "hash", type: "varchar", size: 64 },
    ],
    indexes: [{ key: "idx_chapter_ordre", type: "key", columns: ["chapter_id", "ordre"] }],
  },
  {
    id: "profiles",
    name: "Profils",
    columns: [
      { key: "user_id", ...ID64 },
      { key: "pseudo", type: "varchar", size: 24 },
      { key: "avatar", type: "varchar", size: 512 },
      { key: "bio", type: "varchar", size: 1000 },
      {
        key: "role",
        type: "enum",
        elements: ["visiteur", "membre", "modo", "admin", "owner"],
        def: "membre",
      },
      { key: "date_inscription", ...DATE },
      { key: "adult_ok", type: "boolean", def: false },
      { key: "adult_ok_at", ...DATE },
      { key: "confidentialite", type: "longtext" },
      { key: "preferences", type: "longtext" },
      { key: "banni", type: "boolean", def: false },
    ],
    indexes: [
      { key: "idx_pseudo", type: "unique", columns: ["pseudo"] },
      // requis par SEARCH_FIELDS.profiles (recherche plein texte)
      { key: "idx_pseudo_ft", type: "fulltext", columns: ["pseudo"] },
      { key: "idx_role", type: "key", columns: ["role"] },
      { key: "idx_user", type: "key", columns: ["user_id"] },
    ],
  },
  {
    id: "library",
    name: "Bibliothèque",
    columns: [
      { key: "user_id", ...ID64 },
      { key: "series_id", ...ID64 },
      {
        key: "statut",
        type: "enum",
        elements: ["en_cours", "a_lire", "termine", "en_pause", "abandonne"],
      },
      { key: "favori", type: "boolean", def: false },
      { key: "note", type: "integer" },
      { key: "last_chapter_id", ...ID64 },
      { key: "last_page", type: "integer", def: 0 },
      { key: "updated_at", ...DATE },
    ],
    indexes: [
      { key: "idx_user_series", type: "unique", columns: ["user_id", "series_id"] },
      { key: "idx_series", type: "key", columns: ["series_id"] },
      { key: "idx_updated", type: "key", columns: ["updated_at"], orders: ["desc"] },
    ],
  },
  {
    id: "reading_history",
    name: "Historique",
    columns: [
      { key: "user_id", ...ID64 },
      { key: "chapter_id", ...ID64 },
      { key: "series_id", ...ID64 },
      { key: "page", type: "integer", def: 0 },
      { key: "completed", type: "boolean", def: false },
      { key: "read_at", ...DATE },
    ],
    indexes: [
      { key: "idx_user_chapter", type: "unique", columns: ["user_id", "chapter_id"] },
      { key: "idx_read", type: "key", columns: ["read_at"], orders: ["desc"] },
    ],
  },
  {
    id: "comments",
    name: "Commentaires",
    columns: [
      { key: "target_type", type: "enum", elements: ["series", "chapter"] },
      { key: "target_id", ...ID64 },
      { key: "parent_id", ...ID64 },
      { key: "user_id", ...ID64 },
      { key: "pseudo", type: "varchar", size: 24 },
      { key: "contenu", type: "text" },
      { key: "spoiler", type: "boolean", def: false },
      { key: "likes", type: "integer", def: 0 },
      { key: "dislikes", type: "integer", def: 0 },
      {
        key: "statut",
        type: "enum",
        elements: ["visible", "masque", "supprime"],
        def: "visible",
      },
      { key: "created_at", ...DATE },
      { key: "updated_at", ...DATE },
    ],
    indexes: [
      { key: "idx_target", type: "key", columns: ["target_type", "target_id"] },
      { key: "idx_user", type: "key", columns: ["user_id"] },
      { key: "idx_created", type: "key", columns: ["created_at"], orders: ["desc"] },
    ],
  },
  {
    id: "comment_likes",
    name: "Likes de commentaires",
    columns: [
      { key: "user_id", ...ID64 },
      { key: "target_id", ...ID64 },
      { key: "created_at", ...DATE },
    ],
    indexes: [
      { key: "idx_unique", type: "unique", columns: ["user_id", "target_id"] },
      { key: "idx_target", type: "key", columns: ["target_id"] },
    ],
  },
  {
    id: "chapter_likes",
    name: "Likes de chapitres",
    columns: [
      { key: "user_id", ...ID64 },
      { key: "chapter_id", ...ID64 },
      { key: "created_at", ...DATE },
    ],
    indexes: [
      { key: "idx_unique", type: "unique", columns: ["user_id", "chapter_id"] },
      { key: "idx_chapter", type: "key", columns: ["chapter_id"] },
    ],
  },
  {
    id: "reports",
    name: "Signalements",
    columns: [
      { key: "type", type: "enum", elements: ["comment", "chapter", "series"] },
      { key: "target_id", ...ID64 },
      { key: "reporter_id", ...ID64 },
      { key: "raison", type: "varchar", size: 64 },
      { key: "details", type: "text" },
      { key: "statut", type: "enum", elements: ["ouvert", "traite", "rejete"], def: "ouvert" },
      { key: "handled_by", ...ID64 },
      { key: "created_at", ...DATE },
    ],
    indexes: [
      { key: "idx_statut", type: "key", columns: ["statut"] },
      { key: "idx_created", type: "key", columns: ["created_at"], orders: ["desc"] },
    ],
  },
  {
    id: "recommendations",
    name: "Recommandations",
    columns: [
      { key: "placement", type: "enum", elements: ["home", "series", "end_chapter"] },
      { key: "titre", type: "varchar", size: 128 },
      { key: "series_id", ...ID64 },
      { key: "ordre", type: "integer", def: 0 },
      { key: "debut", ...DATE },
      { key: "fin", ...DATE },
      { key: "actif", type: "boolean", def: true },
      { key: "created_at", ...DATE },
    ],
    indexes: [
      { key: "idx_placement", type: "key", columns: ["placement", "actif"] },
      { key: "idx_ordre", type: "key", columns: ["ordre"] },
    ],
  },
  {
    id: "notifications",
    name: "Notifications",
    columns: [
      { key: "user_id", ...ID64 },
      { key: "type", type: "enum", elements: ["chapter", "mention", "system"] },
      { key: "payload", type: "longtext" },
      { key: "lu", type: "boolean", def: false },
      { key: "created_at", ...DATE },
    ],
    indexes: [
      { key: "idx_user_lu", type: "key", columns: ["user_id", "lu"] },
      { key: "idx_created", type: "key", columns: ["created_at"], orders: ["desc"] },
    ],
  },
  {
    id: "audit_log",
    name: "Journal d'audit",
    columns: [
      { key: "actor_id", ...ID64 },
      { key: "actor_pseudo", type: "varchar", size: 24 },
      { key: "action", type: "varchar", size: 64 },
      { key: "cible", type: "varchar", size: 128 },
      { key: "avant", type: "longtext" },
      { key: "apres", type: "longtext" },
      { key: "ip", type: "varchar", size: 45 },
      { key: "created_at", ...DATE },
    ],
    indexes: [
      { key: "idx_created", type: "key", columns: ["created_at"], orders: ["desc"] },
      { key: "idx_actor", type: "key", columns: ["actor_id"] },
    ],
  },
  {
    id: "site_settings",
    name: "Paramètres du site",
    columns: [
      { key: "cle", type: "varchar", size: 64 },
      { key: "valeur", type: "longtext" },
    ],
    indexes: [{ key: "idx_cle", type: "unique", columns: ["cle"] }],
  },
  {
    // Annonces de l'équipe (§6.11) : liste datée + page de détail, dernière
    // annonce mise en avant sur l'accueil. Table créée uniquement si besoin.
    id: "annonces",
    name: "Annonces",
    columns: [
      { key: "slug", type: "varchar", size: 128 },
      { key: "titre", type: "varchar", size: 255 },
      { key: "extrait", type: "varchar", size: 500 },
      { key: "contenu", type: "longtext" },
      { key: "auteur", type: "varchar", size: 64, def: "L'équipe" },
      { key: "date", ...DATE },
      { key: "created_at", ...DATE },
      { key: "updated_at", ...DATE },
    ],
    indexes: [
      { key: "idx_slug", type: "unique", columns: ["slug"] },
      { key: "idx_date", type: "key", columns: ["date"], orders: ["desc"] },
    ],
  },
  {
    id: "import_jobs",
    name: "Jobs d'import",
    columns: [
      { key: "type", type: "enum", elements: ["upload", "nas", "drive", "batch", "imgchest"] },
      {
        key: "statut",
        type: "enum",
        elements: ["attente", "cours", "termine", "erreur"],
        def: "attente",
      },
      { key: "progression", type: "integer", def: 0 },
      { key: "message", type: "longtext" },
      { key: "erreurs", type: "string", size: 255, array: true },
      { key: "created_by", ...ID64 },
      { key: "created_at", ...DATE },
    ],
    indexes: [
      { key: "idx_statut", type: "key", columns: ["statut"] },
      { key: "idx_created", type: "key", columns: ["created_at"], orders: ["desc"] },
    ],
  },
  {
    id: "image_errors",
    name: "Erreurs d'images",
    columns: [
      { key: "day", type: "varchar", size: 10 },
      { key: "chapter_id", ...ID64 },
      { key: "page_index", type: "integer" },
      { key: "count", type: "integer", def: 0 },
      { key: "updated_at", ...DATE },
    ],
    indexes: [
      { key: "idx_day", type: "key", columns: ["day"] },
      { key: "idx_chapter", type: "key", columns: ["chapter_id"] },
    ],
  },
];

/* ── Utilitaires ──────────────────────────────────────────────────────── */

const errors: string[] = [];

function ignoreExists(err: unknown): boolean {
  const e = err as { code?: number; status?: number; type?: string };
  return e?.code === 409 || e?.status === 409 || e?.type === "general_already_exists";
}

function report(err: unknown, context: string): void {
  const e = err as { code?: number; message?: string };
  if (ignoreExists(err)) return;
  errors.push(`${context} : ${e?.code ?? "?"} ${e?.message ?? String(err)}`);
}

async function ensureTable(t: Table): Promise<void> {
  const columns = t.columns.map((c) => ({
    key: c.key,
    type: c.type,
    size: c.size,
    required: false,
    default: c.def,
    array: c.array,
    elements: c.elements,
  }));
  const indexes = (t.indexes ?? []).map((i) => ({
    key: i.key,
    type: i.type as unknown as TablesDBIndexType,
    attributes: i.columns,
    orders: i.orders?.map((o) => o.toUpperCase()) as unknown as OrderBy[] | undefined,
  }));

  try {
    await db.createTable({
      databaseId: DB_ID,
      tableId: t.id,
      name: t.name,
      rowSecurity: false, // l'accès est contrôlé côté serveur (jamais par le client)
      columns,
      indexes,
    });
    console.log(`  ✔ table ${t.id} (${t.columns.length} colonnes)`);
    return;
  } catch (err) {
    if (!ignoreExists(err)) {
      report(err, `createTable ${t.id}`);
      return;
    }
  }

  // Table déjà présente : on ajoute ce qui manque.
  let existing: Models.ColumnList | null = null;
  try {
    existing = await db.listColumns({ databaseId: DB_ID, tableId: t.id, queries: [Query.limit(200)] });
  } catch (err) {
    report(err, `listColumns ${t.id}`);
  }
  const have = new Set(existing?.columns.map((c) => c.key) ?? []);
  for (const c of t.columns) {
    if (have.has(c.key)) continue;
    try {
      await createColumn(t.id, c);
      console.log(`  ✔ colonne ${t.id}.${c.key}`);
    } catch (err) {
      report(err, `colonne ${t.id}.${c.key}`);
    }
  }
  // Énumérations déjà en place : on complète les valeurs manquantes
  // (ajout d'une source ImgChest, d'un type d'import…). Rien n'est retiré.
  for (const c of t.columns) {
    if (c.type !== "enum" || !c.elements) continue;
    const current = existing?.columns.find((col) => col.key === c.key) as
      | Models.ColumnEnum
      | undefined;
    const have = Array.isArray(current?.elements) ? current.elements : null;
    if (!have) continue;
    const missing = c.elements.filter((value) => !have.includes(value));
    if (missing.length === 0) continue;
    try {
      await db.updateEnumColumn({
        databaseId: DB_ID,
        tableId: t.id,
        key: c.key,
        elements: c.elements,
        required: Boolean(current?.required),
        xdefault: current?.default,
      });
      console.log(`  ✔ énumération ${t.id}.${c.key} (+${missing.join(", ")})`);
    } catch (err) {
      report(err, `enum ${t.id}.${c.key}`);
    }
  }
  let existingIdx: Models.ColumnIndexList | null = null;
  try {
    existingIdx = await db.listIndexes({ databaseId: DB_ID, tableId: t.id, queries: [Query.limit(200)] });
  } catch (err) {
    report(err, `listIndexes ${t.id}`);
  }
  const haveIdx = new Set(existingIdx?.indexes.map((i) => i.key) ?? []);
  for (const i of t.indexes ?? []) {
    if (haveIdx.has(i.key)) continue;
    try {
      await db.createIndex({
        databaseId: DB_ID,
        tableId: t.id,
        key: i.key,
        type: i.type as unknown as TablesDBIndexType,
        columns: i.columns,
        orders: i.orders?.map((o) => o.toUpperCase()) as unknown as OrderBy[] | undefined,
      });
      console.log(`  ✔ index ${t.id}.${i.key}`);
    } catch (err) {
      report(err, `index ${t.id}.${i.key}`);
    }
  }
}

async function createColumn(tableId: string, c: Col): Promise<unknown> {
  const base = { databaseId: DB_ID, tableId, key: c.key, required: false };
  switch (c.type) {
    case "varchar":
      return db.createVarcharColumn({ ...base, size: c.size ?? 255, xdefault: c.def as string, array: c.array });
    case "string":
      return db.createStringColumn({ ...base, size: c.size ?? 255, xdefault: c.def as string, array: c.array });
    case "text":
      return db.createTextColumn({ ...base, array: c.array });
    case "longtext":
      return db.createLongtextColumn({ ...base, array: c.array });
    case "integer":
      return db.createIntegerColumn({ ...base, xdefault: c.def as number, array: c.array });
    case "double":
      return db.createFloatColumn({ ...base, xdefault: c.def as number, array: c.array });
    case "boolean":
      return db.createBooleanColumn({ ...base, xdefault: c.def as boolean, array: c.array });
    case "enum":
      return db.createEnumColumn({
        ...base,
        elements: c.elements ?? [],
        xdefault: c.def as string,
        array: c.array,
      });
  }
}

async function ensureBucket(): Promise<void> {
  const bucket = process.env.APPWRITE_BUCKET_AVATARS || "avatars";
  try {
    const storage = new Storage(client);
    await storage.createBucket({
      bucketId: bucket,
      name: "Avatars",
      permissions: ['read("any")', 'write("users")'],
      fileSecurity: true,
      enabled: true,
      maximumFileSize: 1_000_000,
      allowedFileExtensions: ["webp", "png", "jpg", "jpeg"],
    });
    console.log(`  ✔ bucket ${bucket}`);
  } catch (err) {
    report(err, `bucket ${bucket}`);
  }
}

/** Promeut APPWRITE_OWNER_EMAIL en Gérant (profil + labels). */
async function ensureOwner(): Promise<void> {
  const email = process.env.APPWRITE_OWNER_EMAIL;
  if (!email) return;
  try {
    const res = await users.list({ queries: [Query.equal("email", email)] });
    let user = res.users[0];
    if (!user) {
      // Pas de compte : on le crée (sinon impossible de se connecter en Gérant).
      const password = process.env.APPWRITE_OWNER_PASSWORD || "demo1234";
      user = await users.create({ userId: ID.unique(), email, password, name: "Gérant" });
      console.log(`  ✔ compte Appwrite créé → ${email} (mot de passe : ${password})`);
    }
    const now = new Date().toISOString();
    const existing = await db
      .getRow({ databaseId: DB_ID, tableId: "profiles", rowId: user.$id })
      .catch(() => null);
    if (existing) {
      await db.updateRow({
        databaseId: DB_ID,
        tableId: "profiles",
        rowId: user.$id,
        data: { role: "owner" },
      });
    } else {
      await db.createRow({
        databaseId: DB_ID,
        tableId: "profiles",
        rowId: user.$id,
        data: {
          user_id: user.$id,
          pseudo: (user.name || email.split("@")[0]).slice(0, 24),
          avatar: "",
          bio: "Gérant du site",
          role: "owner",
          date_inscription: now,
          adult_ok: false,
          adult_ok_at: "",
          confidentialite: JSON.stringify({ bibliothequePublique: false, statsPubliques: false }),
          preferences: JSON.stringify({ theme: "dark", langue: "fr" }),
          banni: false,
        },
      });
    }
    await users.updateLabels({ userId: user.$id, labels: ["owner"] });
    console.log(`  ✔ profil Gérant → ${email} (${user.$id})`);
  } catch (err) {
    report(err, "owner");
  }
}

/* ── Exécution ────────────────────────────────────────────────────────── */

async function main() {
  console.log(`Appwrite : ${ENDPOINT} · projet ${PROJECT} · base ${DB_ID}`);

  try {
    await databases.get({ databaseId: DB_ID });
    console.log("  ✔ base existante");
  } catch {
    try {
      await databases.create({ databaseId: DB_ID, name: "Les Poroiniens" });
      console.log("  ✔ base créée");
    } catch (err) {
      report(err, "create database");
    }
  }

  for (const t of TABLES) await ensureTable(t);
  await ensureBucket();
  await ensureOwner();

  if (errors.length > 0) {
    console.error("\n⚠ Problèmes rencontrés :");
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
  } else {
    console.log(`\n✔ Provisioning terminé (${TABLES.length} tables).`);
    console.log("Prochaine étape : npm run appwrite:seed pour charger le catalogue de démo.");
  }
}

main().catch((err) => {
  console.error("✖ Échec :", err);
  process.exit(1);
});
