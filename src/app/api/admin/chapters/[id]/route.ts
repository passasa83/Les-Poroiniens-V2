import { z } from "zod";
import { audit } from "@/lib/data/moderation";
import {
  deleteChapterCascade,
  getChapterById,
  refreshSeriesChapterCount,
  saveChapter,
} from "@/lib/data/chapters";
import { getDb, TABLES } from "@/server/db";
import { transitionChapterFiles, type FileTransition } from "@/lib/publishing";
import type { Chapter } from "@/lib/types";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

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
  teams: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

/** GET /api/admin/chapters/[id] — lecture (admin+). */
export const GET = route(
  {
    auth: "admin_area",
    forbidden: "Réservé aux administrateurs.",
  },
  async ({ params }) => {
    const { id } = params;
    const chapter = (await getChapterById(id)) as ChapterRow | null;
    if (!chapter) fail(404, "Chapitre introuvable.", "not_found");
    const { total } = await getDb().list(TABLES.pages, {
      filters: [{ field: "chapter_id", op: "eq", value: id }],
      limit: 1,
    });
    return Response.json({ chapter, nbPages: total });
  },
);

/** PATCH /api/admin/chapters/[id] — statut, planification, métadonnées (Gérant). */
export const PATCH = route(
  {
    auth: "publish_chapter",
    forbidden: "Publication des chapitres réservée au Gérant.",
    rateLimit: {
      key: "admin:chapters:patch",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
    body: patchInput,
    invalidBody: "issue",
  },
  async ({ params, user, body, ip }) => {
    const { id } = params;
    const existing = (await getChapterById(id)) as ChapterRow | null;
    if (!existing) fail(404, "Chapitre introuvable.", "not_found");

    const patch = body;
    const data: Partial<Chapter> = { ...patch };

    if (patch.statut === "scheduled") {
      if (!patch.publish_at && !existing.publish_at) {
        fail(400, "Une date de publication est requise.", "publish_at_required");
      }
      const when = new Date(patch.publish_at ?? existing.publish_at ?? "");
      if (Number.isNaN(when.getTime())) {
        fail(400, "Date de publication invalide.", "invalid_publish_at");
      }
      data.publish_at = when.toISOString();
    }
    if (patch.statut === "published") {
      // Publication immédiate : la date devient maintenant si elle était vide/pas encore atteinte.
      const current = existing.publish_at ? new Date(existing.publish_at).getTime() : 0;
      data.publish_at =
        current && current <= Date.now() ? existing.publish_at : new Date().toISOString();
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
        fail(409, "Un chapitre porte déjà ce numéro.", "chapter_exists");
      }
    }

    const chapter = await saveChapter({ ...data, id });

    const action =
      chapter.statut === "published" && existing.statut !== "published"
        ? "chapter.publish"
        : chapter.statut !== "published" && existing.statut === "published"
          ? "chapter.unpublish"
          : chapter.statut === "scheduled"
            ? "chapter.schedule"
            : "chapter.update";

    // Passage `staging/` ↔ `public/` + purge ciblée (étape 5).
    let nas: FileTransition | undefined;
    if (action === "chapter.publish") nas = await transitionChapterFiles(chapter, "publish");
    if (action === "chapter.unpublish") nas = await transitionChapterFiles(chapter, "unpublish");

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
        teams: (existing as { teams?: string[] }).teams ?? [],
      },
      apres: {
        statut: chapter.statut,
        publish_at: chapter.publish_at,
        titre: chapter.titre,
        numero: chapter.numero,
        classification: chapter.classification,
        teams: chapter.teams ?? [],
        ...(nas ? { nasMove: nas.action, nasError: nas.error ?? null } : {}),
      },
      ip,
    });

    return Response.json({ chapter, ...(nas ? { nas } : {}) });
  },
);

/** DELETE /api/admin/chapters/[id] — suppression (Gérant). */
export const DELETE = route(
  {
    auth: "publish_chapter",
    forbidden: "Publication des chapitres réservée au Gérant.",
    rateLimit: {
      key: "admin:chapters:delete",
      limit: 30,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
  },
  async ({ params, user, ip }) => {
    const { id } = params;
    const existing = (await getChapterById(id)) as ChapterRow | null;
    if (!existing) fail(404, "Chapitre introuvable.", "not_found");

    const deletedPages = await deleteChapterCascade(id);
    await refreshSeriesChapterCount(existing.series_id);

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
      ip,
    });

    return Response.json({ ok: true, deletedPages });
  },
);
