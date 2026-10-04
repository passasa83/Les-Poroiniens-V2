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
