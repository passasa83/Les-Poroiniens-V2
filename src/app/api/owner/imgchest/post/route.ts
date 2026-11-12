import { imgchestRoute } from "../guard";
import { fail } from "@/server/http";
import { imgchestErrorMessage, imgchestPost } from "@/lib/imgchest";

export const runtime = "nodejs";

/**
 * GET /api/owner/imgchest/post?id= — aperçu d'un album avant import.
 *
 * Renvoie uniquement le nécessaire pour confirmer le choix (titre, nombre de
 * pages, dimensions totales) : les URLs CDN restent serveur jusqu'à l'import.
 */
export const GET = imgchestRoute(async ({ searchParams }) => {
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) fail(400, "Identifiant d'album manquant.", "invalid_id");

  try {
    const post = await imgchestPost(id);
    return Response.json({
      id: post.id,
      title: post.title,
      views: post.views,
      nsfw: post.nsfw,
      count: post.files.length,
      bytes: post.files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
    });
  } catch (err) {
    fail(502, imgchestErrorMessage(err), "imgchest_error");
  }
});
