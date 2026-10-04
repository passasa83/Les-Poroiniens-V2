import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Download, FileJson, ListChecks, Trash2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getChapterById } from "@/lib/data/chapters";
import { libraryWithSeries, removeLibraryEntry } from "@/lib/data/library";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, EmptyState } from "@/components/ui/kit";
import { SERIES_STATUT_LABELS, type LibraryEntry, type LibraryStatus, type Series } from "@/lib/types";

export const metadata: Metadata = {
  title: "Ma bibliothèque",
  robots: { index: false, follow: false },
};

const STATUT_LABELS: Record<LibraryStatus, string> = {
  en_cours: "En cours",
  a_lire: "À lire",
  termine: "Terminé",
  en_pause: "En pause",
  abandonne: "Abandonné",
};

type Row = LibraryEntry & { series: Series | null; dernierNumero: number | null };

function filterHref(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `/bibliotheque?${qs}` : "/bibliotheque";
}

/** Retrait d'une série : l'identité vient de la session, jamais du formulaire. */
async function retirerAction(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!user || !seriesId || !atLeast(user.role, "membre")) return;
  await removeLibraryEntry(user.id, seriesId);
  revalidatePath("/bibliotheque");
}

export default async function BibliothequePage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; favoris?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/bibliotheque");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const { statut, favoris } = await searchParams;
  const statutActif = statut && statut in STATUT_LABELS ? (statut as LibraryStatus) : null;
  const favorisSeuls = favoris === "1";

  const entries = await libraryWithSeries(user.id);
  const rows: Row[] = await Promise.all(
    entries.map(async (entry) => {
      const chapter = entry.last_chapter_id ? await getChapterById(entry.last_chapter_id) : null;
      return { ...entry, dernierNumero: chapter?.numero ?? null };
    }),
  );

  const filtre = rows.filter(
    (row) => (!statutActif || row.statut === statutActif) && (!favorisSeuls || row.favori),
  );

  const compteurs = (Object.keys(STATUT_LABELS) as LibraryStatus[]).map((key) => ({
    key,
    label: STATUT_LABELS[key],
    total: rows.filter((row) => row.statut === key).length,
  }));

  return (
    <div className="container-site space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Ma bibliothèque</h1>
          <p className="text-sm text-muted">
            {rows.length} série{rows.length > 1 ? "s" : ""} suivie{rows.length > 1 ? "s" : ""} ·
            export JSON / CSV disponible
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary text-sm" href="/api/account/library/export?format=json">
            <FileJson className="size-4" />
            Export JSON
          </a>
          <a className="btn-secondary text-sm" href="/api/account/library/export?format=csv">
            <Download className="size-4" />
            Export CSV
          </a>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2" aria-label="Filtres">
        <Link
          href={filterHref({})}
          className={!statutActif && !favorisSeuls ? "chip chip-active" : "chip"}
        >
          Toutes ({rows.length})
        </Link>
        {compteurs.map(({ key, label, total }) => (
          <Link
            key={key}
            href={filterHref({ statut: key, favoris: favorisSeuls ? "1" : undefined })}
            className={statutActif === key ? "chip chip-active" : "chip"}
          >
            {label} ({total})
          </Link>
        ))}
        <Link
          href={filterHref({ statut: statutActif ?? undefined, favoris: "1" })}
          className={favorisSeuls ? "chip chip-active" : "chip"}
        >
          ★ Favoris ({rows.filter((row) => row.favori).length})
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Votre bibliothèque est vide"
          description="Ajoutez des séries depuis le catalogue pour suivre votre lecture, noter vos coups de cœur et retrouver votre dernière page lue."
          action={
            <Link href="/catalogue" className="btn-primary">
              Parcourir le catalogue
            </Link>
          }
        />
      ) : filtre.length === 0 ? (
        <EmptyState
          title="Aucune série pour ce filtre"
          description="Modifiez le statut ou le filtre « favoris » pour afficher d'autres séries."
          action={
            <Link href={filterHref({})} className="btn-secondary">
              Voir toutes les séries
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtre.map((row) => {
            const serie = row.series;
            return (
              <li key={`${row.user_id}-${row.series_id}`}>
                <article className="card flex flex-wrap items-center gap-4 p-4">
                  <Link
                    href={serie ? `/serie/${serie.slug}` : "/catalogue"}
                    className="shrink-0"
                    aria-label={serie?.titre ?? "Série"}
                  >
                    {serie ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={serie.couverture}
                        alt={`Couverture de ${serie.titre}`}
                        width={72}
                        height={108}
                        loading="lazy"
                        className="h-28 w-[72px] rounded-lg object-cover"
                      />
                    ) : (
                      <div className="grid h-28 w-[72px] place-items-center rounded-lg bg-surface2 text-xs text-muted">
                        ?
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={serie ? `/serie/${serie.slug}` : "/catalogue"}
                        className="truncate font-semibold text-fg hover:text-primary"
                      >
                        {serie?.titre ?? row.series_id}
                      </Link>
                      <Badge tone={row.statut === "termine" ? "ok" : "neutral"}>
                        {STATUT_LABELS[row.statut]}
                      </Badge>
                      {row.favori && <span className="badge bg-warn/15 text-warn">★ Favori</span>}
                      {serie && serie.statut !== "en_cours" && (
                        <Badge tone="primary">{SERIES_STATUT_LABELS[serie.statut]}</Badge>
                      )}
                    </div>

                    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                      <div>
                        <dt className="inline">Note : </dt>
                        <dd className="inline font-semibold text-fg">
                          {row.note !== null ? `${row.note}/10` : "non notée"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Dernière page lue : </dt>
                        <dd className="inline font-semibold text-fg">
                          {row.last_page > 0 ? row.last_page : "—"}
                          {row.dernierNumero !== null && ` (chapitre ${row.dernierNumero})`}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Mis à jour : </dt>
                        <dd className="inline">
                          {new Date(row.updated_at).toLocaleDateString("fr-FR")}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link href="/historique" className="link-muted inline-flex items-center gap-1 text-xs">
                      <ListChecks className="size-3.5" />
                      Historique
                    </Link>
                    <form action={retirerAction}>
                      <input type="hidden" name="seriesId" value={row.series_id} />
                      <button type="submit" className="btn-ghost text-sm text-adult">
                        <Trash2 className="size-4" />
                        Retirer
                      </button>
                    </form>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
