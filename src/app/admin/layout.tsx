import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen,
  ExternalLink,
  Gauge,
  HardHat,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { atLeast, can, ROLE_LABELS } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge } from "@/components/ui/kit";
import { SideNav, type NavSection } from "@/components/backoffice/side-nav";

/**
 * Back-office administrateur : modération et contenu en lecture.
 * Le garde de rôle est repris ici : toutes les pages `/admin/*` héritent de
 * cette vérification, complétée par un contrôle propre à chaque page/API.
 *
 * Rubriques propres à l'admin — création/édition/suppression des séries et
 * import vivent dans l'espace Gérant.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!atLeast(user?.role, "admin")) {
    return <AccessDenied required="admin" />;
  }

  const isOwner = can(user?.role, "import_chapters");

  const SECTIONS: NavSection[] = [
    {
      label: "Pilotage",
      items: [{ href: "/admin", label: "Tableau de bord", icon: <Gauge className="size-4" /> }],
    },
    {
      label: "Contenu",
      items: [
        { href: "/admin/series", label: "Catalogue", icon: <BookOpen className="size-4" /> },
      ],
    },
    {
      label: "Communauté",
      items: [
        { href: "/admin/users", label: "Utilisateurs", icon: <Users className="size-4" /> },
        {
          href: "/admin/recommandations",
          label: "Recommandations",
          icon: <Sparkles className="size-4" />,
        },
        { href: "/moderation", label: "Modération", icon: <ShieldCheck className="size-4" /> },
      ],
    },
  ];

  return (
    <div className="container-site py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Back-office</p>
          <h1 className="section-title">Espace Administrateur</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-semibold text-fg">{user?.pseudo}</span>
            <Badge tone={isOwner ? "primary" : "neutral"}>
              {user ? ROLE_LABELS[user.role] : ""}
            </Badge>
            <span>· modération, utilisateurs et consultation du contenu</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/" className="link-muted text-sm">
            <ExternalLink className="mr-1 inline size-4" /> Voir le site
          </Link>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <SideNav
          sections={SECTIONS}
          ariaLabel="Navigation administrateur"
          footer={
            isOwner ? (
              <Link
                href="/gerant"
                className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <HardHat className="size-4" />
                Espace Gérant
                <span className="ml-auto hidden text-xs font-normal lg:inline">import</span>
              </Link>
            ) : null
          }
        />

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
