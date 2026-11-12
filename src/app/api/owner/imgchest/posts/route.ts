import { imgchestRoute } from "../guard";
import { fail } from "@/server/http";
import { imgchestErrorMessage, imgchestListPosts } from "@/lib/imgchest";

export const runtime = "nodejs";

/**
 * GET /api/owner/imgchest/posts?page= — albums récents du compte (Gérant).
 *
 * Sert à choisir l'album qui correspond au chapitre importé : la liste est
 * récupérée côté serveur avec les identifiants du compte, puis mise en cache
 * une heure pour ne pas marteler ImgChest pendant la navigation.
 */
export const GET = imgchestRoute(async ({ searchParams }) => {
  const rawPage = searchParams.get("page") ?? "1";
  const page = Number(rawPage);
  if (!Number.isFinite(page) || page < 1 || page > 50) {
    fail(400, "Page invalide.", "invalid_page");
  }

  try {
    const result = await imgchestListPosts(page);
    return Response.json(result, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    fail(502, imgchestErrorMessage(err), "imgchest_error");
  }
});
