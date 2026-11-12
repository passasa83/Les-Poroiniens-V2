import { route, type RouteContext } from "@/server/http";

type ImgChestContext = RouteContext<Record<string, string>, "import_chapters", undefined>;

/**
 * Route ImgChest de l'espace Gérant : session, droit `import_chapters` et
 * quota par IP. Aucune clé ne transite vers le navigateur — la résolution des
 * albums se fait toujours ici.
 */
export function imgchestRoute(
  handler: (ctx: ImgChestContext) => Promise<Response>,
  budget: { limit: number; windowMs: number } = { limit: 30, windowMs: 60_000 },
) {
  return route(
    {
      auth: "import_chapters",
      forbidden: "Accès réservé au Gérant.",
      rateLimit: { key: "owner:imgchest", ...budget, message: "Trop de requêtes." },
    },
    handler,
  );
}
