import { NextResponse } from "next/server";
import { acceptAdultGate } from "@/lib/auth";

/**
 * POST /api/adult/accept — validation de la porte +18 (§11).
 * Visiteur : cookie 30 jours. Membre : mémorisé aussi dans le compte.
 */
export async function POST() {
  await acceptAdultGate();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
