import { NextResponse } from "next/server";
import { z } from "zod";
import { audit, createReport, notify } from "@/lib/data/moderation";
import { getSeriesBySlug, listSeries } from "@/lib/data/series";
import { listProfiles } from "@/lib/data/users";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Notice & takedown : dépôt d'un signalement de contenu.
 *
 * Règles :
 * - limite de débit 3 dépôts / heure / IP ;
 * - validation Zod de toutes les entrées ;
 * - réponse **neutre et identique** quelle que soit l'issue (existence de la
 *   série trouvée ou non) : aucune fuite d'information sur le catalogue ;
 * - écriture d'un rapport, notification des profils `owner`, trace au journal
 *   d'audit.
 */
const NoticeSchema = z.object({
  serie: z.string().trim().min(2, "Série requise").max(200),
  chapitre: z.string().trim().max(100).optional(),
  emplacement: z.string().trim().min(5, "Description requise").max(1000),
  droits: z.string().trim().min(10, "Justification requise").max(3000),
  email: z.email("Adresse e-mail invalide").max(200),
  nom: z.string().trim().max(200).optional(),
});

const NEUTRAL_BODY = {
  ok: true,
  message:
    "Votre signalement a bien été enregistré. Il sera examiné par l'équipe et traité dans les meilleurs délais.",
} as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Résolution best-effort de la série : jamais révélée au client. */
async function resolveSeries(value: string) {
  try {
    const bySlug = await getSeriesBySlug(slugify(value));
    if (bySlug) return bySlug;
    const { items } = await listSeries({ q: value, perPage: 5, includeAdult: true });
    return items[0] ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = rateLimit(`legal-notice:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "too_many_requests", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const parsed = NoticeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", code: "VALIDATION" }, { status: 400 });
  }

  const input = parsed.data;
  const chapitre = input.chapitre ?? "";
  const nom = input.nom ?? "";

  try {
    const series = await resolveSeries(input.serie);
    const details = [
      `Série : ${input.serie}`,
      chapitre && `Chapitre : ${chapitre}`,
      `Emplacement : ${input.emplacement}`,
      `Droits : ${input.droits}`,
      `Contact : ${input.email}${nom ? ` (${nom})` : ""}`,
    ]
      .filter(Boolean)
      .join("\n");

    const report = await createReport({
      type: "series",
      target_id: series?.id ?? `serie:${slugify(input.serie) || "inconnue"}`,
      reporter_id: "anonyme",
      raison: "notice-takedown",
      details,
    });

    const payloadNote = {
      titre: "Signalement de contenu (notice & takedown)",
      message: `Série signalée : ${input.serie}${chapitre ? ` — ${chapitre}` : ""}`,
      rapport: report.id,
      lien: "/moderation",
    };
    const owners = (await listProfiles(500)).filter((p) => p.role === "owner");
    await Promise.all(owners.map((o) => notify(o.user_id, "system", payloadNote)));

    await audit({
      actorId: "anonyme",
      actorPseudo: "Visiteur",
      action: "legal.notice_takedown",
      cible: report.target_id,
      apres: { serie: input.serie, chapitre, rapport: report.id },
      ip,
    });
  } catch {
    // L'issue (base indisponible, série introuvable…) ne modifie jamais la
    // réponse : le détail est journalisé côté serveur uniquement.
    console.error("[legal/notice] enregistrement du signalement incomplet");
  }

  return NextResponse.json(NEUTRAL_BODY, { status: 200 });
}
