import { jsonError, guardImgChest } from "../guard";
import { imgchestErrorMessage, imgchestListPosts } from "@/lib/imgchest";

export const runtime = "nodejs";

/**
 * GET /api/owner/imgchest/posts?page= — albums récents du compte (Gérant).
 *
 * Sert à choisir l'album qui correspond au chapitre importé : la liste est
 * récupérée côté serveur avec les identifiants du compte, puis mise en cache
 * une heure pour ne pas marteler ImgChest pendant la navigation.
 */
export async function GET(request: Request) {
  const guard = await guardImgChest(request);
  if (!guard.ok) return guard.response;

  const rawPage = new URL(request.url).searchParams.get("page") ?? "1";
  const page = Number(rawPage);
  if (!Number.isFinite(page) || page < 1 || page > 50) {
    return jsonError("Page invalide.", "invalid_page", 400);
  }

  try {
    const result = await imgchestListPosts(page);
    return Response.json(result, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    return jsonError(imgchestErrorMessage(err), "imgchest_error", 502);
  }
}
