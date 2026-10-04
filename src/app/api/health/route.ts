import { NextResponse } from "next/server";
import { dataMode } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Health check public et minimal (§14.1) : aucun secret, aucune configuration,
 * aucune donnée interne n'est exposée — seulement le mode de données, l'uptime
 * du process et l'horloge serveur.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      mode: dataMode(),
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
