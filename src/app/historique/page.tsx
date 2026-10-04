import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getChapterById } from "@/lib/data/chapters";
import { listHistory } from "@/lib/data/library";
import { getSeriesById } from "@/lib/data/series";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { EmptyState } from "@/components/ui/kit";
import { HistoriqueClient, type HistoriqueGroupe } from "./historique-client";

export const metadata: Metadata = {
  title: "Historique de lecture",
  robots: { index: false, follow: false },
};

function dayLabel(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  if (same(date, today)) return "Aujourd’hui";
  if (same(date, yesterday)) return "Hier";
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function HistoriquePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/historique");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const history = await listHistory(user.id, 200);

  const rows = await Promise.all(
    history.map(async (entry) => {
      const [series, chapter] = await Promise.all([
        getSeriesById(entry.series_id),
        getChapterById(entry.chapter_id),
      ]);
      return {
        key: entry.chapter_id,
        chapterId: entry.chapter_id,
        seriesId: entry.series_id,
        page: entry.page,
        completed: entry.completed,
        readAt: entry.read_at,
        titre: series?.titre ?? entry.series_id,
        slug: series?.slug ?? null,
        numero: chapter?.numero ?? null,
        couverture: series?.couverture ?? null,
      };
    }),
  );

  const groupes: HistoriqueGroupe[] = [];
  for (const row of rows) {
    const date = row.readAt.slice(0, 10);
    const existing = groupes.find((g) => g.date === date);
    if (existing) existing.entries.push(row);
    else groupes.push({ date, label: dayLabel(date), entries: [row] });
  }

  return (
    <div className="container-site space-y-6 py-8">
      <HistoriqueClient groupes={groupes} />
      {groupes.length === 0 && (
        <EmptyState
          title="Aucune lecture enregistrée"
          description="Ouvrez un chapitre : votre progression sera sauvegardée ici, page par page."
          action={
            <Link href="/catalogue" className="btn-primary">
              Parcourir le catalogue
            </Link>
          }
        />
      )}
      {groupes.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Clock className="size-3.5" />
          Votre historique est conservé sur votre compte et reste supprimable à tout moment.
        </p>
      )}
    </div>
  );
}
