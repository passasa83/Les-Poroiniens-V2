import { audit, createImportJob, updateImportJob } from "@/lib/data/moderation";
import { route } from "@/server/http";

export const runtime = "nodejs";

/**
 * POST /api/owner/drive/sync — synchronisation Google Drive des ressources de
 * séries (couvertures / métadonnées). Google Drive ne porte jamais les pages
 * de scans : cette action est donc réservée au Gérant.
 */
export const POST = route(
  {
    auth: "connect_drive",
    forbidden: "Connexion Google Drive réservée au Gérant.",
    rateLimit: {
      key: "owner:drive",
      limit: 5,
      windowMs: 60_000,
      message: "Trop de synchronisations en une minute.",
    },
  },
  async ({ user, ip }) => {
    const account = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT;
    const folder = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!account) {
      const job = await createImportJob({
        type: "drive",
        statut: "erreur",
        progression: 0,
        message:
          "Synchronisation impossible : la variable d'environnement GOOGLE_DRIVE_SERVICE_ACCOUNT est absente.",
        erreurs: [
          "Renseignez le JSON du compte de service dans GOOGLE_DRIVE_SERVICE_ACCOUNT puis relancez.",
        ],
        created_by: user.id,
      });
      await audit({
        actorId: user.id,
        actorPseudo: user.pseudo,
        action: "drive.sync",
        cible: "drive:ressources-series",
        apres: { statut: "erreur", motif: "GOOGLE_DRIVE_SERVICE_ACCOUNT absent" },
        ip,
      });
      return Response.json(
        {
          job,
          error: "Compte de service Google Drive non configuré.",
          code: "drive_unconfigured",
        },
        { status: 503 },
      );
    }

    const job = await createImportJob({
      type: "drive",
      statut: "attente",
      progression: 0,
      message: folder
        ? `Synchronisation planifiée (dossier ${folder}) — en attente du worker.`
        : "Synchronisation planifiée — en attente du worker.",
      erreurs: [],
      created_by: user.id,
    });

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "drive.sync",
      cible: "drive:ressources-series",
      apres: { jobId: job.id, folder: folder ?? null },
      ip,
    });

    // Le worker Appwrite / la cron Vercel prendra ce job en charge.
    await updateImportJob(job.id, { message: `${job.message} (job ${job.id})` });

    return Response.json({ job }, { status: 201 });
  },
);
