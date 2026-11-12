import { z } from "zod";
import {
  fetchChapterRawText,
  getChapterById,
  invalidateChapterContent,
  lnContentPath,
  saveChapter,
} from "@/lib/data/chapters";
import { audit } from "@/lib/data/moderation";
import { getSeriesById } from "@/lib/data/series";
import { NasError, nasUpload } from "@/lib/nas";
import type { Chapter, Series } from "@/lib/types";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

/** Garde-fou aligné sur le poids du `.txt` téléversable (2 Mo côté NAS). */
const LN_TEXT_MAX = 1_900_000;

const putInput = z.object({
  texte: z
    .string()
    .max(LN_TEXT_MAX)
    .refine((v) => v.trim().length > 0, "Le texte ne peut pas être vide."),
});

/**
 * Lecture / écriture du texte d'un chapitre light novel (interface Gérant).
 * Le fichier vit sur le NAS (`<Série>/Chapitre 1.txt`) : ces routes sont les
 * seuls chemins d'écriture, le lecteur public ne fait que lire via CDN.
 */
async function loadContext(id: string): Promise<{ chapter: Chapter; series: Series }> {
  const chapter = await getChapterById(id);
  if (!chapter) fail(404, "Chapitre introuvable.", "not_found");
  const series = await getSeriesById(chapter.series_id);
  if (!series) fail(404, "Série introuvable.", "not_found");
  if (series.type !== "light_novel") {
    fail(400, "Ce chapitre n'est pas un light novel.", "not_light_novel");
  }
  return { chapter, series };
}

/**
 * GET /api/admin/chapters/[id]/content — texte brut à pré-remplir dans
 * l'éditeur (admin+, comme la lecture d'une ligne `chapters`).
 */
export const GET = route(
  {
    auth: "admin_area",
    forbidden: "Réservé aux administrateurs.",
  },
  async ({ params }) => {
    const { id } = params;
    const { chapter } = await loadContext(id);

    const texte = await fetchChapterRawText(chapter);
    return Response.json({
      texte: texte ?? "",
      chemin: (chapter.contenu_chemin ?? "").trim() || null,
      series_id: chapter.series_id,
      numero: chapter.numero,
    });
  },
);

/**
 * PUT /api/admin/chapters/[id]/content — écriture du texte (Gérant).
 * Écrit sur le NAS (création ou écrasement du fichier de ce chapitre),
 * met à jour `chapters.contenu_chemin` et purge le cache de lecture.
 */
export const PUT = route(
  {
    auth: "publish_chapter",
    forbidden: "Édition de chapitres réservée au Gérant.",
    rateLimit: {
      key: "admin:chapters:content",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
    body: putInput,
    invalidBody: "issue",
  },
  async ({ params, user, body, ip }) => {
    const { id } = params;
    const { chapter, series } = await loadContext(id);

    const avant = (chapter.contenu_chemin ?? "").trim() || null;
    const chemin = lnContentPath(series, chapter.numero);
    try {
      await nasUpload(chemin, body.texte, { overwrite: true });
    } catch (err) {
      const message =
        err instanceof NasError
          ? err.code === "unconfigured"
            ? "API du NAS non configurée (NAS_API_BASE)."
            : err.message
          : "Écriture du fichier texte impossible.";
      fail(502, message, "nas_upload_failed");
    }

    await saveChapter({ id, contenu_chemin: chemin });
    invalidateChapterContent(id);

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "chapter.content",
      cible: `chapter:${id}`,
      avant: { contenu_chemin: avant, caracteres: null },
      apres: { contenu_chemin: chemin, caracteres: body.texte.length },
      ip,
    });

    return Response.json({ ok: true, chemin });
  },
);
