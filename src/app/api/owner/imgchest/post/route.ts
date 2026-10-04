import { jsonError, guardImgChest } from "../guard";
import { imgchestErrorMessage, imgchestPost } from "@/lib/imgchest";

export const runtime = "nodejs";

/**
 * GET /api/owner/imgchest/post?id= — aperçu d'un album avant import.
 *
 * Renvoie uniquement le nécessaire pour confirmer le choix (titre, nombre de
 * pages, dimensions totales) : les URLs CDN restent serveur jusqu'à l'import.
 */
export async function GET(request: Request) {
  const guard = await guardImgChest(request);
  if (!guard.ok) return guard.response;

  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return jsonError("Identifiant d'album manquant.", "invalid_id", 400);

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
    return jsonError(imgchestErrorMessage(err), "imgchest_error", 502);
  }
}
