import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen,
  Gauge,
  HardHat,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { atLeast, can, ROLE_LABELS } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";

const NAV: Array<{ href: string; label: string; icon: ReactNode }> = [
  { href: "/admin", label: "Tableau de bord", icon: <Gauge className="size-4" /> },
  { href: "/admin/series", label: "Séries", icon: <BookOpen className="size-4" /> },
  { href: "/admin/users", label: "Utilisateurs", icon: <Users className="size-4" /> },
  {
    href: "/admin/recommandations",
    label: "Recommandations",
    icon: <Sparkles className="size-4" />,
  },
  { href: "/moderation", label: "Modération", icon: <ShieldCheck className="size-4" /> },
];

/**
 * Back-office administrateur (§9).
 * Le garde de rôle est repris ici : toutes les pages `/admin/*` héritent de
 * cette vérification, complétée par un contrôle propre à chaque page/API.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!atLeast(user?.role, "admin")) {
    return <AccessDenied required="admin" />;
  }

  const isOwner = can(user?.role, "import_chapters");

  return (
    <div className="container-site py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Back-office</h1>
          <p className="text-sm text-muted">
            Connecté en tant que{" "}
            <span className="font-semibold text-fg">{user?.pseudo}</span> —{" "}
            {user ? ROLE_LABELS[user.role] : ""}
          </p>
        </div>
        <Link href="/" className="link-muted text-sm">
          ← Retour au site
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav className="card h-fit space-y-1 p-3" aria-label="Navigation administrateur">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface2 hover:text-fg"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}

          {isOwner && (
            <>
              <div className="divider my-2" />
              <Link
                href="/gerant"
                className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <HardHat className="size-4" />
                Espace Gérant
              </Link>
            </>
          )}
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
