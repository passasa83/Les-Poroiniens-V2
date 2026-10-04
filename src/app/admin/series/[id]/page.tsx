import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card } from "@/components/ui/kit";
import { listChapters } from "@/lib/data/chapters";
import { getSeriesById } from "@/lib/data/series";
import {
  ChapterActions,
  DeleteSeriesButton,
  SeriesForm,
} from "../_components/series-form";
import type { Chapter } from "@/lib/types";

export const dynamic = "force-dynamic";

type ChapterRow = Chapter & { series_id: string; nb_pages: number };

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

/** Édition d'une fiche série + gestion des chapitres (admin+). */
export default async function EditSeriePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!atLeast(user?.role, "admin")) return <AccessDenied required="admin" />;

  const { id } = await params;
  const series = await getSeriesById(id);
  if (!series) notFound();

  const chapters = (await listChapters(series.id)) as ChapterRow[];
  const canPublish = can(user?.role, "publish_chapter");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">{series.titre}</h1>
          <p className="text-sm text-muted">
            Slug <code className="font-mono">{series.slug}</code> · {chapters.length} chapitre
            {chapters.length > 1 ? "s" : ""}
          </p>
        </div>
        <DeleteSeriesButton id={series.id} titre={series.titre} />
      </div>

      <SeriesForm mode="edit" series={series} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Chapitres</h2>
          {!canPublish && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn">
              Publication, planification et suppression d&apos;un chapitre sont réservées au
              Gérant (matrice 4.3) : ces actions sont en lecture seule pour un administrateur.
            </p>
          )}
        </div>

        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-semibold">N°</th>
                <th className="px-4 py-3 font-semibold">Titre</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 text-right font-semibold">Pages</th>
                <th className="px-4 py-3 font-semibold">Publication</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chapters.map((chapter) => (
                <tr key={chapter.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 tabular-nums text-muted">{chapter.numero}</td>
                  <td className="px-4 py-3 text-fg">{chapter.titre}</td>
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
                    {chapter.nb_pages ?? 0}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(chapter.publish_at)}</td>
                  <td className="px-4 py-3">
                    <ChapterActions
                      chapterId={chapter.id}
                      numero={chapter.numero}
                      statut={chapter.statut}
                      publishAt={chapter.publish_at}
                      canPublish={canPublish}
                    />
                  </td>
                </tr>
              ))}
              {chapters.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    Aucun chapitre. Importez-en depuis l&apos;espace Gérant
                    {can(user?.role, "import_chapters") ? (
                      <>
                        {" "}
                        (<a href="/gerant/import" className="link-muted">import</a>)
                      </>
                    ) : (
                      " (accès réservé au Gérant)"
                    )}
                    .
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
