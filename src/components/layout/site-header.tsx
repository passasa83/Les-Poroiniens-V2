import {
  Bell,
  BookMarked,
  Clock,
  LogIn,
  Menu,
  Search,
  Shield,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getDb, TABLES } from "@/lib/db";
import { listNotifications } from "@/lib/data/moderation";
import { SiteThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const NAV = [
  { href: "/catalogue", label: "Catalogue" },
  { href: "/catalogue?sort=nouveautes", label: "Nouveautés" },
  { href: "/catalogue?sort=popularite", label: "Populaires" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  const notifications = user ? await listNotifications(user.id) : [];
  const unread = notifications.filter((n) => !n.lu).length;
  const registrationOpen = (await getSetting("registration_open")) !== "0";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="container-site flex h-16 items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm text-primaryfg">
            LP
          </span>
          <span className="hidden text-lg sm:block">Les Poroiniens</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="btn-ghost text-sm">
              {item.label}
            </Link>
          ))}
        </nav>

        <form action="/recherche" method="get" className="ml-auto hidden max-w-xs flex-1 sm:flex">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              placeholder="Rechercher une série…"
              className="input pl-9"
              aria-label="Rechercher une série"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <SiteThemeToggle />

          {user ? (
            <>
              <Link
                href="/notifications"
                className="btn-ghost relative px-2"
                aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}
              >
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 size-2 rounded-full bg-adult" />
                )}
              </Link>
              <UserMenu user={user} unread={unread} />
            </>
          ) : (
            <>
              <Link href="/connexion" className="btn-ghost text-sm">
                <LogIn className="size-4" />
                <span className="hidden sm:inline">Connexion</span>
              </Link>
              {registrationOpen && (
                <Link href="/inscription" className="btn-primary text-sm">
                  Inscription
                </Link>
              )}
            </>
          )}

          <MobileNav hasUser={Boolean(user)} canModerate={can(user?.role, "moderate")} />
        </div>
      </div>
    </header>
  );
}

async function getSetting(cle: string): Promise<string | undefined> {
  try {
    const row = await getDb().get<{ valeur: string }>(TABLES.settings, cle);
    return row?.valeur;
  } catch {
    return undefined;
  }
}

function MobileNav({ hasUser, canModerate }: { hasUser: boolean; canModerate: boolean }) {
  return (
    <div className="md:hidden">
      <details className="group relative">
        <summary className="btn-ghost list-none px-2 [&::-webkit-details-marker]:hidden">
          <Menu className="size-5" aria-label="Menu" />
        </summary>
        <div className="absolute right-0 top-11 w-60 space-y-1 rounded-2xl border border-line bg-surface p-3 shadow-xl">
          <form action="/recherche" method="get" className="sm:hidden">
            <input type="search" name="q" placeholder="Rechercher…" className="input mb-2" />
          </form>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg">
              {item.label}
            </Link>
          ))}
          <div className="divider my-2" />
          {hasUser && (
            <>
              <Link href="/bibliotheque" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg">
                <BookMarked className="size-4" /> Bibliothèque
              </Link>
              <Link href="/historique" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg">
                <Clock className="size-4" /> Historique
              </Link>
              {canModerate && (
                <Link href="/moderation" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg">
                  <Shield className="size-4" /> Modération
                </Link>
              )}
              <Link href="/compte" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg">
                <UserIcon className="size-4" /> Compte
              </Link>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
