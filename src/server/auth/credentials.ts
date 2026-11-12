import "server-only";
import {
  accounts,
  adminClient,
  createEmailSessionToken,
  sessionClient,
  users,
} from "@/server/appwrite";
import { getDb, TABLES } from "@/server/db";
import { ensureProfile, newProfile, pseudoPris, userIdByPseudo } from "./profile";
import {
  appwriteMode,
  clearSessionCookie,
  demoSessionToken,
  sessionToken,
  SESSION_DAYS,
  setSessionCookie,
} from "./session";

/** Champ fautif d'un refus : permet d'annoncer l'erreur au bon endroit. */
export type AuthField = "pseudo" | "email" | "password" | "captcha";

export type AuthResult = { ok: true } | { ok: false; error: string; field?: AuthField };

/**
 * Message d'échec unique : ni le pseudo, ni l'e-mail, ni l'existence d'un
 * compte ne sont révélés.
 */
const LOGIN_FAILED = "Identifiant ou mot de passe incorrect.";

/** Refus d'un compte banni : annoncé seulement après un mot de passe correct. */
const ACCOUNT_BANNED = "Ce compte a été suspendu.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function isBanned(userId: string): Promise<boolean> {
  return Boolean((await getDb().get(TABLES.profiles, userId))?.banni);
}

/** E-mail d'un compte (Appwrite Auth ou table `users` de démonstration). */
async function emailOf(userId: string): Promise<string | null> {
  if (appwriteMode()) {
    try {
      return (await users(adminClient()).get({ userId })).email || null;
    } catch {
      return null;
    }
  }
  return (await getDb().get(TABLES.users, userId))?.email ?? null;
}

/**
 * Résout un identifiant libre (e-mail **ou** pseudo) en adresse e-mail.
 * Retourne `null` quand rien ne correspond — sans distinguer la raison.
 */
async function resolveEmail(identifier: string): Promise<string | null> {
  if (EMAIL_RE.test(identifier)) return identifier.toLowerCase();
  for (const pseudo of new Set([identifier, identifier.toLowerCase()])) {
    const userId = await userIdByPseudo(pseudo);
    if (userId) return emailOf(userId);
  }
  return null;
}

/**
 * Connexion par pseudo **ou** e-mail. `remember` false → cookie de session ;
 * sinon cookie persistant de 30 jours.
 */
export async function login(
  identifier: string,
  password: string,
  options: { remember?: boolean } = {},
): Promise<AuthResult> {
  const clean = identifier.trim();
  if (!clean || password.length < 6) return { ok: false, error: LOGIN_FAILED };
  const maxDays = options.remember === false ? 0 : SESSION_DAYS;

  const email = await resolveEmail(clean);
  if (!email) return { ok: false, error: LOGIN_FAILED };

  if (appwriteMode()) {
    try {
      const token = await createEmailSessionToken(email, password);
      if (!token) return { ok: false, error: LOGIN_FAILED };
      const account = accounts(sessionClient(token));
      if (await isBanned((await account.get()).$id)) {
        await account.deleteSession({ sessionId: "current" }).catch(() => undefined);
        return { ok: false, error: ACCOUNT_BANNED };
      }
      await setSessionCookie(token, maxDays);
      return { ok: true };
    } catch {
      return { ok: false, error: LOGIN_FAILED };
    }
  }

  const { items } = await getDb().list(TABLES.users, {
    filters: [{ field: "email", op: "eq", value: email }],
    limit: 1,
  });
  const user = items[0];
  if (!user || user.password !== password) return { ok: false, error: LOGIN_FAILED };
  if (await isBanned(user.id)) return { ok: false, error: ACCOUNT_BANNED };
  await setSessionCookie(demoSessionToken(user.id), maxDays);
  return { ok: true };
}

/** Règles d'inscription : renvoie le premier refus, ou `null`. */
function validateRegistration(input: {
  pseudo: string;
  email: string;
  password: string;
}): Extract<AuthResult, { ok: false }> | null {
  /* Pseudo public : 6 à 20 caractères Unicode, lettres et chiffres seulement. */
  const longueur = [...input.pseudo].length;
  if (longueur < 6 || longueur > 20) {
    return { ok: false, error: "Le pseudo doit faire entre 6 et 20 caractères.", field: "pseudo" };
  }
  if (!/^[\p{L}\p{N}]+$/u.test(input.pseudo)) {
    return {
      ok: false,
      error: "Le pseudo ne peut contenir ni espace ni symbole.",
      field: "pseudo",
    };
  }
  if (!EMAIL_RE.test(input.email)) {
    return { ok: false, error: "Adresse e-mail invalide.", field: "email" };
  }
  if (input.password.length < 8) {
    return {
      ok: false,
      error: "Le mot de passe doit faire au moins 8 caractères.",
      field: "password",
    };
  }
  return null;
}

export async function register(input: {
  pseudo: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const pseudo = input.pseudo.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  const refus = validateRegistration({ pseudo, email, password });
  if (refus) return refus;
  if (await pseudoPris(pseudo)) {
    return { ok: false, error: "Ce pseudo est déjà pris.", field: "pseudo" };
  }

  if (appwriteMode()) {
    try {
      const { ID } = await import("node-appwrite");
      const userId = ID.unique();
      await users(adminClient()).create({ userId, email, password, name: pseudo });
      await ensureProfile(userId, email, pseudo, pseudo);
      const token = await createEmailSessionToken(email, password);
      if (!token) {
        return { ok: false, error: "Compte créé mais connexion impossible : réessayez." };
      }
      await setSessionCookie(token);
      return { ok: true };
    } catch {
      // Message neutre : ne confirme pas qu'un compte existe déjà (pas d'énumération).
      return { ok: false, error: "Inscription impossible pour le moment. Réessayez plus tard." };
    }
  }

  const db = getDb();
  const userId = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await db.create(TABLES.users, userId, { email, password, created_at: new Date().toISOString() });
  await db.create(TABLES.profiles, userId, newProfile(userId, pseudo));
  await setSessionCookie(demoSessionToken(userId));
  return { ok: true };
}

export async function logout() {
  if (appwriteMode()) {
    const raw = await sessionToken();
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
