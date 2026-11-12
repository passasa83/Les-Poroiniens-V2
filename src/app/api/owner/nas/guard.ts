import { nasConfigured } from "@/lib/nas";
import { fail, route, type RouteContext } from "@/server/http";

type NasContext = RouteContext<Record<string, string>, "import_chapters", undefined>;

/**
 * Route NAS de l'espace Gérant : session, droit `import_chapters`, quota par
 * IP et présence de `NAS_API_BASE` (jamais d'appel direct depuis le navigateur).
 */
export function nasRoute(
  handler: (ctx: NasContext) => Promise<Response>,
  budget: { limit: number; windowMs: number } = { limit: 60, windowMs: 60_000 },
) {
  return route(
    {
      auth: "import_chapters",
      forbidden: "Accès au NAS réservé au Gérant.",
      rateLimit: { key: "owner:nas", ...budget, message: "Trop de requêtes." },
    },
    async (ctx) => {
      if (!nasConfigured()) {
        fail(
          502,
          "Le NAS n'est pas configuré : renseignez la variable NAS_API_BASE.",
          "nas_unconfigured",
        );
      }
      return handler(ctx);
    },
  );
}
