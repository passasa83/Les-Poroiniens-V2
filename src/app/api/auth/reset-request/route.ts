import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, notify } from "@/lib/data/moderation";
import { listProfiles } from "@/lib/data/users";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const RequestSchema = z.object({
  email: z.string().max(320).default(""),
});

/**
 * POST /api/auth/reset-request — demande de réinitialisation de mot de passe.
 *
 * Aucun fournisseur de mails au lancement (§14.3) : la réinitialisation est
 * manuelle, réalisée par le Gérant depuis le back-office. La demande est
 * enregistrée par une notification in-app envoyée à tous les profils `owner`
 * plus une entrée au journal d'audit.
 *
 * La réponse est strictement identique quelle que soit l'adresse saisie :
 * pas d'énumération d'e-mails (faille n°4 de l'ancien code).
 */
export async function POST(request: Request) {
  const limit = rateLimit(`auth:reset:${clientIp(request)}`, {
    limit: 5,
    windowMs: 600_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de demandes récentes. Réessayez plus tard.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide.", code: "bad_request" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Adresse e-mail invalide.", code: "validation" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Adresse e-mail invalide.", code: "validation" }, { status: 400 });
  }

  const owners = (await listProfiles(500)).filter((p) => p.role === "owner");
  for (const owner of owners) {
    await notify(owner.user_id, "system", {
      kind: "reset_request",
      titre: "Demande de réinitialisation de mot de passe",
      message: `Une réinitialisation manuelle a été demandée pour ${email}.`,
      email,
      created_at: new Date().toISOString(),
    });
  }

  await audit({
    actorId: "anonymous",
    actorPseudo: "Visiteur",
    action: "reset_request",
    cible: email,
    ip: clientIp(request),
  });

  return NextResponse.json({
    ok: true,
    message:
      "Votre demande a bien été enregistrée. La réinitialisation étant manuelle au lancement, un administrateur traitera votre demande.",
  });
}
