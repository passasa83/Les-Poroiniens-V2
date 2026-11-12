import { NextResponse } from "next/server";
import { acceptAdultGate } from "@/server/auth";
import { route } from "@/server/http";

/**
 * POST /api/adult/accept — validation de la porte +18.
 * Réservé aux membres connectés (le +18 n'est jamais accessible sans
 * compte) : mémorisé 30 jours en cookie et dans le compte.
 */
export const POST = route({ auth: "user", unauthorized: "authentication_required" }, async () => {
  await acceptAdultGate();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
});
