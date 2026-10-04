import "server-only";
import { Account, Client, Storage, Users } from "node-appwrite";

/** Client serveur sans session : opérations système (clé API). */
export function adminClient() {
  const client = new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT_ID"));
  const key = process.env.APPWRITE_API_KEY;
  if (key) client.setKey(key);
  return client;
}

/** Client anonyme : création de session de connexion / inscription. */
export function anonClient() {
  return new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT_ID"));
}

/** Client authentifié par la session de l'utilisateur connecté. */
export function sessionClient(sessionId: string) {
  const client = new Client()
    .setEndpoint(requireEnv("APPWRITE_ENDPOINT"))
    .setProject(requireEnv("APPWRITE_PROJECT_ID"))
    .setSession(sessionId);
  return client;
}

export function accounts(client: Client) {
  return new Account(client);
}

/**
 * Crée une session e-mail/mot de passe et renvoie la valeur du cookie Appwrite.
 *
 * En Appwrite 2.x, l'en-tête `X-Appwrite-Session` attend le jeton du cookie
 * `a_session_<projet>` (base64 de `{id, secret}`) et non l'`$id` de session :
 * envoyé seul, l'`$id` est ignoré et Appwrite répond « role: guests missing
 * scopes (["account"]) ». Le SDK ne renvoie `secret` qu'avec une clé API, on
 * lit donc directement le `Set-Cookie` de la réponse de connexion.
 */
export async function createEmailSessionToken(
  email: string,
  password: string,
): Promise<string | null> {
  const endpoint = requireEnv("APPWRITE_ENDPOINT").replace(/\/+$/, "");
  const project = requireEnv("APPWRITE_PROJECT_ID");
  const res = await fetch(`${endpoint}/account/sessions/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": project,
      "X-Appwrite-Response-Format": "2.0.0",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const prefix = `a_session_${project}=`;
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  for (const cookie of raw) {
    const start = cookie.indexOf(prefix);
    if (start === -1) continue;
    const value = cookie.slice(start + prefix.length).split(";")[0].trim();
    if (value) return value;
  }
  return null;
}

export function users(client: Client) {
  return new Users(client);
}

export function storage(client: Client) {
  return new Storage(client);
}

export function avatarBucket(): string {
  return process.env.APPWRITE_BUCKET_AVATARS || "avatars";
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}
