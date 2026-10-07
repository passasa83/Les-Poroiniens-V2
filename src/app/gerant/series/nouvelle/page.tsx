import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { SeriesForm } from "@/components/series/series-actions";

export const dynamic = "force-dynamic";

/** Création d'une fiche série (Gérant) — §9.2. */
export default async function GerantNouvelleSeriePage() {
  const user = await getCurrentUser();
  if (!can(user?.role, "edit_series")) {
    return <AccessDenied required="owner" hint="La création de série est réservée au Gérant." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/gerant/series" className="link-muted inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-3.5" /> Retour au répertoire
        </Link>
        <h1 className="section-title mt-2">Nouvelle série</h1>
        <p className="mt-1 text-sm text-muted">
          La fiche doit exister avant l&apos;import : les chapitres s&apos;attachent à sa série.
          Une série sans chapitres est visible immédiatement dans le catalogue.
        </p>
      </div>

      <SeriesForm mode="create" basePath="/gerant/series" />
    </div>
  );
}
