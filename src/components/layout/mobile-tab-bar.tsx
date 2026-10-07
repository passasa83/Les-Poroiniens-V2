"use client";

import { BookMarked, House, LayoutGrid, Search, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Barre d'onglets inférieure mobile (DA) : Accueil · Catalogue ·
 * Recherche · Bibliothèque · Compte. Cibles ≥ 44 px, onglet actif en couleur
 * d'accent, respect de la zone de sécurité (encoche et barre système).
 */
const TABS = [
  { href: "/", label: "Accueil", icon: House, match: (p: string) => p === "/" },
  {
    href: "/catalogue",
    label: "Catalogue",
    icon: LayoutGrid,
    match: (p: string) => p === "/catalogue",
  },
  {
    href: "/recherche",
    label: "Recherche",
    icon: Search,
    match: (p: string) => p === "/recherche",
  },
  {
    href: "/bibliotheque",
    label: "Bibliothèque",
    icon: BookMarked,
    match: (p: string) => p.startsWith("/bibliotheque") || p.startsWith("/historique"),
  },
  {
    href: "/compte",
    label: "Compte",
    icon: User,
    match: (p: string) =>
      p.startsWith("/compte") || p.startsWith("/connexion") || p.startsWith("/inscription"),
  },
];

export function MobileTabBar() {
  const path = usePathname();

  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-header/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const active = tab.match(path);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium ${
                  active ? "text-primary" : "text-muted"
                }`}
              >
                <Icon className="size-5" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
