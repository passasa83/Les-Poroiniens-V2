import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { accounts, sessionClient } from "@/server/appwrite";
import { appwriteEnabled, getDb, TABLES } from "@/server/db";
import type { CurrentUser } from "@/lib/types";
import { ensureProfile, toCurrentUser } from "./profile";

export const SESSION_COOKIE = "lp_session";
export const ADULT_COOKIE = "adult_ok";
export const SESSION_DAYS = 30;

/** Mode Appwrite (clé API renseignée) ; sinon jeu de démonstration en mémoire. */
export const appwriteMode = appwriteEnabled;

/* ── Jeton signé du mode démonstration ───────────────────────────────── */

function secret(): string {
  return process.env.AUTH_SECRET || "dev-secret-a-changer";
}

function sign(value: string): string {
  return createHash("sha256").update(`${secret()}|${value}`).digest("hex").slice(0, 32);
}

/** Valeur de cookie d'un compte de démonstration : `<userId>.<signature>`. */
export function demoSessionToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

function demoUserId(raw: string): string | null {
  const [userId, sig] = raw.split(".");
  if (!userId || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(userId));
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}

/* ── Cookie ──────────────────────────────────────────────────────────── */

/**
 * Pose la session (route ou server action). `maxDays` nul → cookie de
 * session, effacé à la fermeture du navigateur (« Se souvenir de moi » décoché).
 */
export async function setSessionCookie(token: string, maxDays = SESSION_DAYS) {
  const store = await cookies();
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  store.set(SESSION_COOKIE, token, maxDays > 0 ? { ...base, maxAge: maxDays * 86_400 } : base);
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ADULT_COOKIE);
}

/** Jeton brut du cookie de session, s'il existe. */
export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/* ── Utilisateur courant ─────────────────────────────────────────────── */

/**
 * Utilisateur connecté (identité serveur uniquement), mémorisé pour la durée
 * du rendu. Tout échec — session expirée, backend injoignable, compte banni —
 * se traduit par un visiteur, jamais par une erreur 500.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const raw = await sessionToken();
  if (!raw) return null;
  try {
    return await (appwriteMode() ? fromAppwrite(raw) : fromDemo(raw));
  } catch {
    return null;
  }
});

async function fromAppwrite(token: string): Promise<CurrentUser | null> {
  const user = await accounts(sessionClient(token)).get();
  const profile = await ensureProfile(user.$id, user.email, user.name);
  if (profile.banni) return null;
  return toCurrentUser(profile, user.email);
}

async function fromDemo(raw: string): Promise<CurrentUser | null> {
  const userId = demoUserId(raw);
  if (!userId) return null;
  const account = await getDb().get(TABLES.users, userId);
  if (!account) return null;
  const profile = await ensureProfile(userId, account.email, "");
  if (profile.banni) return null;
  return toCurrentUser(profile, account.email);
}
