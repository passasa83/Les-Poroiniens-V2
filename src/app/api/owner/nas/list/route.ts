import { nasRoute } from "../guard";
import { fail } from "@/server/http";
import { isSafePath, nasErrorMessage, nasTree } from "@/lib/nas";

export const runtime = "nodejs";

/**
 * GET /api/owner/nas/list?path= — arborescence d'un dossier du NAS (Gérant).
 *
 * L'appel part du serveur avec les identifiants Cloudflare Access / la clé
 * d'API : `api-img.` n'est jamais joignable depuis le navigateur.
 * La réponse est normalisée ici pour que l'interface n'affiche que
 * `{ name, isDir }`, sans détail technique du NAS.
 */
export const GET = nasRoute(async ({ searchParams }) => {
  const rawPath = searchParams.get("path") ?? "";
  const path = rawPath.trim();
  if (path && !isSafePath(path)) {
    fail(400, "Chemin refusé (validation anti traversal).", "invalid_path");
  }

  try {
    const tree = await nasTree(path);
    return Response.json({
      path: tree.path,
      entries: tree.entries.map((entry) => ({ name: entry.name, isDir: entry.isDir })),
    });
  } catch (err) {
    fail(502, nasErrorMessage(err), "nas_error");
  }
});
