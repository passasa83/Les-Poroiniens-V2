import { z } from "zod";
import { audit, createImportJob, listImportJobs, updateImportJob } from "@/lib/data/moderation";
import type { ImportJob } from "@/lib/types";
import { fail, route, type RateLimitRule } from "@/server/http";

export const runtime = "nodejs";

/** Session Gérant + quota par IP, propres à chaque verbe. */
function ownerOnly(key: string, limit: number) {
  return {
    auth: "import_chapters",
    forbidden: "L'import est réservé au Gérant.",
    rateLimit: {
      key: `owner:import-batch:${key}`,
      limit,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    } satisfies RateLimitRule,
  } as const;
}

/** Le lot traité doit appartenir à l'appelant : personne ne reprend celui d'un autre. */
async function ownedJob(jobId: string, userId: string): Promise<ImportJob | null> {
  const jobs = await listImportJobs(500);
  return jobs.find((job) => job.id === jobId && job.created_by === userId) ?? null;
}

const startInput = z.object({
  /** Libellé affiché dans le journal (`Dossier : #Follow Me`). */
  libelle: z.string().trim().max(200).default("Import par lot"),
});

const finishInput = z.object({
  jobId: z.string().trim().min(1).max(64),
  statut: z.enum(["termine", "erreur"]),
  progression: z.number().int().min(0).max(100),
  message: z.string().trim().max(500),
  erreurs: z.array(z.string().trim().max(500)).max(100).default([]),
});

/** POST /api/owner/import/batch — ouvre le suivi d'un import par lot (corps facultatif). */
export const POST = route(ownerOnly("start", 20), async ({ request, user }) => {
  const json: unknown = await request.json().catch(() => ({}));
  const parsed = startInput.safeParse(json ?? {});
  if (!parsed.success) fail(400, "Corps JSON invalide.", "invalid_body");

  const job = await createImportJob({
    type: "batch",
    statut: "cours",
    progression: 0,
    message: `${parsed.data.libelle} — en cours…`,
    erreurs: [],
    created_by: user.id,
  });
  return Response.json({ jobId: job.id }, { status: 201 });
});

/** PATCH /api/owner/import/batch — clôture le lot avec son rapport final. */
export const PATCH = route(
  { ...ownerOnly("finish", 60), body: finishInput, invalidBody: "issue" },
  async ({ user, body, ip }) => {
    const job = await ownedJob(body.jobId, user.id);
    if (!job) fail(404, "Lot d'import introuvable.", "not_found");

    const { jobId, ...patch } = body;
    await updateImportJob(jobId, patch);
    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "import.batch",
      cible: `job:${jobId}`,
      avant: { message: job.message, progression: job.progression },
      apres: { message: patch.message, statut: patch.statut, erreurs: patch.erreurs.length },
      ip,
    });
    return Response.json({ ok: true });
  },
);

/** GET /api/owner/import/batch — état du lot courant (rafraîchissement auto). */
export const GET = route(ownerOnly("list", 60), async ({ user }) => {
  const jobs = (await listImportJobs(10)).filter((job) => job.created_by === user.id);
  return Response.json({ jobs });
});
