import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { allSeries } from "@/lib/data/series";
import { imageEnv } from "@/lib/media";
import { ImportPanel, type SeriesLite } from "./_components/import-panel";

export const dynamic = "force-dynamic";

/** Import de contenu (§10) — page d'entrée de l'espace Gérant. */
export default async function GerantImportPage() {
  const user = await getCurrentUser();
  if (!can(user?.role, "import_chapters")) {
    return <AccessDenied required="owner" hint="L'import est réservé au Gérant." />;
  }

  const series = await allSeries();
  const lite: SeriesLite[] = series.map((s) => ({
    id: s.id,
    titre: s.titre,
    slug: s.slug,
    classification: s.classification,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Import de contenu</h1>
        <p className="mt-1 text-sm text-muted">
          Le chapitre est créé en <span className="text-fg">brouillon</span> : vous décidez ensuite
          de le publier immédiatement, de le planifier ou de le laisser en attente.
        </p>
      </div>

      <ImportPanel
        series={lite}
        nasConfigured={Boolean(imageEnv().nasApiBase)}
        driveConfigured={Boolean(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT)}
      />
    </div>
  );
}
