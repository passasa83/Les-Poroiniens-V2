import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/data/moderation";
import { notify } from "@/lib/data/notifications";
import { listProfiles } from "@/lib/data/users";
import { fail, route } from "@/server/http";

const RequestSchema = z.object({
  email: z.string().max(320).default(""),
});

/**
 * POST /api/auth/reset-request — demande de réinitialisation de mot de passe.
 *
 * Aucun fournisseur de mails au lancement : la réinitialisation est
 * manuelle, réalisée par le Gérant depuis le back-office. La demande est
 * enregistrée par une notification in-app envoyée à tous les profils `owner`
 * plus une entrée au journal d'audit.
 *
 * La réponse est strictement identique quelle que soit l'adresse saisie :
 * pas d'énumération d'e-mails (faille n°4 de l'ancien code).
 */
export const POST = route(
  {
    rateLimit: {
      key: "auth:reset",
      limit: 5,
      windowMs: 600_000,
      message: "Trop de demandes récentes. Réessayez plus tard.",
    },
    body: RequestSchema,
    invalidBody: "Adresse e-mail invalide.",
  },
  async ({ body, ip }) => {
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail(400, "Adresse e-mail invalide.", "validation");
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
      ip,
    });

    return NextResponse.json({
      ok: true,
      message:
        "Votre demande a bien été enregistrée. La réinitialisation étant manuelle au lancement, un administrateur traitera votre demande.",
    });
  },
);
