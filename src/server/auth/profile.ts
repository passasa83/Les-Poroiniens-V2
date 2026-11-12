import "server-only";
import { getDb, TABLES } from "@/server/db";
import { DEFAULT_PREFERENCES, type CurrentUser, type Profile, type Role } from "@/lib/types";

/** Profil par défaut d'un nouveau membre. */
export function newProfile(userId: string, pseudo: string): Profile {
  return {
    user_id: userId,
    pseudo,
    avatar: null,
    bio: "",
    role: "membre",
    banni: false,
    date_inscription: new Date().toISOString(),
    adult_ok: false,
    adult_ok_at: null,
    confidentialite: { bibliothequePublique: true, statsPubliques: true },
    preferences: { ...DEFAULT_PREFERENCES },
  };
}

/** Pseudo dérivé d'un nom ou d'un e-mail pour un profil créé à la volée. */
function pseudoParDefaut(name: string, email: string): string {
  const base = (name || email.split("@")[0] || "membre")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 20);
  return base || `membre${Date.now() % 10000}`;
}

/**
 * Profil du compte, créé au premier passage s'il manque (compte Appwrite
 * créé hors du site, ancien compte…). `pseudo` force le pseudo d'un profil
 * nouvellement créé.
 */
export async function ensureProfile(
  userId: string,
  email: string,
  name: string,
  pseudo?: string,
): Promise<Profile> {
  const db = getDb();
  const existing = await db.get(TABLES.profiles, userId);
  if (existing) return existing;
  const profile = newProfile(userId, pseudo ?? pseudoParDefaut(name, email));
  await db.create(TABLES.profiles, userId, profile);
  return profile;
}

/**
 * Pseudo non pris, sur l'arbitrage exact de l'inscription (égalité sur
 * `profiles.pseudo`) : suffixe numérique jusqu'à libération.
 */
export async function pseudoLibre(base: string): Promise<string> {
  const tronque = (valeur: string, longueur: number) =>
    Array.from(valeur).slice(0, longueur).join("");
  let candidat = tronque(base, 20);
  for (let essai = 1; essai <= 50; essai += 1) {
    if (!(await pseudoPris(candidat))) return candidat;
    const suffixe = String(essai + 1);
    candidat = `${tronque(base, 20 - suffixe.length)}${suffixe}`;
  }
  return `${tronque(base, 14)}${Date.now().toString(36).slice(-4)}`;
}

export async function pseudoPris(pseudo: string): Promise<boolean> {
  const { items } = await getDb().list(TABLES.profiles, {
    filters: [{ field: "pseudo", op: "eq", value: pseudo }],
    limit: 1,
  });
  return items.length > 0;
}

/** Identifiant de compte associé à un pseudo exact, ou `null`. */
export async function userIdByPseudo(pseudo: string): Promise<string | null> {
  const { items } = await getDb().list(TABLES.profiles, {
    filters: [{ field: "pseudo", op: "eq", value: pseudo }],
    limit: 1,
  });
  return items[0]?.user_id ?? null;
}

export function toCurrentUser(profile: Profile, email: string): CurrentUser {
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
