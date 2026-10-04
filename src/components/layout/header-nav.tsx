"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, type FormEvent } from "react";

/* ── Liens de la barre supérieure (DA §5.1) ───────────────────────────── */

type NavItem = {
  href: string;
  label: string;
  /** Chaîne de requête qui rend l'onglet actif (tri du catalogue, etc.) */
  match?: string;
  /** Réservé aux membres connectés */
  member?: boolean;
  /** Ne doit rester actif que si aucun autre onglet du catalogue ne l'est */
  bare?: boolean;
};

const NAV: NavItem[] = [
  { href: "/catalogue?sort=nouveautes", label: "Nouveautés", match: "sort=nouveautes" },
  { href: "/catalogue?sort=popularite", label: "Populaires", match: "sort=popularite" },
  { href: "/catalogue", label: "Catalogue", bare: true },
  { href: "/bibliotheque", label: "Favoris", member: true },
  { href: "/aide", label: "Aide" },
];

/* La chaîne de requête est lue côté client (Next déclenche un `popstate` à
   chaque navigation), ce qui évite `useSearchParams` et sa frontière de
   suspension dans le layout racine. */
function subscribeToSearch(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("hashchange", listener);
  };
}

function useRoute(): { path: string; search: string | null } {
  const path = usePathname();
  const search = useSyncExternalStore(
    subscribeToSearch,
    () => window.location.search,
    // Pendant le rendu serveur la chaîne de requête est inconnue : on renvoie
    // `null` plutôt que "" pour ne pas marquer le mauvais lien comme actif.
    () => null,
  );

  return { path, search };
}

function isActive(item: NavItem, path: string, search: string | null): boolean {
  if (search === null) return false;
  if (item.match) return path === "/catalogue" && search.includes(item.match);
  if (item.bare)
    return path === "/catalogue" && !/sort=(nouveautes|popularite)/.test(search);
  return path === item.href.split("?")[0];
}

export function NavLinks({ hasUser }: { hasUser: boolean }) {
  const { path, search } = useRoute();

  return (
    <nav className="hidden items-center gap-0.5 md:flex" aria-label="Navigation principale">
      {NAV.filter((item) => !item.member || hasUser).map((item) => {
        const active = isActive(item, path, search);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-lg px-3 py-2 text-sm font-semibold text-fg underline decoration-2 underline-offset-[6px]"
                : "rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface2 hover:text-fg"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Recherche : champ « Rechercher par titre ou auteur », raccourci / ─── */

export function HeaderSearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const value = inputRef.current?.value.trim();
    if (!value) {
      event.preventDefault();
      inputRef.current?.focus();
    }
  }

  return (
    <form action="/recherche" method="get" onSubmit={onSubmit} className="hidden sm:block">
      <div className="relative w-full">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          name="q"
          placeholder="Rechercher par titre ou auteur"
          aria-label="Rechercher par titre ou auteur"
          className="input w-full min-h-10 pl-9 sm:w-56 lg:w-72"
        />
      </div>
    </form>
  );
}

/* ── Fil d'Ariane sous la barre, sur les pages de liste (DA §5.1) ─────── */

const CRUMBS: Array<{ test: (path: string, search: string) => boolean; label: string }> = [
  { test: (p, s) => p === "/catalogue" && s.includes("sort=nouveautes"), label: "Nouveautés" },
  { test: (p, s) => p === "/catalogue" && s.includes("sort=popularite"), label: "Populaires" },
  { test: (p) => p === "/catalogue", label: "Catalogue" },
  { test: (p) => p === "/recherche", label: "Recherche" },
  { test: (p) => p.startsWith("/bibliotheque"), label: "Bibliothèque" },
  { test: (p) => p.startsWith("/historique"), label: "Historique" },
  { test: (p) => p.startsWith("/statistiques"), label: "Statistiques" },
  { test: (p) => p.startsWith("/notifications"), label: "Notifications" },
  { test: (p) => p.startsWith("/compte"), label: "Compte" },
  { test: (p) => p.startsWith("/aide"), label: "Aide" },
  { test: (p) => p.startsWith("/moderation"), label: "Modération" },
  { test: (p) => p.startsWith("/gerant"), label: "Espace Gérant" },
  { test: (p) => p.startsWith("/admin"), label: "Back-office" },
];

export function Breadcrumbs() {
  const { path, search } = useRoute();
  const crumb = CRUMBS.find((item) => item.test(path, search ?? ""));
  if (!crumb) return null;

  return (
    <nav aria-label="Fil d'Ariane" className="border-t border-line/60">
      <ol className="container-site flex items-center gap-1.5 py-1.5 text-xs text-muted">
        <li>
          <Link href="/" className="underline underline-offset-2 hover:text-fg">
            Accueil
          </Link>
        </li>
        <li aria-hidden className="text-line">
          &gt;
        </li>
        <li aria-current="page" className="text-fg/90">
          {crumb.label}
        </li>
      </ol>
    </nav>
  );
}
