import { SeriesDirectory } from "@/components/series/series-directory";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";

export const dynamic = "force-dynamic";

/**
 * Répertoire des séries (Gérant) — création, édition, archivage et
 * suppression définitive : le CRUD vit ici, l'espace Admin ne garde qu'une
 * vue de consultation (§4.2 / §10).
 */
export default async function GerantSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; statut?: string }>;
}) {
  const user = await getCurrentUser();
  if (!can(user?.role, "edit_series")) {
    return <AccessDenied required="owner" hint="La gestion des séries est réservée au Gérant." />;
  }

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const statut = typeof sp.statut === "string" ? sp.statut : "";
  const page = Math.max(1, Number(sp.page) || 1);

  return (
    <SeriesDirectory
      basePath="/gerant/series"
      q={q}
      statut={statut}
      page={page}
      canManage
      emptyHint="Aucune série : créez la première pour pouvoir y importer des chapitres."
    />
  );
}
