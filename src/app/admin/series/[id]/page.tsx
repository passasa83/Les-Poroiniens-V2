import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, PencilLine } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card } from "@/components/ui/kit";
import { ChapterActions } from "@/components/series/series-actions";
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

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-line py-2.5 text-sm last:border-0">
      <dt className="w-40 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-fg">{children}</dd>
    </div>
  );
}

/**
 * Consultation d'une fiche série (admin+). L'édition complète vit dans
 * l'espace Gérant ; un Gérant voit le lien de raccourci, un administrateur
 * simplement l'information.
 */
export default async function ViewSeriePage({
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
  const canEdit = can(user?.role, "import_chapters");
  const archived = series.statut === "archive";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">{series.titre}</h1>
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
        {canEdit ? (
          <Link href={`/gerant/series/${series.id}`} className="btn-primary">
            <PencilLine className="size-4" /> Éditer la fiche
          </Link>
        ) : (
          <span className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-muted">
            Création et édition réservées au Gérant
          </span>
        )}
      </div>

      {archived && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Cette série est archivée : elle est invisible du catalogue public, de la recherche et des
          listes de sorties. Ses {libelleUnitesPluriel(series.unite).toLowerCase()} restent intacts.
        </p>
      )}

      <Card className="p-6">
        <h2 className="section-title">Fiche</h2>
        <dl className="mt-3">
          <Ligne label="Titres alternatifs">
            {series.titresAlt.length ? series.titresAlt.join(" · ") : "—"}
          </Ligne>
          <Ligne label="Synopsis">
            {series.synopsis ? (
              <span className="whitespace-pre-wrap">{series.synopsis}</span>
            ) : (
              "—"
            )}
          </Ligne>
          <Ligne label="Auteurs">{series.auteurs.length ? series.auteurs.join(", ") : "—"}</Ligne>
          <Ligne label="Genres">{series.genres.length ? series.genres.join(", ") : "—"}</Ligne>
          <Ligne label="Tags">{series.tags.length ? series.tags.join(", ") : "—"}</Ligne>
          <Ligne label="Année / Langue">
            {series.annee ?? "—"} · {series.langue || "—"}
          </Ligne>
          <Ligne label="Couverture">
            <span className="break-all font-mono text-xs">{series.couverture || "générée"}</span>
          </Ligne>
          <Ligne label="Statistiques">
            {series.vues.toLocaleString("fr-FR")} vues · note{" "}
            {series.noteMoy.toFixed(1)}/5 ({series.nbVotes} votes) ·{" "}
            {compteUnites(series.nb_chapitres, series.unite)}
          </Ligne>
          <Ligne label="Mise à jour">{formatDate(series.updated_at)}</Ligne>
        </dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={`/serie/${series.slug}`} className="btn-secondary">
            <Eye className="size-4" /> Voir la page publique
          </a>
        </div>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">{libelleUnitesPluriel(series.unite)}</h2>
          {!canPublish && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn">
              Publication, planification et suppression d&apos;un{" "}
              {libelleUniteSingulier(series.unite).toLowerCase()} sont réservées au Gérant : ces
              actions sont en lecture seule pour un administrateur.
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
                    {chapter.nb_pages ?? 0}
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(chapter.publish_at)}</td>
                  <td className="px-4 py-3">
                    <ChapterActions
                      chapterId={chapter.id}
                      numero={chapter.numero}
                      unite={series.unite}
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
                    Aucun {libelleUniteSingulier(series.unite).toLowerCase()}. Importez-en depuis
                    l&apos;espace Gérant
                    {canEdit ? (
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
