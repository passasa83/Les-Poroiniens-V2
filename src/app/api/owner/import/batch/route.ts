import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit, createImportJob, listImportJobs, updateImportJob } from "@/lib/data/moderation";
import type { ImportJob } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

/**
 * Garde commune des deux routes : session Gérant + quota. Le job traité doit
 * appartenir à l'appelant : personne ne peut reprendre le lot d'un autre.
 */
async function guard(request: Request, limitKey: string, budget: { limit: number; windowMs: number }) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, response: jsonError("Authentification requise.", "unauthorized", 401) };
  if (!can(user.role, "import_chapters")) {
    return { ok: false as const, response: jsonError("L'import est réservé au Gérant.", "owner_only", 403) };
  }
  const limit = rateLimit(`${limitKey}:${clientIp(request)}`, budget);
  if (!limit.ok) return { ok: false as const, response: jsonError("Trop de requêtes.", "rate_limited", 429) };
  return { ok: true as const, user };
}

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

/** POST /api/owner/import/batch — ouvre le suivi d'un import par lot. */
export async function POST(request: Request) {
  const guardResult = await guard(request, "owner:import-batch:start", { limit: 20, windowMs: 60_000 });
  if (!guardResult.ok) return guardResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = startInput.safeParse(body ?? {});
  if (!parsed.success) return jsonError("Corps JSON invalide.", "invalid_body", 400);

  const job = await createImportJob({
    type: "batch",
    statut: "cours",
    progression: 0,
    message: `${parsed.data.libelle} — en cours…`,
    erreurs: [],
    created_by: guardResult.user.id,
  });

  return Response.json({ jobId: job.id }, { status: 201 });
}

/** PATCH /api/owner/import/batch — clôture le lot avec son rapport final. */
export async function PATCH(request: Request) {
  const guardResult = await guard(request, "owner:import-batch:finish", { limit: 60, windowMs: 60_000 });
  if (!guardResult.ok) return guardResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }
  const parsed = finishInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }

  const job = await ownedJob(parsed.data.jobId, guardResult.user.id);
  if (!job) return jsonError("Lot d'import introuvable.", "not_found", 404);

  const { jobId, ...patch } = parsed.data;
  await updateImportJob(jobId, patch);

  await audit({
    actorId: guardResult.user.id,
    actorPseudo: guardResult.user.pseudo,
    action: "import.batch",
    cible: `job:${jobId}`,
    avant: { message: job.message, progression: job.progression },
    apres: { message: patch.message, statut: patch.statut, erreurs: patch.erreurs.length },
    ip: clientIp(request),
  });

  return Response.json({ ok: true });
}

/** GET /api/owner/import/batch — état du lot courant (rafraîchissement auto). */
export async function GET(request: Request) {
  const guardResult = await guard(request, "owner:import-batch:list", { limit: 60, windowMs: 60_000 });
  if (!guardResult.ok) return guardResult.response;

  const jobs = (await listImportJobs(10)).filter((job) => job.created_by === guardResult.user.id);
  return Response.json({ jobs });
}
