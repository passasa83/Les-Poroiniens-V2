import "server-only";
import { cookies } from "next/headers";
import { accounts, sessionClient } from "@/lib/appwrite";
import { appwriteMode, clearSessionCookie, SESSION_COOKIE } from "@/lib/auth";
import type { SessionInfo } from "@/lib/types";

/**
 * Sessions de connexion du compte (« Réglages : … sessions »).
 *
 * Serveur uniquement : le jeton de session est lu dans le cookie httpOnly,
 * jamais dans l'URL ni dans le corps des requêtes. Aucun secret n'est
 * renvoyé au client — seules les métadonnées affichables le sont.
 */
export type { SessionInfo };

export type RevokeResult =
  | { ok: true; courante: boolean }
  | { ok: false; code: "inconnue" | "echec" };

const FOURNISSEURS: Record<string, string> = {
  email: "E-mail et mot de passe",
  "email-password": "E-mail et mot de passe",
  oauth2: "Compte tiers (OAuth)",
  discord: "Discord",
  magic_url: "Lien magique",
  anonymous: "Session anonyme",
  // Session mintée par le serveur : dans ce site, seule la connexion
  // Discord en ouvre (la connexion e-mail passe par le fournisseur `email`).
  server: "Discord",
};

async function rawSession(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Session synthétique du mode démonstration (aucun back applicatif derrière). */
function demoSession(): SessionInfo {
  return {
    id: "courante",
    courante: true,
    creeeLe: null,
    expireLe: null,
    appareil: "Ce navigateur",
    fournisseur: FOURNISSEURS.email,
    ip: null,
    pays: null,
  };
}

function labelAppareil(s: {
  clientName?: string;
  clientVersion?: string;
  osName?: string;
  deviceName?: string;
}): string {
  const navigateur = [s.clientName, s.clientVersion].filter(Boolean).join(" ");
  const systeme = s.osName || s.deviceName || "";
  const parts = [navigateur, systeme].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Appareil inconnu";
}

function mapAppwrite(
  s: {
    $id: string;
    $createdAt: string;
    expire?: string;
    provider?: string;
    clientName?: string;
    clientVersion?: string;
    osName?: string;
    deviceName?: string;
    ip?: string;
    countryName?: string;
  },
  courante: boolean,
): SessionInfo {
  return {
    id: s.$id,
    courante,
    creeeLe: s.$createdAt ?? null,
    expireLe: s.expire ?? null,
    appareil: labelAppareil(s),
    fournisseur: s.provider ? (FOURNISSEURS[s.provider] ?? s.provider) : "Inconnu",
    ip: s.ip || null,
    pays: s.countryName || null,
  };
}

/** Liste des sessions du compte connecté ; tableau vide sans session valide. */
export async function listSessions(): Promise<SessionInfo[]> {
  if (!appwriteMode()) {
    const raw = await rawSession();
    return raw ? [demoSession()] : [];
  }

  const raw = await rawSession();
  if (!raw) return [];
  try {
    const compte = accounts(sessionClient(raw));
    const { sessions } = await compte.listSessions();

    // Repérage de la session courante : d'abord le drapeau de la liste, puis
    // la session « current » si le fournisseur ne le renseigne pas.
    let courantId = sessions.find((s) => s.current)?.$id ?? null;
    if (!courantId) {
      try {
        courantId = (await compte.getSession({ sessionId: "current" })).$id;
      } catch {
        courantId = null;
      }
    }
    return sessions.map((s) => mapAppwrite(s, s.$id === courantId));
  } catch {
    /* session expirée ou Appwrite injoignable : on n'affiche rien plutôt
       qu'une liste fausse (le reste de la page reste utilisable) */
    return [];
  }
}

/**
 * Révoque une session. La session courante referme la session locale
 * (cookie effacé) : l'appareil est déconnecté immédiatement.
 */
export async function revokeSession(id: string): Promise<RevokeResult> {
  const sessions = await listSessions();
  const cible = sessions.find((s) => s.id === id);
  if (!cible) return { ok: false, code: "inconnue" };

  if (!appwriteMode()) {
    // Mode démonstration : une seule session, toujours la courante.
    await clearSessionCookie();
    return { ok: true, courante: true };
  }

  const raw = await rawSession();
  if (!raw) return { ok: false, code: "inconnue" };
  try {
    await accounts(sessionClient(raw)).deleteSession({ sessionId: id });
  } catch {
    return { ok: false, code: "echec" };
  }
  if (cible.courante) await clearSessionCookie();
  return { ok: true, courante: cible.courante };
}

/** Révoque toutes les sessions du compte, la session locale comprise. */
export async function revokeAllSessions(): Promise<void> {
  const raw = await rawSession();
  if (raw && appwriteMode()) {
    try {
      await accounts(sessionClient(raw)).deleteSessions();
    } catch {
      /* la session a pu expirer entre-temps */
    }
  }
  await clearSessionCookie();
}
