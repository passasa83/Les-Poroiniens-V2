import { getCurrentUser } from "@/server/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { listReports } from "@/lib/data/moderation";
import { seriesParIds } from "@/lib/data/series";
import { listParValeurs, TABLES } from "@/server/db";
import { libelleCourt, libelleUnite } from "@/lib/format";
import { ReportsQueue, type EnrichedReport } from "./_components/reports-queue";

export const dynamic = "force-dynamic";

/** File de modération : signalements de commentaires, chapitres, séries. */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !atLeast(user.role, "modo") || !can(user.role, "moderate")) {
    return <AccessDenied required="modo" />;
  }

  const sp = await searchParams;
  const statutFilter =
    sp.statut === "ouvert" || sp.statut === "traite" || sp.statut === "rejete" ? sp.statut : null;

  /* Seules les lignes visées par les signalements sont lues (avant : 5000
     commentaires, 5000 chapitres, 500 profils et tout le catalogue, faux
     au-delà) : deux vagues de lectures groupées par identifiant. */
  const reports = await listReports();
  const cibles = (type: string) => reports.filter((r) => r.type === type).map((r) => r.target_id);
  const [profils, comments, chapitresSignales] = await Promise.all([
    listParValeurs(
      TABLES.profiles,
      reports.map((r) => r.reporter_id),
      "user_id",
      {
        select: ["user_id", "pseudo"],
      },
    ),
    listParValeurs(TABLES.comments, cibles("comment")),
    listParValeurs(TABLES.chapters, cibles("chapter")),
  ]);
  const chapitresCommentes = await listParValeurs(
    TABLES.chapters,
    comments.filter((c) => c.target_type !== "series").map((c) => c.target_id),
  );
  const chapters = [...chapitresSignales, ...chapitresCommentes];
  const seriesById = await seriesParIds([
    ...cibles("series"),
    ...comments.filter((c) => c.target_type === "series").map((c) => c.target_id),
    ...chapters.map((c) => c.series_id),
  ]);

  const pseudoById = new Map(profils.map((p) => [p.user_id, p.pseudo] as const));
  const commentById = new Map(comments.map((c) => [c.id, c] as const));
  const chapterById = new Map(chapters.map((c) => [c.id, c] as const));

  const items: EnrichedReport[] = reports.map((report) => {
    const reporter = pseudoById.get(report.reporter_id) ?? report.reporter_id;
    let cibleLabel = `${report.type} : ${report.target_id}`;
    let cibleHref: string | null = null;
    let auteurPseudo: string | null = null;
    let extrait: string | null = null;
    let cibleStatut: string | null = null;

    if (report.type === "comment") {
      const comment = commentById.get(report.target_id);
      if (comment) {
        auteurPseudo = comment.pseudo;
        extrait = comment.contenu;
        cibleStatut = comment.statut;
        cibleLabel = `Commentaire de ${comment.pseudo}`;
        if (comment.target_type === "series") {
          const serie = seriesById.get(comment.target_id);
          if (serie) {
            cibleHref = `/serie/${serie.slug}`;
            cibleLabel = `Commentaire de ${comment.pseudo} sur ${serie.titre}`;
          }
        } else {
          const chapter = chapterById.get(comment.target_id);
          const serie = chapter ? seriesById.get(chapter.series_id) : null;
          if (chapter && serie) {
            cibleHref = `/serie/${serie.slug}/chapitre-${chapter.numero}`;
            cibleLabel = `Commentaire de ${comment.pseudo} sur ${serie.titre} ${libelleCourt(chapter.numero, serie.unite)}`;
          }
        }
      } else {
        cibleLabel = "Commentaire supprimé";
      }
    } else if (report.type === "series") {
      const serie = seriesById.get(report.target_id);
      if (serie) {
        cibleLabel = `Série : ${serie.titre}`;
        cibleHref = `/serie/${serie.slug}`;
      }
    } else {
      const chapter = chapterById.get(report.target_id);
      const serie = chapter ? seriesById.get(chapter.series_id) : null;
      if (chapter && serie) {
        cibleLabel = `${libelleUnite(chapter.numero, serie.unite)} — ${serie.titre}`;
        cibleHref = `/serie/${serie.slug}/chapitre-${chapter.numero}`;
      }
    }

    return {
      report,
      reporter,
      cibleLabel,
      cibleHref,
      auteurPseudo,
      extrait,
      cibleStatut,
    };
  });

  return (
    <div className="container-site space-y-6 py-8">
      <div>
        <h1 className="section-title">Modération</h1>
        <p className="mt-1 text-sm text-muted">
          File de signalements et historique des décisions. Chaque action est tracée au journal
          d&apos;audit.
        </p>
      </div>

      <ReportsQueue items={items} initialStatut={statutFilter} />
    </div>
  );
}
