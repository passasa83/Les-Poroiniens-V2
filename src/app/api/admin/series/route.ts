import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/data/moderation";
import { getSeriesBySlug, saveSeries } from "@/lib/data/series";
import type { Series } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

/** Une liste peut arriver soit en tableau, soit en chaîne séparée par des virgules. */
function listField(maxItems: number, maxLen: number) {
  return z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : value,
    z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).default([]),
  );
}

const serieInput = z.object({
  titre: z.string().trim().min(1).max(200),
  titresAlt: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  synopsis: z.string().max(8000).default(""),
  couverture: z.string().trim().max(500).default(""),
  banniere: z.string().trim().max(500).default(""),
  statut: z.enum(["en_cours", "termine", "hiatus", "abandonne"]).default("en_cours"),
  type: z.enum(["manga", "manhwa", "manhua"]).default("manga"),
  /** Chapitres (défaut) ou tomes : pilote les libellés sur tout le site. */
  unite: z.enum(["chapitre", "tome"]).default("chapitre"),
  annee: z.number().int().min(1900).max(2100).nullable().default(null),
  langue: z.string().trim().min(2).max(10).default("FR"),
  classification: z.enum(["all", "adult"]).default("all"),
  genres: listField(20, 60),
  tags: listField(40, 60),
  auteurs: listField(10, 120),
});

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "serie"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  // Les séries archivées conservent leur slug : il reste réservé (index unique).
  while (await getSeriesBySlug(slug, { includeArchived: true })) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

/** POST /api/admin/series — création d'une fiche série (admin+). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "edit_series")) {
    return jsonError("Réservé aux administrateurs.", "forbidden", 403);
  }

  const limit = rateLimit(`admin:series:create:${clientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return jsonError("Trop de requêtes, réessayez plus tard.", "rate_limited", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }

  const parsed = serieInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Champs invalides.",
      "invalid_body",
      400,
    );
  }

  const data = parsed.data;
  const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = await uniqueSlug(slugify(data.titre));

  const series = await saveSeries({
    id,
    slug,
    ...data,
    noteMoy: 0,
    nbVotes: 0,
    vues: 0,
    populaire: 0,
  } as Partial<Series> & { id: string });

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: "series.create",
    cible: `series:${series.id}`,
    apres: { titre: series.titre, slug: series.slug, classification: series.classification },
    ip: clientIp(request),
  });

  return Response.json({ series }, { status: 201 });
}
