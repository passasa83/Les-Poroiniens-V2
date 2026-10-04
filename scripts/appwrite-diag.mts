/**
 * npm run appwrite:diag — vérifie la connexion à Appwrite et isole la panne.
 *
 * Teste dans l'ordre : santé, authentification de la clé, contrôle des scopes,
 * puis les services de données (TablesDB, Users, Storage). Chaque appel affiche
 * le code HTTP et la réponse brute : un 500 signale un problème côté serveur
 * Appwrite (base, Redis, disque), un 401 signale un scope manquant.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const EP = process.env.APPWRITE_ENDPOINT;
const PROJECT = process.env.APPWRITE_PROJECT_ID;
const KEY = process.env.APPWRITE_API_KEY;

if (!EP || !PROJECT || !KEY) {
  console.error("✖ Renseignez APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID et APPWRITE_API_KEY dans .env.local");
  process.exit(1);
}

type Probe = {
  label: string;
  path: string;
  method?: "GET" | "POST";
  key?: boolean;
  body?: Record<string, unknown>;
  attendu: string;
};

const probes: Probe[] = [
  { label: "Santé du serveur", path: "/health", key: true, attendu: "200 — serveur joignable" },
  {
    label: "Contrôle des scopes (sans clé)",
    path: "/users",
    attendu: "401 + « missing scopes » — le contrôle de scopes fonctionne",
  },
  {
    label: "Authentification de la clé",
    path: "/projects",
    key: true,
    attendu: "401 + « missing scopes (projects.read) » — la clé est reconnue",
  },
  {
    label: "Session anonyme (données, sans clé)",
    path: "/account/sessions/anonymous",
    method: "POST",
    body: {},
    attendu: "201/401/400 — accès aux données opérationnel",
  },
  { label: "Liste des utilisateurs", path: "/users", key: true, attendu: "200 — Users opérationnel" },
  { label: "Liste des bases", path: "/databases", key: true, attendu: "200 — Databases opérationnel" },
  { label: "Liste des tables", path: "/tablesdb", key: true, attendu: "200 — TablesDB opérationnel" },
  { label: "Liste des buckets", path: "/storage/buckets", key: true, attendu: "200 — Storage opérationnel" },
];

console.log(`Appwrite : ${EP} · projet ${PROJECT}\n`);

let serveurKO = false;
let scopeManquant = false;

for (const p of probes) {
  const headers: Record<string, string> = {
    "X-Appwrite-Project": PROJECT,
    "X-Appwrite-Response-Format": "2.0.0",
  };
  if (p.key) headers["X-Appwrite-Key"] = KEY;
  if (p.body) headers["Content-Type"] = "application/json";

  let status = 0;
  let body = "";
  try {
    const res = await fetch(`${EP}${p.path}`, {
      method: p.method ?? "GET",
      headers,
      body: p.body ? JSON.stringify(p.body) : undefined,
    });
    status = res.status;
    body = (await res.text()).slice(0, 400);
  } catch (err) {
    body = (err as Error).message;
  }

  const symptome =
    status >= 500
      ? "PROBLÈME SERVEUR (500) : base/Redis/disque d'Appwrite"
      : status === 401 && body.includes("missing scopes")
        ? "scope manquant côté clé"
        : "ok";

  if (status >= 500) serveurKO = true;
  if (status === 401 && body.includes("missing scopes")) scopeManquant = true;

  const icone = symptome === "ok" ? "✔" : status >= 500 ? "✖" : "⚠";
  console.log(`${icone} ${p.label}  [${status || "erreur réseau"}]`);
  console.log(`    attendu : ${p.attendu}`);
  console.log(`    reçu    : ${body.replace(/\s+/g, " ")}\n`);
}

if (serveurKO) {
  console.log(
    "✖ Un ou plusieurs services de données renvoient 500 : le problème est côté serveur Appwrite\n" +
      "  (docker logs appwrite, état de la base, espace disque). La clé API n'est pas en cause.",
  );
  process.exit(1);
}
if (scopeManquant) {
  console.log(
    "⚠ Scopes manquants : ajoutez-les dans le dashboard (Settings → API keys) puis relancez.\n" +
      "  En général : tables.read, tables.write, collections.read, collections.write,\n" +
      "  databases.read, databases.write, users.read, users.write, buckets.read,\n" +
      "  buckets.write, files.read, files.write.",
  );
  process.exit(1);
}
console.log("✔ Connexion Appwrite complète : exécutez `npm run appwrite:setup`.");
