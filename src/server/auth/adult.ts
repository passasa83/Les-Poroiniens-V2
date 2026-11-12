import "server-only";
import { cookies } from "next/headers";
import { getDb, TABLES } from "@/server/db";
import { ADULT_COOKIE, getCurrentUser } from "./session";

/**
 * Porte +18 : réservée aux **membres connectés** ayant validé la déclaration
 * d'âge (cookie ou préférence `adult_ok` du compte). Un visiteur n'y a
 * jamais accès, même avec un ancien cookie.
 */
export async function adultGateAccepted(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if ((await cookies()).get(ADULT_COOKIE)?.value === "1") return true;
  return user.adult_ok;
}

/** Mémorise l'acceptation : cookie (lu par le composant de gate) + profil du membre. */
export async function acceptAdultGate(): Promise<void> {
  const ttlDays = Number(process.env.ADULT_GATE_TTL_DAYS || 30);
  (await cookies()).set(ADULT_COOKIE, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttlDays * 86_400,
  });
  const user = await getCurrentUser();
  if (user) {
    await getDb().update(TABLES.profiles, user.id, {
      adult_ok: true,
      adult_ok_at: new Date().toISOString(),
      preferences: { ...user.preferences, adult_ok: true },
    });
  }
}
