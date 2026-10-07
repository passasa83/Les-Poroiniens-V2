import { SeriesDirectory } from "@/components/series/series-directory";
import { getCurrentUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";

export const dynamic = "force-dynamic";

/**
 * Catalogue en lecture seule (admin+). La création, l'édition et la
 * suppression d'une série vivent dans l'espace Gérant : cet
 * écran reste la vue « contenu » du back-office.
 */
export default async function AdminSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; statut?: string }>;
}) {
  const user = await getCurrentUser();
  if (!atLeast(user?.role, "admin")) return <AccessDenied required="admin" />;

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const statut = typeof sp.statut === "string" ? sp.statut : "";
  const page = Math.max(1, Number(sp.page) || 1);

  return (
    <SeriesDirectory
      basePath="/admin/series"
      q={q}
      statut={statut}
      page={page}
      canManage={false}
      heading="Catalogue"
      emptyHint="Aucune série dans le catalogue."
    />
  );
}
