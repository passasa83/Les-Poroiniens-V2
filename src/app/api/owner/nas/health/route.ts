import { guardNas } from "../guard";
import { nasHealth } from "@/lib/nas";

export const runtime = "nodejs";

/**
 * GET /api/owner/nas/health — état du NAS pour l'espace Gérant (§9.1) :
 * disponibilité, temps de réponse et espace disque libre.
 */
export async function GET(request: Request) {
  const guard = await guardNas(request);
  if (!guard.ok) return guard.response;

  const health = await nasHealth();
  return Response.json({ ...health, time: new Date().toISOString() });
}
