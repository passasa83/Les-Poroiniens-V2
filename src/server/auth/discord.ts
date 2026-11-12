import "server-only";
import { randomBytes } from "node:crypto";
import { accounts, adminClient, sessionClient, users } from "@/server/appwrite";
import { discordLabel, type DiscordIdentity } from "@/lib/discord";
import { ensureProfile, pseudoLibre } from "./profile";
import { appwriteMode, sessionToken, setSessionCookie } from "./session";

export type DiscordLoginResult = { ok: true; cree: boolean } | { ok: false; code: "echec" };

type UsersService = ReturnType<typeof users>;

/** 1) Compte portant déjà le libellé `discord<id>` (suit le compte même après un changement d'e-mail). */
async function parLibelle(service: UsersService, label: string): Promise<string | null> {
  const { Query } = await import("node-appwrite");
  try {
    const { users: trouves } = await service.list({
      queries: [Query.containsAny("labels", [label]), Query.limit(1)],
    });
    return trouves[0]?.$id ?? null;
  } catch {
    return null; // recherche indisponible : on poursuit par l'e-mail
  }
}

/** 2) Rattachement par e-mail **vérifié** par Discord (jamais un e-mail non vérifié). */
async function parEmailVerifie(
  service: UsersService,
  identity: DiscordIdentity,
  label: string,
): Promise<string | null> {
  if (!identity.email || !identity.emailVerifie) return null;
  const { Query } = await import("node-appwrite");
  try {
    const { users: trouves } = await service.list({
      queries: [Query.equal("email", [identity.email]), Query.limit(1)],
    });
    const cible = trouves[0];
    if (!cible) return null;
    await service.updateLabels({
      userId: cible.$id,
      labels: [...new Set([...(cible.labels ?? []), label])],
    });
    return cible.$id;
  } catch {
    return null; // rattachement impossible : la création reste ouverte
  }
}

/** 3) Création d'un compte « membre » au pseudo tiré de Discord. */
async function creerCompte(
  service: UsersService,
  identity: DiscordIdentity,
  label: string,
): Promise<string> {
  const { ID } = await import("node-appwrite");
  const pseudo = await pseudoLibre(identity.pseudo);
  const repli = `${identity.id}@discord.poroiniens.fr`;
  const password = randomBytes(24).toString("base64url");
  const name = identity.nom || pseudo;
  let email = identity.email ?? repli;
  let userId: string;
  try {
    userId = (await service.create({ userId: ID.unique(), email, password, name })).$id;
  } catch (erreur) {
    // Repli uniquement si l'e-mail Discord (non vérifié) est déjà porté par un
    // autre compte, qui n'est jamais touché. Toute autre erreur remonte.
    const info = (erreur ?? {}) as { code?: number; type?: string };
    const dejaPris = info.code === 409 || info.type === "user_already_exists";
    if (!dejaPris || email === repli) throw erreur;
    email = repli;
    userId = (await service.create({ userId: ID.unique(), email, password, name })).$id;
  }
  await service.updateLabels({ userId, labels: [label] });
  await ensureProfile(userId, email, pseudo, pseudo);
  return userId;
}

/**
 * Ouvre une session pour une identité Discord déjà vérifiée côté serveur.
 * Rapprochement : libellé Discord, puis e-mail vérifié, sinon création.
 * La session est créée côté serveur (`users.createSession`) : son `secret`
 * est directement le jeton du cookie. Une session déjà ouverte sur le même
 * compte est conservée ; celle d'un autre compte est refermée.
 */
export async function loginWithDiscord(identity: DiscordIdentity): Promise<DiscordLoginResult> {
  if (!appwriteMode()) return { ok: false, code: "echec" };
  try {
    const service = users(adminClient());
    const label = discordLabel(identity.id);

    let userId =
      (await parLibelle(service, label)) ?? (await parEmailVerifie(service, identity, label));
    const cree = !userId;
    if (!userId) userId = await creerCompte(service, identity, label);

    const brut = await sessionToken();
    let connecte: string | null = null;
    if (brut) {
      try {
        connecte = (await accounts(sessionClient(brut)).get()).$id;
      } catch {
        connecte = null; // session expirée : rien à libérer
      }
    }
    if (connecte === userId) return { ok: true, cree };
    if (brut && connecte) {
      try {
        await accounts(sessionClient(brut)).deleteSession({ sessionId: "current" });
      } catch {
        /* best effort */
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
