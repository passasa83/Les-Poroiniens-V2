import Link from "next/link";
import { FolderPlus, Search } from "lucide-react";
import { Badge, Card, EmptyState, Input, Pagination, Select } from "@/components/ui/kit";
import { ArchiveSeriesButton } from "./series-actions";
import { listSeries } from "@/lib/data/series";
import { getDb, TABLES } from "@/lib/db";
import { SERIES_STATUT_LABELS, type Series, type SeriesStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
};

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
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function n(value: number): string {
  return value.toLocaleString("fr-FR");
}

/**
 * Répertoire des séries — partagé par l'espace Gérant (CRUD) et l'espace
 * Admin (consultation). Le même tableau sert les deux : `canManage` décide
 * uniquement de la colonne d'actions et du bouton de création.
 */
export async function SeriesDirectory({
  basePath,
  q = "",
  statut = "",
  page = 1,
  canManage = false,
  emptyHint,
  heading = "Séries",
}: {
  basePath: string;
  q?: string;
  statut?: string;
  page?: number;
  canManage?: boolean;
  emptyHint?: string;
  /** Intitulé de la page : « Séries » côté Gérant, « Catalogue » côté Admin. */
  heading?: string;
}) {
  const [result, chapterRes] = await Promise.all([
    listSeries({
      q: q || undefined,
      statut: (statut || "") as SeriesStatus | "",
      page,
      perPage: 20,
      includeAdult: true,
      includeArchived: true,
      sort: "maj",
    }),
    getDb().list<Record<string, unknown>>(TABLES.chapters, { limit: 5000 }),
  ]);

  const counts = new Map<string, number>();
  for (const row of chapterRes.items) {
    const key = String(row.series_id ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const filtered = Boolean(q || statut);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">{heading}</h1>
          <p className="text-sm text-muted">
            {n(result.total)} série{result.total > 1 ? "s" : ""} au catalogue
            {filtered ? " (filtre actif)" : ""}
          </p>
        </div>
        {canManage && (
          <Link href={`${basePath}/nouvelle`} className="btn-primary">
            <FolderPlus className="size-4" /> Nouvelle série
          </Link>
        )}
      </div>

      <form
        method="get"
        action={basePath}
        className="flex flex-wrap items-end gap-2"
        role="search"
      >
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label className="label" htmlFor="series-q">
            Rechercher
          </label>
          <Input
            id="series-q"
            name="q"
            defaultValue={q}
            placeholder="Titre, auteur, tag…"
          />
        </div>
        <div className="w-44">
          <label className="label" htmlFor="series-statut">
            Statut
          </label>
          <Select id="series-statut" name="statut" defaultValue={statut}>
            <option value="">Tous les statuts</option>
            {(Object.keys(SERIES_STATUT_LABELS) as SeriesStatus[]).map((key) => (
              <option key={key} value={key}>
                {SERIES_STATUT_LABELS[key]}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className="btn-secondary shrink-0">
          <Search className="size-4" /> Filtrer
        </button>
        {filtered && (
          <Link href={basePath} className="btn-ghost shrink-0">
            Réinitialiser
          </Link>
        )}
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title="Aucune série trouvée"
          description={
            filtered
              ? `Aucun résultat pour « ${q || SERIES_STATUT_LABELS[statut as SeriesStatus] || ""} ».`
              : (emptyHint ?? "Le catalogue est vide.")
          }
          action={
            canManage ? (
              <Link href={`${basePath}/nouvelle`} className="btn-primary">
                Créer une série
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-semibold">Titre</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Classification</th>
                <th className="px-4 py-3 text-right font-semibold" title="Chapitres ou tomes publiés">
                  Contenus
                </th>
                <th className="px-4 py-3 text-right font-semibold">Vues</th>
                <th className="px-4 py-3 font-semibold">Mise à jour</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {result.items.map((s: Series) => {
                const archived = s.statut === "archive";
                return (
                  <tr
                    key={s.id}
                    className="border-b border-line last:border-0 hover:bg-surface2/60"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`${basePath}/${s.id}`}
                        className="font-medium text-fg hover:text-primary"
                      >
                        {s.titre}
                      </Link>
                      {archived && (
                        <span className="ml-2 text-xs text-muted">(archivée)</span>
                      )}
                      {s.titresAlt.length > 0 && (
                        <span className="block truncate text-xs text-muted">
                          {s.titresAlt.join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUT_TONE[s.statut] ?? "neutral"}>
                        {SERIES_STATUT_LABELS[s.statut]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{TYPE_LABELS[s.type] ?? s.type}</td>
                    <td className="px-4 py-3">
                      {s.classification === "adult" ? (
                        <Badge tone="adult">+18</Badge>
                      ) : (
                        <Badge tone="neutral">Tout public</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {n(counts.get(s.id) ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {n(s.vues)}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(s.updated_at)}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <ArchiveSeriesButton
                            id={s.id}
                            titre={s.titre}
                            unite={s.unite}
                            archived={archived}
                            showLabels={false}
                          />
                          <Link
                            href={`${basePath}/${s.id}`}
                            className="btn-secondary px-2 py-1 text-xs"
                          >
                            Ouvrir
                          </Link>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath={basePath}
        searchParams={{
          ...(q ? { q } : {}),
          ...(statut ? { statut } : {}),
        }}
      />
    </div>
  );
}
