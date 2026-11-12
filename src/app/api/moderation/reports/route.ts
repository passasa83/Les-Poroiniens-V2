import { listReports } from "@/lib/data/moderation";
import type { Report } from "@/lib/types";
import { route } from "@/server/http";

export const runtime = "nodejs";

const STATUTS: Report["statut"][] = ["ouvert", "traite", "rejete"];

/** GET /api/moderation/reports — file de signalements (modo+). */
export const GET = route(
  {
    auth: "moderate",
    forbidden: "Réservé aux modérateurs.",
    rateLimit: {
      key: "moderation:reports:get",
      limit: 120,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
  },
  async ({ request }) => {
    const statutParam = new URL(request.url).searchParams.get("statut");
    const statut = STATUTS.includes(statutParam as Report["statut"])
      ? (statutParam as Report["statut"])
      : undefined;

    const items = await listReports(statut);
    return Response.json({ items, total: items.length });
  },
);
