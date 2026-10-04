import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { listReports } from "@/lib/data/moderation";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

const STATUTS: Report["statut"][] = ["ouvert", "traite", "rejete"];

/** GET /api/moderation/reports — file de signalements (modo+). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "moderate")) {
    return jsonError("Réservé aux modérateurs.", "forbidden", 403);
  }

  const limit = rateLimit(`moderation:reports:get:${clientIp(request)}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const statutParam = new URL(request.url).searchParams.get("statut");
  const statut = STATUTS.includes(statutParam as Report["statut"])
    ? (statutParam as Report["statut"])
    : undefined;

  const items = await listReports(statut);
  return Response.json({ items, total: items.length });
}
