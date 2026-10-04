import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

/**
 * Contrôle anti path traversal (§14.7) : ni `..`, ni antislash, ni disque
 * local, ni octet nul. Le chemin est ensuite encodé dans l'URL du NAS.
 */
function isSafePath(value: string): boolean {
  if (!value || value.length > 500) return false;
  if (value.includes("\0")) return false;
  if (value.includes("\\")) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  if (value.split("/").some((seg) => seg === "..")) return false;
  return true;
}

/**
 * GET /api/owner/nas/list?path= — listing d'un dossier du NAS (Gérant).
 * Le NAS n'est jamais exposé directement : l'appel part du serveur, avec la
 * clé d'API, un timeout et un chemin normalisé.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "import_chapters")) {
    return jsonError("Accès au NAS réservé au Gérant.", "owner_only", 403);
  }

  const ip = clientIp(request);
  const limit = rateLimit(`owner:nas:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const base = process.env.NAS_API_URL;
  if (!base) {
    return jsonError(
      "Le NAS n'est pas configuré : renseignez la variable NAS_API_URL.",
      "nas_unconfigured",
      502,
    );
  }

  const rawPath = new URL(request.url).searchParams.get("path") ?? "";
  const path = rawPath.trim();
  if (!isSafePath(path)) {
    return jsonError("Chemin refusé (validation anti traversal).", "invalid_path", 400);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.NAS_API_KEY;
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers["X-Api-Key"] = key;
  }

  const url = `${base.replace(/\/+$/, "")}/list?path=${encodeURIComponent(path)}`;

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return jsonError(
        `Le NAS a répondu ${res.status}.`,
        "nas_error",
        502,
      );
    }
    const data = (await res.json()) as unknown;
    return Response.json({ path, entries: data });
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Délai dépassé auprès du NAS."
        : "Impossible de joindre l'API du NAS.";
    return jsonError(message, "nas_unreachable", 502);
  }
}
