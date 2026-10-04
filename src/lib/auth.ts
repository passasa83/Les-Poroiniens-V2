import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { accounts, adminClient, anonClient, sessionClient, users } from "@/lib/appwrite";
import { getDb, TABLES } from "@/lib/db";
import {
  DEFAULT_PREFERENCES,
  type CurrentUser,
  type Profile,
  type Role,
} from "@/lib/types";

export const SESSION_COOKIE = "lp_session";
export const ADULT_COOKIE = "adult_ok";
const SESSION_DAYS = 30;

function secret(): string {
  return process.env.AUTH_SECRET || "dev-secret-a-changer";
}

function sign(value: string): string {
  return createHash("sha256").update(`${secret()}|${value}`).digest("hex").slice(0, 32);
}

export function appwriteMode(): boolean {
  return Boolean(process.env.APPWRITE_API_KEY);
}

/** Poser la session (à appeler depuis une route ou une server action). */
export async function setSessionCookie(sessionId: string, maxDays = SESSION_DAYS) {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxDays * 86_400,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ADULT_COOKIE);
}

/** Lecture de la session : identité serveur uniquement, jamais d'identité client. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return appwriteMode() ? fromAppwrite(raw) : fromDemo(raw);
  } catch {
    return null;
  }
});

async function fromAppwrite(sessionId: string): Promise<CurrentUser | null> {
  const account = accounts(sessionClient(sessionId));
  const user = await account.get();
  const profile = await ensureProfile(user.$id, user.email, user.name);
  return toCurrentUser(profile, user.email);
}

async function fromDemo(raw: string): Promise<CurrentUser | null> {
  const [userId, sig] = raw.split(".");
  if (!userId || !sig) return null;
  const expected = sign(userId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const db = getDb();
  const account = await db.get<Record<string, unknown>>(TABLES.users, userId);
  if (!account) return null;
  const profile = await ensureProfile(userId, String(account.email), "");
  return toCurrentUser(profile, String(account.email));
}

async function ensureProfile(userId: string, email: string, name: string): Promise<Profile> {
  const db = getDb();
  const existing = await db.get<Profile>(TABLES.profiles, userId);
  if (existing) return existing;
  const pseudoBase = (name || email.split("@")[0] || "membre")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 20);
  const profile: Profile = {
    user_id: userId,
    pseudo: pseudoBase || `membre${Date.now() % 10000}`,
    avatar: null,
    bio: "",
    role: "membre",
    date_inscription: new Date().toISOString(),
    adult_ok: false,
    adult_ok_at: null,
    confidentialite: { bibliothequePublique: true, statsPubliques: true },
    preferences: { ...DEFAULT_PREFERENCES },
  };
  await db.create<Profile>(TABLES.profiles, userId, profile as unknown as Record<string, unknown>);
  return profile;
}

function toCurrentUser(profile: Profile, email: string): CurrentUser {
  return {
    id: profile.user_id,
    pseudo: profile.pseudo,
    email,
    role: (profile.role ?? "membre") as Role,
    avatar: profile.avatar,
    adult_ok: Boolean(profile.adult_ok || profile.preferences?.adult_ok),
    preferences: { ...DEFAULT_PREFERENCES, ...(profile.preferences ?? {}) },
  };
}

/* ── Connexion / inscription ─────────────────────────────────────────── */

export type AuthResult = { ok: true } | { ok: false; error: string };

export async function login(email: string, password: string): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || password.length < 6) {
    return { ok: false, error: "Identifiants invalides." };
  }
  if (appwriteMode()) {
    try {
      const session = await accounts(anonClient()).createEmailPasswordSession({
        email: cleanEmail,
        password,
      });
      await setSessionCookie(session.$id);
      return { ok: true };
    } catch {
      // Message unique : pas de distinction email / mot de passe (§14.2)
      return { ok: false, error: "Identifiants invalides." };
    }
  }
  const db = getDb();
  const { items } = await db.list<Record<string, unknown>>(TABLES.users, {
    filters: [{ field: "email", op: "eq", value: cleanEmail }],
    limit: 1,
  });
  const user = items[0];
  if (!user || user.password !== password) {
    return { ok: false, error: "Identifiants invalides." };
  }
  const id = String(user.id);
  await setSessionCookie(`${id}.${sign(id)}`);
  return { ok: true };
}

export async function register(input: {
  pseudo: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const pseudo = input.pseudo.trim();
  const email = input.email.trim().toLowerCase();
  if (pseudo.length < 3 || pseudo.length > 24) {
    return { ok: false, error: "Le pseudo doit faire entre 3 et 24 caractères." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Adresse e-mail invalide." };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "Le mot de passe doit faire au moins 8 caractères." };
  }
  const db = getDb();
  const { items } = await db.list<{ pseudo: string }>(TABLES.profiles, {
    filters: [{ field: "pseudo", op: "eq", value: pseudo }],
    limit: 1,
  });
  if (items.length > 0) return { ok: false, error: "Ce pseudo est déjà pris." };

  if (appwriteMode()) {
    try {
      const { ID } = await import("node-appwrite");
      const userId = ID.unique();
      await users(adminClient()).create({
        userId,
        email,
        password: input.password,
        name: pseudo,
      });
      const session = await accounts(anonClient()).createEmailPasswordSession({
        email,
        password: input.password,
      });
      const profile = await ensureProfile(userId, email, pseudo);
      await db.update<Profile>(TABLES.profiles, userId, {
        ...profile,
        pseudo,
      } as unknown as Record<string, unknown>);
      await setSessionCookie(session.$id);
      return { ok: true };
    } catch {
      return { ok: false, error: "Impossible de créer le compte (adresse déjà utilisée ?)." };
    }
  }
  const userId = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await db.create(TABLES.users, userId, {
    email,
    password: input.password,
    created_at: new Date().toISOString(),
  });
  await db.create<Profile>(TABLES.profiles, userId, {
    user_id: userId,
    pseudo,
    avatar: null,
    bio: "",
    role: "membre",
    date_inscription: new Date().toISOString(),
    adult_ok: false,
    adult_ok_at: null,
    confidentialite: { bibliothequePublique: true, statsPubliques: true },
    preferences: { ...DEFAULT_PREFERENCES },
  } as unknown as Record<string, unknown>);
  await setSessionCookie(`${userId}.${sign(userId)}`);
  return { ok: true };
}

export async function logout() {
  if (appwriteMode()) {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE)?.value;
    if (raw) {
      try {
        await accounts(sessionClient(raw)).deleteSession({ sessionId: "current" });
      } catch {
        /* la session peut déjà être expirée */
      }
    }
  }
  await clearSessionCookie();
}

/* ── Porte +18 ───────────────────────────────────────────────────────── */

export async function adultGateAccepted(): Promise<boolean> {
  const store = await cookies();
  if (store.get(ADULT_COOKIE)?.value === "1") return true;
  const user = await getCurrentUser();
  return Boolean(user?.adult_ok);
}

/** Mémorise le choix du gate : cookie (visiteur) + préférence du compte (membre). */
export async function acceptAdultGate(): Promise<void> {
  const store = await cookies();
  const ttlDays = Number(process.env.ADULT_GATE_TTL_DAYS || 30);
  store.set(ADULT_COOKIE, "1", {
    httpOnly: false, // lu par le composant de gate côté client
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlDays * 86_400,
  });
  const user = await getCurrentUser();
  if (user) {
    await getDb().update<Profile>(TABLES.profiles, user.id, {
      adult_ok: true,
      adult_ok_at: new Date().toISOString(),
      preferences: { ...user.preferences, adult_ok: true },
    } as unknown as Record<string, unknown>);
  }
}
