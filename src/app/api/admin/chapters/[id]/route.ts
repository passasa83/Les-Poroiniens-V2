import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { atLeast, can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/data/moderation";
import { getChapterById, saveChapter } from "@/lib/data/chapters";
import { getDb, TABLES } from "@/lib/db";
import type { Chapter } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

/**
 * Les lignes stockées en base portent les noms SQL (`series_id`, `nb_pages`)
 * alors que le type public `Chapter` utilise le camelCase : on lit les deux.
 */
type ChapterRow = Chapter & { series_id: string; nb_pages: number };

const patchInput = z.object({
  statut: z.enum(["draft", "scheduled", "published"]).optional(),
  publish_at: z.string().datetime({ offset: true }).nullable().optional(),
  titre: z.string().trim().max(200).optional(),
  numero: z.number().int().min(1).max(100000).optional(),
  classification: z.enum(["all", "adult"]).optional(),
});

/**
 * Matrice 4.3 : la lecture est ouverte aux admins, mais la publication,
 * la dépublication, la planification et la suppression d'un chapitre sont
 * réservées au Gérant — même les administrateurs n'y ont pas accès.
 */
async function requireOwner(): Promise<{ ok: true } | { ok: false; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: jsonError("Authentification requise.", "unauthorized", 401) };
  if (!can(user.role, "publish_chapter")) {
    return {
      ok: false,
      response: jsonError(
        "Publication des chapitres réservée au Gérant.",
        "owner_only",
        403,
      ),
    };
  }
  return { ok: true };
}

/** GET /api/admin/chapters/[id] — lecture (admin+). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!atLeast(user.role, "admin")) return jsonError("Réservé aux administrateurs.", "forbidden", 403);

  const chapter = (await getChapterById(id)) as ChapterRow | null;
  if (!chapter) return jsonError("Chapitre introuvable.", "not_found", 404);
  const { total } = await getDb().list(TABLES.pages, {
    filters: [{ field: "chapter_id", op: "eq", value: id }],
    limit: 1,
  });
  return Response.json({ chapter, nbPages: total });
}

/** PATCH /api/admin/chapters/[id] — statut, planification, métadonnées (Gérant). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const user = (await getCurrentUser())!;

  const limit = rateLimit(`admin:chapters:patch:${clientIp(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const existing = (await getChapterById(id)) as ChapterRow | null;
  if (!existing) return jsonError("Chapitre introuvable.", "not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }
  const parsed = patchInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }

  const patch = parsed.data;
  const data: Record<string, unknown> = { ...patch };

  if (patch.statut === "scheduled") {
    if (!patch.publish_at && !existing.publish_at) {
      return jsonError("Une date de publication est requise.", "publish_at_required", 400);
    }
    const when = new Date(patch.publish_at ?? existing.publish_at ?? "");
    if (Number.isNaN(when.getTime())) {
      return jsonError("Date de publication invalide.", "invalid_publish_at", 400);
    }
    data.publish_at = when.toISOString();
  }
  if (patch.statut === "published") {
    // Publication immédiate : la date devient maintenant si elle était vide/pas encore atteinte.
    const current = existing.publish_at ? new Date(existing.publish_at).getTime() : 0;
    data.publish_at = current && current <= Date.now() ? existing.publish_at : new Date().toISOString();
  }
  if (patch.publish_at === null && patch.statut === undefined) {
    // Simple retrait de la date de planification (zod a déjà validé le format).
    data.publish_at = null;
  }
  if (patch.numero && patch.numero !== existing.numero) {
    const { total } = await getDb().list(TABLES.chapters, {
      filters: [
        { field: "series_id", op: "eq", value: existing.series_id },
        { field: "numero", op: "eq", value: patch.numero },
      ],
      limit: 1,
    });
    if (total > 0) {
      return jsonError("Un chapitre porte déjà ce numéro.", "chapter_exists", 409);
    }
  }

  const chapter = await saveChapter({ ...(data as unknown as Partial<Chapter>), id });

  const action =
    chapter.statut === "published" && existing.statut !== "published"
      ? "chapter.publish"
      : chapter.statut !== "published" && existing.statut === "published"
        ? "chapter.unpublish"
        : chapter.statut === "scheduled"
          ? "chapter.schedule"
          : "chapter.update";

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action,
    cible: `chapter:${id}`,
    avant: {
      statut: existing.statut,
      publish_at: existing.publish_at,
      titre: existing.titre,
      numero: existing.numero,
      classification: existing.classification,
    },
    apres: {
      statut: chapter.statut,
      publish_at: chapter.publish_at,
      titre: chapter.titre,
      numero: chapter.numero,
      classification: chapter.classification,
    },
    ip: clientIp(request),
  });

  return Response.json({ chapter });
}

/** DELETE /api/admin/chapters/[id] — suppression (Gérant). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const user = (await getCurrentUser())!;

  const limit = rateLimit(`admin:chapters:delete:${clientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const existing = (await getChapterById(id)) as ChapterRow | null;
  if (!existing) return jsonError("Chapitre introuvable.", "not_found", 404);

  const db = getDb();
  const { items: pages } = await db.list<{ id: string }>(TABLES.pages, {
    filters: [{ field: "chapter_id", op: "eq", value: id }],
    limit: 5000,
  });
  for (const page of pages) await db.remove(TABLES.pages, page.id);
  await db.remove(TABLES.chapters, id);

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: "chapter.delete",
    cible: `chapter:${id}`,
    avant: {
      numero: existing.numero,
      statut: existing.statut,
      nb_pages: existing.nb_pages,
      series_id: existing.series_id,
    },
    apres: null,
    ip: clientIp(request),
  });

  return Response.json({ ok: true, deletedPages: pages.length });
}
