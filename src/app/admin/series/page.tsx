import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card, EmptyState, Input, Pagination } from "@/components/ui/kit";
import { listSeries } from "@/lib/data/series";
import { getDb, TABLES } from "@/lib/db";
import { SERIES_STATUT_LABELS, type Series } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
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

/** Catalogue administratif : toutes les séries, contenu +18 inclus (admin+). */
export default async function AdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!atLeast(user?.role, "admin")) return <AccessDenied required="admin" />;

  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const [result, chapterRes] = await Promise.all([
    listSeries({
      q: q || undefined,
      page,
      perPage: 20,
      includeAdult: true,
      sort: "maj",
    }),
    getDb().list<Record<string, unknown>>(TABLES.chapters, { limit: 5000 }),
  ]);

  const counts = new Map<string, number>();
  for (const row of chapterRes.items) {
    const key = String(row.series_id ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Séries</h1>
          <p className="text-sm text-muted">
            {n(result.total)} série{result.total > 1 ? "s" : ""} au catalogue
          </p>
        </div>
        <Link href="/admin/series/nouvelle" className="btn-primary">
          <Plus className="size-4" /> Nouvelle série
        </Link>
      </div>

      <form method="get" action="/admin/series" className="flex max-w-md gap-2">
        <label className="sr-only" htmlFor="q">
          Rechercher une série
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="Titre, auteur, tag…" />
        <button type="submit" className="btn-secondary shrink-0">
          <Search className="size-4" /> Rechercher
        </button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState
          title="Aucune série trouvée"
          description={q ? `Aucun résultat pour « ${q} ».` : "Le catalogue est vide."}
          action={
            <Link href="/admin/series/nouvelle" className="btn-primary">
              Créer une série
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-semibold">Titre</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Classification</th>
                <th className="px-4 py-3 text-right font-semibold">Chapitres</th>
                <th className="px-4 py-3 text-right font-semibold">Vues</th>
                <th className="px-4 py-3 font-semibold">Mise à jour</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((s: Series) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface2/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/series/${s.id}`} className="font-medium text-fg hover:text-primary">
                      {s.titre}
                    </Link>
                    {s.titresAlt.length > 0 && (
                      <span className="block truncate text-xs text-muted">{s.titresAlt.join(" · ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={s.statut === "termine" ? "ok" : s.statut === "en_cours" ? "primary" : "neutral"}>
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
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{n(s.vues)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(s.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath="/admin/series"
        searchParams={q ? { q } : {}}
      />
    </div>
  );
}
