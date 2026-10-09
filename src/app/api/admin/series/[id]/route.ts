import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/data/moderation";
import { purgeImageErrors } from "@/lib/data/image-errors";
import { deleteSeries, getSeriesById, getSeriesBySlug, saveSeries } from "@/lib/data/series";
import { getDb, TABLES } from "@/lib/db";
import type { Series } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

function listField(maxItems: number, maxLen: number) {
  return z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : value,
    z.array(z.string().trim().min(1).max(maxLen)).max(maxItems),
  );
}

const patchInput = z.object({
  titre: z.string().trim().min(1).max(200).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Slug invalide (lettres minuscules, chiffres et tirets).")
    .optional(),
  titresAlt: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  synopsis: z.string().max(8000).optional(),
  couverture: z.string().trim().max(500).optional(),
  banniere: z.string().trim().max(500).optional(),
  statut: z
    .enum(["en_cours", "termine", "hiatus", "abandonne", "archive"])
    .optional(),
  type: z.enum(["manga", "manhwa", "manhua", "light_novel"]).optional(),
  unite: z.enum(["chapitre", "tome"]).optional(),
  annee: z.number().int().min(1900).max(2100).nullable().optional(),
  langue: z.string().trim().min(2).max(10).optional(),
  classification: z.enum(["all", "adult"]).optional(),
  genres: listField(20, 60).optional(),
  tags: listField(40, 60).optional(),
  auteurs: listField(10, 120).optional(),
});

function snapshot(series: Series): Record<string, unknown> {
  return {
    titre: series.titre,
    slug: series.slug,
    statut: series.statut,
    type: series.type,
    unite: series.unite ?? "chapitre",
    classification: series.classification,
    annee: series.annee,
    langue: series.langue,
    couverture: series.couverture,
    banniere: series.banniere,
    synopsis: series.synopsis,
    titresAlt: series.titresAlt,
    genres: series.genres,
    tags: series.tags,
    auteurs: series.auteurs,
  };
}

/** PATCH /api/admin/series/[id] — édition de la fiche (admin+). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "edit_series")) {
    return jsonError("Réservé aux administrateurs.", "forbidden", 403);
  }

  const limit = rateLimit(`admin:series:patch:${clientIp(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const existing = await getSeriesById(id);
  if (!existing) return jsonError("Série introuvable.", "not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }

  const parsed = patchInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Champs invalides.",
      "invalid_body",
      400,
    );
  }

  const patch = parsed.data;
  if (patch.slug && patch.slug !== existing.slug) {
    const clash = await getSeriesBySlug(patch.slug, { includeArchived: true });
    if (clash && clash.id !== id) {
      return jsonError("Ce slug est déjà utilisé.", "slug_taken", 409);
    }
  }

  const series = await saveSeries({ ...(patch as Partial<Series>), id });

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: "series.update",
    cible: `series:${id}`,
    avant: snapshot(existing),
    apres: snapshot(series),
    ip: clientIp(request),
  });

  return Response.json({ series });
}

/** DELETE /api/admin/series/[id] — suppression de la fiche et de ses chapitres (admin+). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "edit_series")) {
    return jsonError("Réservé aux administrateurs.", "forbidden", 403);
  }

  const limit = rateLimit(`admin:series:delete:${clientIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const existing = await getSeriesById(id);
  if (!existing) return jsonError("Série introuvable.", "not_found", 404);

  const db = getDb();
  const { items: chapters } = await db.list<{ id: string }>(TABLES.chapters, {
    filters: [{ field: "series_id", op: "eq", value: id }],
    limit: 5000,
  });
  for (const chapter of chapters) {
    const { items: pages } = await db.list<{ id: string }>(TABLES.pages, {
      filters: [{ field: "chapter_id", op: "eq", value: chapter.id }],
      limit: 5000,
    });
    for (const page of pages) await db.remove(TABLES.pages, page.id);
    await db.remove(TABLES.chapters, chapter.id);
    await purgeImageErrors(chapter.id);
  }

  const { items: recos } = await db.list<{ id: string }>(TABLES.recommendations, {
    filters: [{ field: "series_id", op: "eq", value: id }],
    limit: 200,
  });
  for (const reco of recos) await db.remove(TABLES.recommendations, reco.id);

  await deleteSeries(id);

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: "series.delete",
    cible: `series:${id}`,
    avant: snapshot(existing),
    apres: null,
    ip: clientIp(request),
  });

  return Response.json({ ok: true, deletedChapters: chapters.length });
}
