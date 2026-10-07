import { NextResponse } from "next/server";
import { acceptAdultGate, getCurrentUser } from "@/lib/auth";

/**
 * POST /api/adult/accept — validation de la porte +18.
 * Réservé aux membres connectés (le +18 n'est jamais accessible sans
 * compte) : mémorisé 30 jours en cookie et dans le compte.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }
  await acceptAdultGate();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
