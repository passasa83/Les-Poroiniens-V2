import { jsonError } from "../nas/guard";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export { jsonError };

/**
 * Garde commune des routes ImgChest côté Gérant : session, rôle
 * `import_chapters` et quota par IP. Aucune clé ne transite vers le
 * navigateur — la résolution des albums se fait toujours ici.
 */
export async function guardImgChest(
  request: Request,
  budget: { limit: number; windowMs: number } = { limit: 30, windowMs: 60_000 },
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: jsonError("Authentification requise.", "unauthorized", 401) };
  }
  if (!can(user.role, "import_chapters")) {
    return { ok: false, response: jsonError("Accès réservé au Gérant.", "owner_only", 403) };
  }
  const limit = rateLimit(`owner:imgchest:${clientIp(request)}`, budget);
  if (!limit.ok) {
    return { ok: false, response: jsonError("Trop de requêtes.", "rate_limited", 429) };
  }
  return { ok: true };
}
