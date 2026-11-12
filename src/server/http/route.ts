import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { can, type Permission } from "@/lib/roles";
import type { CurrentUser } from "@/lib/types";
import { clientIp, rateLimit } from "./rate-limit";

/* ── Erreurs HTTP ────────────────────────────────────────────────────── */

/**
 * Erreur métier levée par un handler : convertie par `route()` en réponse
 * JSON `{ error, code, ...extra }` avec le statut voulu.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Interrompt le handler avec une réponse d'erreur. */
export function fail(
  status: number,
  message: string,
  code: string,
  extra?: Record<string, unknown>,
): never {
  throw new HttpError(status, message, code, extra);
}

export function errorResponse(
  status: number,
  message: string,
  code: string,
  extra?: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  return Response.json({ error: message, code, ...(extra ?? {}) }, { status, headers });
}

/* ── Définition de route ─────────────────────────────────────────────── */

type Auth = "public" | "optional" | "user" | Permission;

type UserFor<A extends Auth> = A extends "public"
  ? null
  : A extends "optional"
    ? CurrentUser | null
    : CurrentUser;

export interface RateLimitRule {
  /** Préfixe de la clé de quota (ex. `comment`). */
  key: string;
  limit: number;
  windowMs: number;
  /** Portée du quota : adresse IP (défaut), compte, ou les deux. */
  by?: "ip" | "user" | "ip+user";
  message?: string;
}

export interface RouteOptions<A extends Auth, B> {
  /**
   * `public` (défaut) : aucune session lue, `user` vaut null.
   * `optional` : session lue si présente (`user` peut être null).
   * `user` : connexion requise. Une permission : connexion + droit requis.
   */
  auth?: A;
  /** Message 401 (défaut « Authentification requise. »). */
  unauthorized?: string;
  /** Message 403 (défaut « Accès refusé. »). */
  forbidden?: string;
  rateLimit?: RateLimitRule;
  /** Schéma du corps JSON. */
  body?: z.ZodType<B>;
  /**
   * Message d'un corps invalide : texte fixe, ou `"issue"` pour renvoyer
   * le premier message de validation zod (messages rédigés dans le schéma).
   */
  invalidBody?: string;
}

export interface RouteContext<P, A extends Auth, B> {
  request: NextRequest;
  params: P;
  user: UserFor<A>;
  body: B;
  ip: string;
  /** Paramètres d'URL (`?a=b`). */
  searchParams: URLSearchParams;
}

type Params = Record<string, string>;

type Handler<P, A extends Auth, B> = (ctx: RouteContext<P, A, B>) => Promise<Response> | Response;

/**
 * Handler de route API : authentification, droit, quota, lecture du corps
 * JSON validé et conversion des erreurs en réponses JSON homogènes.
 *
 *     export const POST = route(
 *       { auth: "user", rateLimit: { key: "follow", limit: 60, windowMs: 60_000 }, body: Schema },
 *       async ({ user, body }) => Response.json(await follow(user.id, body)),
 *     );
 */
export function route<P extends Params = Params, A extends Auth = "public", B = undefined>(
  options: RouteOptions<A, B>,
  handler: Handler<P, A, B>,
): (request: NextRequest, context: { params: Promise<P> }) => Promise<Response> {
  return async (request, context) => {
    try {
      const auth: Auth = options.auth ?? "public";
      // Pas d'aller-retour Appwrite pour les routes publiques.
      const user = auth === "public" ? null : await getCurrentUser();
      if (auth !== "public" && auth !== "optional") {
        if (!user) fail(401, options.unauthorized ?? "Authentification requise.", "unauthorized");
        if (auth !== "user" && !can(user.role, auth)) {
          fail(403, options.forbidden ?? "Accès refusé.", "forbidden");
        }
      }

      const ip = clientIp(request);
      const rule = options.rateLimit;
      if (rule) {
        const scope =
          rule.by === "user"
            ? (user?.id ?? ip)
            : rule.by === "ip+user"
              ? `${ip}:${user?.id ?? "-"}`
              : ip;
        const verdict = rateLimit(`${rule.key}:${scope}`, rule);
        if (!verdict.ok) {
          return errorResponse(
            429,
            rule.message ?? "Trop de requêtes. Réessayez dans un instant.",
            "rate_limited",
            { retryAfter: verdict.retryAfter },
            { "Retry-After": String(verdict.retryAfter) },
          );
        }
      }

      let body = undefined as B;
      if (options.body) {
        let json: unknown;
        try {
          json = await request.json();
        } catch {
          fail(400, "Corps de requête invalide.", "invalid_body");
        }
        const parsed = options.body.safeParse(json);
        if (!parsed.success) {
          const message =
            options.invalidBody === "issue"
              ? (parsed.error.issues[0]?.message ?? "Données invalides.")
              : (options.invalidBody ?? "Données invalides.");
          fail(400, message, "invalid_body");
        }
        body = parsed.data;
      }

      return await handler({
        request,
        params: context?.params ? await context.params : ({} as P),
        user: user as UserFor<A>,
        body,
        ip,
        searchParams: new URL(request.url).searchParams,
      });
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof HttpError) {
        return errorResponse(err.status, err.message, err.code, err.extra);
      }
      console.error(`[api] ${request.method} ${new URL(request.url).pathname}`, err);
      return errorResponse(500, "Erreur interne. Réessayez plus tard.", "internal");
    }
  };
}
