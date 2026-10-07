import Link from "next/link";
import { FolderPlus, ListChecks, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { allSeries } from "@/lib/data/series";
import { imageEnv } from "@/lib/media";
import { imgchestListAvailable } from "@/lib/imgchest";
import { ImportPanel, type SeriesLite } from "./_components/import-panel";

export const dynamic = "force-dynamic";

/**
 * Import de contenu — source unique : le NAS / dossier réseau.
 * Trois parcours : import par lot depuis un dossier de série, un chapitre à la
 * fois, ou un album ImgChest ; Drive ne sert qu'aux ressources de séries.
 */
export default async function GerantImportPage({
  searchParams,
}: {
  searchParams: Promise<{ series?: string }>;
}) {
  const user = await getCurrentUser();
  if (!can(user?.role, "import_chapters")) {
    return <AccessDenied required="owner" hint="L'import est réservé au Gérant." />;
  }

  const sp = await searchParams;
  const initialSeriesId = typeof sp.series === "string" ? sp.series : "";

  const series = await allSeries({ includeArchived: true });
  const lite: SeriesLite[] = series.map((s) => ({
    id: s.id,
    titre: s.titre,
    slug: s.slug,
    classification: s.classification,
  }));

  if (lite.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="section-title">Import de contenu</h1>
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <ListChecks className="size-8 text-primary" />
          <p className="section-title">Créez d&apos;abord une série</p>
          <p className="max-w-md text-sm text-muted">
            Un chapitre s&apos;attache toujours à une fiche série : créez-la (titre, slug,
            classification), puis revenez importer ses chapitres depuis le NAS.
          </p>
          <Link href="/gerant/series/nouvelle" className="btn-primary">
            <FolderPlus className="size-4" /> Créer une série
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Import de contenu</h1>
        <p className="mt-1 text-sm text-muted">
          Source unique : le NAS. Les octets ne transitent jamais par le site — seul l&apos;index
          des planches est enregistré en base. Chaque chapitre est créé en{" "}
          <span className="text-fg">brouillon</span>, sauf mention contraire.
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="size-4 text-ok" />
          Chaque import est journalisé au{" "}
          <Link href="/gerant/audit" className="link-muted">
            journal d&apos;audit
          </Link>{" "}
          (acteur, date, IP, destination).
        </p>
      </div>

      <ImportPanel
        series={lite}
        nasConfigured={Boolean(imageEnv().nasApiBase)}
        driveConfigured={Boolean(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT)}
        imgchestList={imgchestListAvailable()}
        initialSeriesId={initialSeriesId}
      />
    </div>
  );
}
