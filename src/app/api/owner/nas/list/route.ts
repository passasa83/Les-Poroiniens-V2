import { jsonError, guardNas } from "../guard";
import { isSafePath, nasErrorMessage, nasTree } from "@/lib/nas";

export const runtime = "nodejs";

/**
 * GET /api/owner/nas/list?path= — arborescence d'un dossier du NAS (Gérant).
 *
 * L'appel part du serveur avec les identifiants Cloudflare Access / la clé
 * d'API : `api-img.` n'est jamais joignable depuis le navigateur (§4.3).
 * La réponse est normalisée ici pour que l'interface n'affiche que
 * `{ name, isDir }`, sans détail technique du NAS.
 */
export async function GET(request: Request) {
  const guard = await guardNas(request);
  if (!guard.ok) return guard.response;

  const rawPath = new URL(request.url).searchParams.get("path") ?? "";
  const path = rawPath.trim();
  if (path && !isSafePath(path)) {
    return jsonError("Chemin refusé (validation anti traversal).", "invalid_path", 400);
  }

  try {
    const tree = await nasTree(path);
    return Response.json({
      path: tree.path,
      entries: tree.entries.map((entry) => ({ name: entry.name, isDir: entry.isDir })),
    });
  } catch (err) {
    return jsonError(nasErrorMessage(err), "nas_error", 502);
  }
}
