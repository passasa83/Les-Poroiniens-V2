import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  fetchChapterRawText,
  getChapterById,
  invalidateChapterContent,
  lnContentPath,
  saveChapter,
} from "@/lib/data/chapters";
import { audit } from "@/lib/data/moderation";
import { getSeriesById } from "@/lib/data/series";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { atLeast, can } from "@/lib/roles";
import { NasError, nasUpload } from "@/lib/nas";
import type { Chapter, Series } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

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
async function loadContext(id: string) {
  const chapter = (await getChapterById(id)) as (Chapter & { series_id: string }) | null;
  if (!chapter) return { error: jsonError("Chapitre introuvable.", "not_found", 404) };
  const series = await getSeriesById(chapter.series_id);
  if (!series) return { error: jsonError("Série introuvable.", "not_found", 404) };
  if (series.type !== "light_novel") {
    return {
      error: jsonError("Ce chapitre n'est pas un light novel.", "not_light_novel", 400),
    };
  }
  return { chapter, series };
}

/**
 * GET /api/admin/chapters/[id]/content — texte brut à pré-remplir dans
 * l'éditeur (admin+, comme la lecture d'une ligne `chapters`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!atLeast(user.role, "admin")) return jsonError("Réservé aux administrateurs.", "forbidden", 403);

  const loaded = await loadContext(id);
  if ("error" in loaded) return loaded.error;
  const { chapter } = loaded;

  const texte = await fetchChapterRawText(chapter);
  return Response.json({
    texte: texte ?? "",
    chemin: (chapter.contenu_chemin ?? "").trim() || null,
    series_id: chapter.series_id,
    numero: chapter.numero,
  });
}

/**
 * PUT /api/admin/chapters/[id]/content — écriture du texte (Gérant).
 * Écrit sur le NAS (création ou écrasement du fichier de ce chapitre),
 * met à jour `chapters.contenu_chemin` et purge le cache de lecture.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "publish_chapter")) {
    return jsonError("Édition de chapitres réservée au Gérant.", "owner_only", 403);
  }

  const limit = rateLimit(`admin:chapters:content:${clientIp(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }
  const parsed = putInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }

  const loaded = await loadContext(id);
  if ("error" in loaded) return loaded.error;
  const { chapter, series } = loaded as { chapter: Chapter & { series_id: string }; series: Series };

  const avant = (chapter.contenu_chemin ?? "").trim() || null;
  const chemin = lnContentPath(series, chapter.numero);
  try {
    await nasUpload(chemin, parsed.data.texte, { overwrite: true });
  } catch (err) {
    const message =
      err instanceof NasError
        ? err.code === "unconfigured"
          ? "API du NAS non configurée (NAS_API_BASE)."
          : err.message
        : "Écriture du fichier texte impossible.";
    return jsonError(message, "nas_upload_failed", 502);
  }

  await saveChapter({ id, contenu_chemin: chemin });
  invalidateChapterContent(id);

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: "chapter.content",
    cible: `chapter:${id}`,
    avant: { contenu_chemin: avant, caracteres: null },
    apres: { contenu_chemin: chemin, caracteres: parsed.data.texte.length },
    ip: clientIp(request),
  });

  return Response.json({ ok: true, chemin });
}
