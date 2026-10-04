import { getCurrentUser } from "@/lib/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { SeriesForm } from "../_components/series-form";

export const dynamic = "force-dynamic";

/** Création d'une fiche série (admin+, §9.2). */
export default async function NouvelleSeriePage() {
  const user = await getCurrentUser();
  if (!atLeast(user?.role, "admin")) return <AccessDenied required="admin" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Nouvelle série</h1>
        <p className="mt-1 text-sm text-muted">
          Fiche de métadonnées uniquement : les chapitres sont importés depuis
          l&apos;espace Gérant
          {can(user?.role, "import_chapters") ? (
            <>
              {" "}
              (<a href="/gerant/import" className="link-muted">import</a>)
            </>
          ) : (
            " (accès réservé au Gérant)"
          )}
          .
        </p>
      </div>

      <SeriesForm mode="create" />
    </div>
  );
}
