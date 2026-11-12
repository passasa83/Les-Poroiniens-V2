import { nasRoute } from "../guard";
import { nasHealth } from "@/lib/nas";

export const runtime = "nodejs";

/**
 * GET /api/owner/nas/health — état du NAS pour l'espace Gérant :
 * disponibilité, temps de réponse et espace disque libre.
 */
export const GET = nasRoute(async () => {
  const health = await nasHealth();
  return Response.json({ ...health, time: new Date().toISOString() });
});
