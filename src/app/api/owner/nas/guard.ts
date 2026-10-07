import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { nasConfigured } from "@/lib/nas";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export function jsonError(
  error: string,
  code: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ error, code, ...(extra ?? {}) }, { status });
}

/**
 * Garde commune des routes NAS côté Gérant : session, rôle `import_chapters`,
 * quota par IP et présence de `NAS_API_BASE` (jamais d'appel direct
 * depuis le navigateur).
 */
export async function guardNas(
  request: Request,
  budget: { limit: number; windowMs: number } = { limit: 60, windowMs: 60_000 },
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: jsonError("Authentification requise.", "unauthorized", 401) };
  if (!can(user.role, "import_chapters")) {
    return { ok: false, response: jsonError("Accès au NAS réservé au Gérant.", "owner_only", 403) };
  }
  const limit = rateLimit(`owner:nas:${clientIp(request)}`, budget);
  if (!limit.ok) {
    return {
      ok: false,
      response: jsonError("Trop de requêtes.", "rate_limited", 429, {
        retryAfter: limit.retryAfter,
      }),
    };
  }
  if (!nasConfigured()) {
    return {
      ok: false,
      response: jsonError(
        "Le NAS n'est pas configuré : renseignez la variable NAS_API_BASE.",
        "nas_unconfigured",
        502,
      ),
    };
  }
  return { ok: true };
}
