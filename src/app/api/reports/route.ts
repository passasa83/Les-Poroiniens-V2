import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit, createReport, notify } from "@/lib/data/moderation";
import { getSeriesBySlug, listSeries } from "@/lib/data/series";
import { listProfiles } from "@/lib/data/users";

export const runtime = "nodejs";

/** Signalement depuis la lecture : membre connecté, 5 / 10 min. */
const LectureSchema = z.object({
  type: z.enum(["comment", "chapter", "series"]),
  targetId: z.string().min(1).max(64),
  raison: z.string().min(1).max(80),
  details: z.string().max(500).optional().default(""),
});

/**
 * Signalement de contenu hors lecture (« DMCA ») : déposé depuis la
 * page légale, **sans compte** — 3 dépôts / heure / IP (cf. page DMCA).
 */
const LegalSchema = z.object({
  type: z.literal("legal"),
  serie: z.string().trim().min(2).max(200),
  chapitre: z.string().trim().max(100).optional().default(""),
  emplacement: z.string().trim().min(5).max(1000),
  droits: z.string().trim().min(10).max(3000),
  email: z.email().max(200),
  nom: z.string().trim().max(200).optional().default(""),
});

const ReportSchema = z.discriminatedUnion("type", [LectureSchema, LegalSchema]);

type Lecture = z.infer<typeof LectureSchema>;
type Legal = z.infer<typeof LegalSchema>;

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

/** Accusé de réception communiqué à l'émetteur. */
function accusereception(reference: string) {
  return {
    reference,
    recuLe: new Date().toISOString(),
    message:
      "Votre signalement a bien été enregistré. Il sera examiné par l'équipe et traité dans les meilleurs délais.",
  };
}

/* ── Signalement hors lecture (DMCA) : sans compte, réponses neutres ─────── */
async function depotLegal(input: Legal, ip: string) {
  const limit = rateLimit(`report-legal:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "Trop de signalements envoyés depuis votre adresse. Réessayez plus tard.",
        code: "RATE_LIMITED",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let reportId: string;
  try {
    // L'existence (ou non) de la série n'influence jamais la réponse.
    const series = await resolveSeries(input.serie);
    const details = [
      `Série : ${input.serie}`,
      input.chapitre && `Chapitre : ${input.chapitre}`,
      `Emplacement : ${input.emplacement}`,
      `Droits : ${input.droits}`,
      `Contact : ${input.email}${input.nom ? ` (${input.nom})` : ""}`,
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
    reportId = report.id;

    try {
      const owners = (await listProfiles(500)).filter((p) => p.role === "owner");
      await Promise.all(
        owners.map((o) =>
          notify(o.user_id, "system", {
            titre: "Signalement de contenu (notice & takedown)",
            message: `Série signalée : ${input.serie}${input.chapitre ? ` — ${input.chapitre}` : ""}`,
            rapport: report.id,
            lien: "/moderation",
          }),
        ),
      );
      await audit({
        actorId: "anonyme",
        actorPseudo: "Visiteur",
        action: "legal.notice_takedown",
        cible: report.target_id,
        apres: { serie: input.serie, chapitre: input.chapitre, rapport: report.id },
        ip,
      });
    } catch {
      // Notification / audit best-efforts : l'enregistrement est déjà fait.
    }
  } catch {
    return NextResponse.json(
      { error: "Enregistrement impossible pour le moment. Réessayez plus tard.", code: "STORAGE" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, accusereception: accusereception(reportId) }, { status: 201 });
}

/* ── Signalement depuis la lecture : membre connecté ─────────────────────── */
async function signalementLecture(input: Lecture, user: { id: string }, ip: string) {
  const limit = rateLimit(`report:${ip}:${user.id}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de signalements. Réessayez plus tard.", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const report = await createReport({
    type: input.type,
    target_id: input.targetId,
    reporter_id: user.id,
    raison: input.raison.trim(),
    details: input.details.trim(),
  });

  return NextResponse.json(
    { ok: true, report: { id: report.id }, accusereception: accusereception(report.id) },
    { status: 201 },
  );
}

/** Signalements : membre connecté, 5 signalements / 10 min. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const parsed = ReportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const ip = clientIp(request);

  // Dépôt DMCA : ouvert aux visiteurs (la page légale est publique).
  if (parsed.data.type === "legal") return depotLegal(parsed.data, ip);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Vous devez être connecté pour signaler un problème.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  return signalementLecture(parsed.data, user, ip);
}
