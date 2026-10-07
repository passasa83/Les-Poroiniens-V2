"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Navigation latérale des back-offices, partagée par `/admin` et `/gerant`.
 *
 * - l'entrée correspondant à la page courante est marquée `aria-current="page"`
 *   et mise en avant (la plus longue correspondance gagne : `/gerant/import`
 *   n'allume pas `/gerant`) ;
 * - en dessous de `lg` les entrées défilent horizontalement plutôt que
 *   d'empiler une colonne entière au-dessus du contenu ;
 * - les intitulés de section ne servent qu'à la mise en page verticale.
 */
export type NavItem = { href: string; label: string; icon?: ReactNode; hint?: string };
export type NavSection = { label?: string; items: NavItem[] };

export function SideNav({
  sections,
  ariaLabel,
  footer,
}: {
  sections: NavSection[];
  ariaLabel: string;
  footer?: ReactNode;
}) {
  const pathname = usePathname();

  let courant: string | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      const match =
        item.href === "/"
          ? pathname === "/"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (match && (!courant || item.href.length > courant.length)) courant = item.href;
    }
  }

  return (
    <nav className="card space-y-4 p-3 lg:h-fit" aria-label={ariaLabel}>
      {sections.map((section, index) => (
        <div key={section.label ?? `section-${index}`}>
          {section.label && (
            <p className="mb-1.5 hidden px-3 text-[0.68rem] font-semibold uppercase tracking-wider text-muted lg:block">
              {section.label}
            </p>
          )}
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {section.items.map((item) => {
              const active = courant === item.href;
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted hover:bg-surface2 hover:text-fg",
                    )}
                  >
                    {item.icon}
                    {item.label}
                    {item.hint && (
                      <span className="ml-auto hidden text-xs font-normal text-muted lg:inline">
                        {item.hint}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {footer && (
        <div className="space-y-1">
          <div className="divider" />
          {footer}
        </div>
      )}
    </nav>
  );
}
