import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card } from "@/components/ui/kit";
import { ChapterActions, DeleteSeriesButton, ArchiveSeriesButton, SeriesForm } from "@/components/series/series-actions";
import { LnChapterEditor, LnNewChapter } from "@/components/series/ln-content";
import { listChapters } from "@/lib/data/chapters";
import { getSeriesById } from "@/lib/data/series";
import { compteUnites, libelleUniteSingulier, libelleUnitesPluriel, titreUnite } from "@/lib/format";
import { SERIES_STATUT_LABELS, type Chapter, type SeriesStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type ChapterRow = Chapter & { series_id: string; nb_pages: number };

const STATUT_TONE: Record<SeriesStatus, "ok" | "primary" | "warn" | "neutral"> = {
  termine: "ok",
  en_cours: "primary",
  hiatus: "warn",
  abandonne: "neutral",
  archive: "neutral",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Édition d'une fiche série + chapitres + archivage / suppression (Gérant). */
export default async function GerantSeriePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!can(user?.role, "edit_series")) {
    return <AccessDenied required="owner" hint="La gestion des séries est réservée au Gérant." />;
  }

  const { id } = await params;
  const series = await getSeriesById(id);
  if (!series) notFound();

  const chapters = (await listChapters(series.id)) as ChapterRow[];
  const canPublish = can(user?.role, "publish_chapter");
  const archived = series.statut === "archive";
  /* Light novel : pas de planches à importer — la création de chapitres se
     fait en texte (champ + bouton dédiés), l'import NAS reste image. */
  const isLn = series.type === "light_novel";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/gerant/series" className="link-muted inline-flex items-center gap-1.5 text-sm">
            <ArrowLeft className="size-3.5" /> Répertoire des séries
          </Link>
          <h1 className="section-title mt-2">{series.titre}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={STATUT_TONE[series.statut] ?? "neutral"}>
              {SERIES_STATUT_LABELS[series.statut]}
            </Badge>
            <Badge tone="neutral">{series.type}</Badge>
            {series.classification === "adult" && <Badge tone="adult">+18</Badge>}
            <span>
              Slug <code className="font-mono">{series.slug}</code>
            </span>
            <span>{compteUnites(chapters.length, series.unite)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isLn ? (
            <LnNewChapter seriesId={series.id} unite={series.unite} />
          ) : (
            <Link
              href={`/gerant/import?series=${encodeURIComponent(series.id)}`}
              className="btn-primary"
            >
              <FolderUp className="size-4" /> Importer des{" "}
              {libelleUnitesPluriel(series.unite).toLowerCase()}
            </Link>
          )}
          <ArchiveSeriesButton
            id={series.id}
            titre={series.titre}
            unite={series.unite}
            archived={archived}
            returnTo="/gerant/series"
          />
          <DeleteSeriesButton
            id={series.id}
            titre={series.titre}
            unite={series.unite}
            returnTo="/gerant/series"
          />
        </div>
      </div>

      {archived && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Cette série est archivée : invisible du catalogue public et des listes de sorties, mais
          ses {libelleUnitesPluriel(series.unite).toLowerCase()} et leurs planches sont intacts. «
          Déarchiver » la remet en ligne.
        </p>
      )}

      <SeriesForm mode="edit" series={series} basePath="/gerant/series" />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">{libelleUnitesPluriel(series.unite)}</h2>
          <p className="text-sm text-muted">
            {chapters.filter((c) => c.statut === "published").length} publié
            {chapters.filter((c) => c.statut === "published").length > 1 ? "s" : ""} ·{" "}
            {chapters.filter((c) => c.statut !== "published").length} en attente
          </p>
        </div>

        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-semibold">N°</th>
                <th className="px-4 py-3 font-semibold">Titre</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {isLn ? "Texte" : "Pages"}
                </th>
                <th className="px-4 py-3 font-semibold">Publication</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((chapter) => (
                <tr key={chapter.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 tabular-nums text-muted">{chapter.numero}</td>
                  <td className="px-4 py-3 text-fg">
                    {titreUnite(chapter.numero, chapter.titre, series.unite)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        chapter.statut === "published"
                          ? "ok"
                          : chapter.statut === "scheduled"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {chapter.statut === "published"
                        ? "Publié"
                        : chapter.statut === "scheduled"
                          ? "Planifié"
                          : "Brouillon"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {isLn ? (chapter.contenu_chemin ? "✓" : "—") : (chapter.nb_pages ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(chapter.publish_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {isLn && canPublish && (
                        <LnChapterEditor
                          chapterId={chapter.id}
                          numero={chapter.numero}
                          unite={series.unite}
                        />
                      )}
                      <ChapterActions
                        chapterId={chapter.id}
                        numero={chapter.numero}
                        unite={series.unite}
                        statut={chapter.statut}
                        publishAt={chapter.publish_at}
                        canPublish={canPublish}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {chapters.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    {isLn ? (
                      <>
                        Aucun {libelleUniteSingulier(series.unite).toLowerCase()} pour
                        l&apos;instant — créez le premier avec « Nouveau{" "}
                        {libelleUniteSingulier(series.unite).toLowerCase()} texte ».
                      </>
                    ) : (
                      <>
                        Aucun {libelleUniteSingulier(series.unite).toLowerCase()} pour
                        l&apos;instant — lancez un{" "}
                        <a
                          href={`/gerant/import?series=${encodeURIComponent(series.id)}`}
                          className="link-muted"
                        >
                          import depuis le NAS
                        </a>
                        .
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
