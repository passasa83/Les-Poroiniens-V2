import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { accounts, adminClient, createEmailSessionToken, sessionClient, users } from "@/lib/appwrite";
import { discordLabel, type DiscordIdentity } from "@/lib/discord";
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

/**
 * Pose la session (à appeler depuis une route ou une server action).
 * `maxDays` nul → cookie de session : il disparaît à la fermeture du
 * navigateur (« Se souvenir de moi » désactivé).
 */
export async function setSessionCookie(sessionId: string, maxDays = SESSION_DAYS) {
  const store = await cookies();
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  store.set(
    SESSION_COOKIE,
    sessionId,
    maxDays > 0 ? { ...base, maxAge: maxDays * 86_400 } : base,
  );
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
    // `await` obligatoire : sans lui, la promesse rejetée échappe au catch et
    // la page tombe en 500 au lieu de basculer en « visiteur ».
    return await (appwriteMode() ? fromAppwrite(raw) : fromDemo(raw));
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

/** Champ fautif d'un refus : permet d'annoncer l'erreur au bon endroit. */
export type AuthField = "pseudo" | "email" | "password" | "captcha";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string; field?: AuthField };

/**
 * Message d'échec unique : ni le pseudo, ni l'e-mail, ni l'existence
 * d'un compte ne sont révélés. Identique que la saisie soit un identifiant
 * inconnu ou un mot de passe erroné.
 */
const LOGIN_FAILED = "Identifiant ou mot de passe incorrect.";

/**
 * Résout un identifiant libre (e-mail **ou** pseudo) en adresse e-mail.
 * Retourne `null` quand rien ne correspond — sans distinguer la raison.
 */
async function resolveEmail(identifier: string): Promise<string | null> {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return identifier.toLowerCase();

  const db = getDb();
  const candidats = [...new Set([identifier, identifier.toLowerCase()])];
  for (const pseudo of candidats) {
    const { items } = await db.list<{ user_id: string }>(TABLES.profiles, {
      filters: [{ field: "pseudo", op: "eq", value: pseudo }],
      limit: 1,
    });
    const userId = items[0]?.user_id;
    if (!userId) continue;
    if (appwriteMode()) {
      try {
        const user = await users(adminClient()).get({ userId });
        if (user.email) return user.email;
      } catch {
        return null;
      }
    } else {
      const row = await db.get<Record<string, unknown>>(TABLES.users, userId);
      if (row?.email) return String(row.email);
    }
  }
  return null;
}

/**
 * Connexion par identifiant **ou** e-mail.
 * `remember` false → cookie de session (effacé à la fermeture du navigateur) ;
 * `remember` true → cookie persistant de 30 jours.
 */
export async function login(
  identifier: string,
  password: string,
  options: { remember?: boolean } = {},
): Promise<AuthResult> {
  const clean = identifier.trim();
  if (!clean || password.length < 6) {
    return { ok: false, error: LOGIN_FAILED };
  }
  const maxDays = options.remember === false ? 0 : SESSION_DAYS;

  const email = await resolveEmail(clean);
  if (!email) {
    // Message unique : pas de distinction identifiant / mot de passe
    return { ok: false, error: LOGIN_FAILED };
  }

  if (appwriteMode()) {
    try {
      const token = await createEmailSessionToken(email, password);
      if (!token) {
        return { ok: false, error: LOGIN_FAILED };
      }
      await setSessionCookie(token, maxDays);
      return { ok: true };
    } catch {
      return { ok: false, error: LOGIN_FAILED };
    }
  }
  const db = getDb();
  const { items } = await db.list<Record<string, unknown>>(TABLES.users, {
    filters: [{ field: "email", op: "eq", value: email }],
    limit: 1,
  });
  const user = items[0];
  if (!user || user.password !== password) {
    return { ok: false, error: LOGIN_FAILED };
  }
  const id = String(user.id);
  await setSessionCookie(`${id}.${sign(id)}`, maxDays);
  return { ok: true };
}

export async function register(input: {
  pseudo: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const pseudo = input.pseudo.trim();
  const email = input.email.trim().toLowerCase();

  /* Pseudo public : 6 à 20 caractères, lettres et chiffres seulement,
     donc ni espace ni symbole. La longueur se compte en caractères Unicode. */
  const longueur = [...pseudo].length;
  if (longueur < 6 || longueur > 20) {
    return {
      ok: false,
      error: "Le pseudo doit faire entre 6 et 20 caractères.",
      field: "pseudo",
    };
  }
  if (!/^[\p{L}\p{N}]+$/u.test(pseudo)) {
    return {
      ok: false,
      error: "Le pseudo ne peut contenir ni espace ni symbole.",
      field: "pseudo",
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Adresse e-mail invalide.", field: "email" };
  }
  if (input.password.length < 8) {
    return {
      ok: false,
      error: "Le mot de passe doit faire au moins 8 caractères.",
      field: "password",
    };
  }
  const db = getDb();
  const { items } = await db.list<{ pseudo: string }>(TABLES.profiles, {
    filters: [{ field: "pseudo", op: "eq", value: pseudo }],
    limit: 1,
  });
  if (items.length > 0) {
    return { ok: false, error: "Ce pseudo est déjà pris.", field: "pseudo" };
  }

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
      const token = await createEmailSessionToken(email, input.password);
      const profile = await ensureProfile(userId, email, pseudo);
      await db.update<Profile>(TABLES.profiles, userId, {
        ...profile,
        pseudo,
      } as unknown as Record<string, unknown>);
      if (!token) {
        return { ok: false, error: "Compte créé mais connexion impossible : réessayez." };
      }
      await setSessionCookie(token);
      return { ok: true };
    } catch {
      // Message volontairement neutre : il ne confirme pas qu'un compte
      // existe déjà avec cette adresse (« pas d'énumération »).
      return {
        ok: false,
        error: "Inscription impossible pour le moment. Réessayez plus tard.",
      };
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

/* ── Connexion Discord ────────────────────────────────────────────────── */

export type DiscordLoginResult =
  | { ok: true; cree: boolean }
  | { ok: false; code: "echec" };

/**
 * Pseudo non pris, sur l'arbitrage exact de l'inscription (recherche
 * d'égalité sur `profiles.pseudo`) : suffixe numérique jusqu'à libération.
 */
async function pseudoLibre(db: ReturnType<typeof getDb>, base: string): Promise<string> {
  const tronque = (valeur: string, longueur: number) =>
    Array.from(valeur).slice(0, longueur).join("");
  let candidat = tronque(base, 20);
  for (let essai = 1; essai <= 50; essai += 1) {
    const { items } = await db.list<{ pseudo: string }>(TABLES.profiles, {
      filters: [{ field: "pseudo", op: "eq", value: candidat }],
      limit: 1,
    });
    if (items.length === 0) return candidat;
    const suffixe = String(essai + 1);
    candidat = `${tronque(base, 20 - suffixe.length)}${suffixe}`;
  }
  return `${tronque(base, 14)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Ouvre une session pour l'identité Discord déjà vérifiée côté serveur.
 *
 * Rapprochement, dans cet ordre :
 *   1. le libellé `discord<id>` posé sur le compte — seul repère qui suit
 *      le compte même après un changement d'e-mail ;
 *   2. l'e-mail **vérifié** par Discord → liaison automatique au compte
 *      existant (un e-mail non vérifié ne donne jamais accès à un compte) ;
 *   3. sinon, création d'un compte « membre » avec pseudo tiré de Discord.
 *
 * La session est ouverte côté serveur (`users.createSession`) : son
 * `secret` **est** déjà le jeton du cookie Appwrite, à l'identique de la
 * valeur lue sur `Set-Cookie` de la connexion e-mail. Si le navigateur
 * avait déjà une session sur ce compte, elle est conservée telle quelle.
 */
export async function loginWithDiscord(
  identity: DiscordIdentity,
): Promise<DiscordLoginResult> {
  if (!appwriteMode()) return { ok: false, code: "echec" };

  try {
    const { ID, Query } = await import("node-appwrite");
    const service = users(adminClient());
    const db = getDb();
    const label = discordLabel(identity.id);

    let userId: string | null = null;

    // 1) libellé Discord
    try {
      const { users: trouves } = await service.list({
        queries: [Query.containsAny("labels", [label]), Query.limit(1)],
      });
      userId = trouves[0]?.$id ?? null;
    } catch {
      /* recherche indisponible : on poursuit par l'e-mail */
    }

    // 2) rattachement par e-mail vérifié
    if (!userId && identity.email && identity.emailVerifie) {
      try {
        const { users: trouves } = await service.list({
          queries: [Query.equal("email", [identity.email]), Query.limit(1)],
        });
        const cible = trouves[0];
        if (cible) {
          userId = cible.$id;
          await service.updateLabels({
            userId,
            labels: [...new Set([...(cible.labels ?? []), label])],
          });
        }
      } catch {
        /* rattachement impossible : la création reste ouverte */
      }
    }

    let cree = false;

    // 3) création d'un compte membre
    if (!userId) {
      const pseudo = await pseudoLibre(db, identity.pseudo);
      const repli = `${identity.id}@discord.poroiniens.fr`;
      const motDePasse = randomBytes(24).toString("base64url");
      const nom = identity.nom || pseudo;
      let emailRetenu = identity.email ?? repli;
      try {
        const compte = await service.create({
          userId: ID.unique(),
          email: emailRetenu,
          password: motDePasse,
          name: nom,
        });
        userId = compte.$id;
      } catch (erreur) {
        // Repli seulement si l'e-mail Discord est déjà porté par un autre
        // compte (il n'était pas vérifié : le compte existant n'est jamais
        // touché). Toute autre erreur remonte au message générique.
        const info = (erreur ?? {}) as { code?: number; type?: string };
        const dejaPris = info.code === 409 || info.type === "user_already_exists";
        if (!dejaPris || emailRetenu === repli) throw erreur;
        emailRetenu = repli;
        const compte = await service.create({
          userId: ID.unique(),
          email: repli,
          password: motDePasse,
          name: nom,
        });
        userId = compte.$id;
      }
      await service.updateLabels({ userId, labels: [label] });
      const profile = await ensureProfile(userId, emailRetenu, pseudo);
      await db.update<Profile>(TABLES.profiles, userId, {
        ...profile,
        pseudo,
      } as unknown as Record<string, unknown>);
      cree = true;
    }

    if (!userId) return { ok: false, code: "echec" };

    // 4) session
    const store = await cookies();
    const brut = store.get(SESSION_COOKIE)?.value ?? null;
    let connecte: string | null = null;
    if (brut) {
      try {
        connecte = (await accounts(sessionClient(brut)).get()).$id;
      } catch {
        connecte = null; // session expirée : rien à libérer
      }
    }

    if (connecte === userId) return { ok: true, cree }; // déjà connecté

    if (brut && connecte) {
      // Un autre compte était ouvert dans ce navigateur : sa session courante
      // est refermée pour ne pas laisser de doublon inutilisé côté serveur.
      try {
        await accounts(sessionClient(brut)).deleteSession({ sessionId: "current" });
      } catch {
        /* best effort : la reconnexion reste possible sans ce nettoyage */
      }
    }

    const session = await service.createSession({ userId });
    if (!session.secret) return { ok: false, code: "echec" };
    await setSessionCookie(session.secret);
    return { ok: true, cree };
  } catch {
    return { ok: false, code: "echec" };
  }
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

/**
 * Porte +18 : réservée aux **membres connectés** ayant validé la
 * déclaration d'âge (cookie 30 jours ou préférence `adult_ok` du compte).
 * Les visiteurs n'y ont jamais accès, même avec un ancien cookie.
 */
export async function adultGateAccepted(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const store = await cookies();
  if (store.get(ADULT_COOKIE)?.value === "1") return true;
  return Boolean(user.adult_ok);
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
