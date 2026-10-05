import {
  Bell,
  BookMarked,
  Clock,
  LogIn,
  Menu,
  Shield,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getDb, TABLES } from "@/lib/db";
import { listNotifications } from "@/lib/data/moderation";
import { HeaderShell } from "./header-shell";
import { Breadcrumbs, HeaderSearch, NavLinks } from "./header-nav";
import { SiteThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const notifications = user ? await listNotifications(user.id) : [];
  const unread = notifications.filter((n) => !n.lu).length;
  const registrationOpen = (await getSetting("registration_open")) !== "0";

  return (
    <HeaderShell>
      <div className="container-site flex h-16 items-center gap-2 md:h-[72px] md:gap-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-black tracking-tight"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm text-primaryfg">
            LP
          </span>
          <span className="hidden text-lg sm:block">Les Poroiniens</span>
        </Link>

        <NavLinks hasUser={Boolean(user)} />

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <HeaderSearch />
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
              <Link href="/connexion" className="btn-ghost px-3 text-sm">
                <LogIn className="size-4" />
                <span className="hidden lg:inline">Connexion</span>
              </Link>
              {registrationOpen && (
                <Link href="/inscription" className="btn-primary hidden px-3 text-sm sm:inline-flex">
                  Inscription
                </Link>
              )}
            </>
          )}

          <MobileNav hasUser={Boolean(user)} canModerate={can(user?.role, "moderate")} />
        </div>
      </div>

      <Breadcrumbs />
    </HeaderShell>
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
  // Menu mobile visible dès que la barre de nav est masquée (lg).
  return (
    <div className="lg:hidden">
      <details className="group relative">
        <summary className="btn-ghost list-none px-2 [&::-webkit-details-marker]:hidden">
          <Menu className="size-5" aria-label="Ouvrir le menu" />
        </summary>
        <div className="absolute right-0 top-11 w-60 space-y-1 rounded-lg border border-line bg-surface p-3 shadow-xl">
          {/* La recherche de l'en-tête n'apparaît qu'à partir de lg : dans le
              menu, elle reste proposée en dessous. */}
          <form action="/recherche" method="get" className="lg:hidden">
            <input
              type="search"
              name="q"
              placeholder="Rechercher par titre ou auteur"
              aria-label="Rechercher par titre ou auteur"
              className="input mb-2"
            />
          </form>
          <Link
            href="/nouveautes"
            className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg"
          >
            Nouveautés
          </Link>
          <Link
            href="/catalogue?sort=popularite"
            className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg"
          >
            Populaires
          </Link>
          <Link
            href="/catalogue"
            className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg"
          >
            Catalogue
          </Link>
          <Link
            href="/aide"
            className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg"
          >
            Aide
          </Link>
          <div className="divider my-2" />
          {hasUser && (
            <>
              <Link
                href="/bibliotheque"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg"
              >
                <BookMarked className="size-4" /> Bibliothèque
              </Link>
              <Link
                href="/historique"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg"
              >
                <Clock className="size-4" /> Historique
              </Link>
              {canModerate && (
                <Link
                  href="/moderation"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg"
                >
                  <Shield className="size-4" /> Modération
                </Link>
              )}
              <Link
                href="/compte"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-fg"
              >
                <UserIcon className="size-4" /> Compte
              </Link>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
