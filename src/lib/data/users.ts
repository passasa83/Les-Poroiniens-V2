import "server-only";
import { getDb, TABLES } from "@/lib/db";
import { DEFAULT_PREFERENCES, type Profile, type Role, type UserPreferences } from "@/lib/types";

export async function getProfile(userId: string): Promise<Profile | null> {
  return getDb().get<Profile>(TABLES.profiles, userId);
}

export async function getProfileByPseudo(pseudo: string): Promise<Profile | null> {
  const { items } = await getDb().list<Profile>(TABLES.profiles, {
    filters: [{ field: "pseudo", op: "eq", value: pseudo }],
    limit: 1,
  });
  return items[0] ?? null;
}

export async function listProfiles(limit = 200): Promise<Profile[]> {
  const { items } = await getDb().list<Profile>(TABLES.profiles, {
    order: { field: "date_inscription", dir: "desc" },
    limit,
  });
  return items;
}

const PATCHABLE: Array<keyof Profile> = [
  "pseudo",
  "bio",
  "avatar",
  "confidentialite",
  "preferences",
];

export async function updateProfile(
  userId: string,
  patch: Partial<Profile>,
): Promise<Profile> {
  const clean: Record<string, unknown> = {};
  for (const key of PATCHABLE) {
    if (patch[key] !== undefined) clean[key] = patch[key];
  }
  return getDb().update<Profile>(TABLES.profiles, userId, clean);
}

/** Fusion sélective des préférences : seuls les champs connus sont retenus (§14.4). */
export async function updatePreferences(
  userId: string,
  incoming: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const profile = await getProfile(userId);
  const current = { ...DEFAULT_PREFERENCES, ...(profile?.preferences ?? {}) };
  const merged: UserPreferences = { ...current };

  if (incoming.theme === "dark" || incoming.theme === "light" || incoming.theme === "system") {
    merged.theme = incoming.theme;
  }
  if (incoming.sens_lecture === "ltr" || incoming.sens_lecture === "rtl") {
    merged.sens_lecture = incoming.sens_lecture;
  }
  if (
    incoming.mode_lecture === "vertical" ||
    incoming.mode_lecture === "single" ||
    incoming.mode_lecture === "double"
  ) {
    merged.mode_lecture = incoming.mode_lecture;
  }
  if (typeof incoming.langue === "string" && incoming.langue.length <= 10) {
    merged.langue = incoming.langue;
  }
  if (typeof incoming.adult_ok === "boolean") merged.adult_ok = incoming.adult_ok;
  if (typeof incoming.notifications === "boolean") merged.notifications = incoming.notifications;
  if (Array.isArray(incoming.tagsMasques)) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of incoming.tagsMasques.slice(0, 80)) {
      const tag = String(raw).trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
      if (out.length >= 80) break;
    }
    merged.tagsMasques = out;
  }

  await getDb().update<Profile>(TABLES.profiles, userId, {
    preferences: merged,
    // Révocation effective (§11) : couper l'opt-out doit refermer la porte,
    // sinon la préférence « Afficher le contenu +18 » serait décorative.
    ...(merged.adult_ok
      ? { adult_ok: true, adult_ok_at: new Date().toISOString() }
      : { adult_ok: false, adult_ok_at: null }),
  });
  return merged;
}

/** Modification de rôle : Admin et Gérant réservés au Gérant (§9.3). */
export async function setRole(userId: string, role: Role): Promise<void> {
  await getDb().update<Profile>(TABLES.profiles, userId, { role });
}
