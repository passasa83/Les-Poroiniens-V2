import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, FolderUp, Gauge, ScrollText, Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";

const NAV: Array<{ href: string; label: string; icon: ReactNode }> = [
  { href: "/gerant", label: "Imports", icon: <Gauge className="size-4" /> },
  { href: "/gerant/import", label: "Importer", icon: <FolderUp className="size-4" /> },
  { href: "/gerant/audit", label: "Journal d'audit", icon: <ScrollText className="size-4" /> },
  { href: "/gerant/parametres", label: "Paramètres", icon: <Settings className="size-4" /> },
];

/**
 * Espace Gérant (§10) : import, publication, audit complet et configuration.
 * Cloisonnement §4.2 — même les administrateurs sont exclus.
 */
export default async function GerantLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!can(user?.role, "import_chapters")) {
    return (
      <AccessDenied
        required="owner"
        hint="Cet espace est réservé au Gérant : import de chapitres, publication, journal d'audit complet et configuration du site."
      />
    );
  }

  return (
    <div className="container-site py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Espace Gérant</h1>
          <p className="text-sm text-muted">
            <span className="font-semibold text-fg">{user?.pseudo}</span> —{" "}
            {user ? ROLE_LABELS[user.role] : ""} · accès exclusif à l&apos;import et à la
            configuration
          </p>
        </div>
        <Link href="/admin" className="link-muted text-sm">
          <ArrowLeft className="mr-1 inline size-4" /> Back-office admin
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav className="card h-fit space-y-1 p-3" aria-label="Navigation espace Gérant">
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
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
