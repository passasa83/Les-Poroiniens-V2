import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FolderUp,
  Gauge,
  LibraryBig,
  ScrollText,
  Settings,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge } from "@/components/ui/kit";
import { SideNav, type NavSection } from "@/components/backoffice/side-nav";

/**
 * Espace Gérant : séries, import depuis le NAS, publication, audit
 * complet et configuration. Cloisonnement — même les administrateurs
 * sont exclus de ce rubrique.
 */
export default async function GerantLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!can(user?.role, "import_chapters")) {
    return (
      <AccessDenied
        required="owner"
        hint="Cet espace est réservé au Gérant : séries, import de chapitres, journal d'audit complet et configuration du site."
      />
    );
  }

  const SECTIONS: NavSection[] = [
    {
      label: "Pilotage",
      items: [{ href: "/gerant", label: "Tableau de bord", icon: <Gauge className="size-4" /> }],
    },
    {
      label: "Contenu",
      items: [
        { href: "/gerant/series", label: "Séries", icon: <LibraryBig className="size-4" /> },
        { href: "/gerant/import", label: "Import de contenu", icon: <FolderUp className="size-4" /> },
      ],
    },
    {
      label: "Traçabilité",
      items: [
        { href: "/gerant/audit", label: "Journal d'audit", icon: <ScrollText className="size-4" /> },
      ],
    },
    {
      label: "Configuration",
      items: [
        { href: "/gerant/parametres", label: "Paramètres", icon: <Settings className="size-4" /> },
      ],
    },
  ];

  return (
    <div className="container-site py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Espace Gérant
          </p>
          <h1 className="section-title">Pilotage du site</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-semibold text-fg">{user?.pseudo}</span>
            <Badge tone="primary">{user ? ROLE_LABELS[user.role] : ""}</Badge>
            <span>· séries, import NAS, publication et configuration</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="link-muted text-sm">
            <ExternalLink className="mr-1 inline size-4" /> Voir le site
          </Link>
          <Link href="/admin" className="link-muted text-sm">
            <ArrowLeft className="mr-1 inline size-4" /> Back-office admin
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <SideNav sections={SECTIONS} ariaLabel="Navigation espace Gérant" />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
