import clsx from "clsx";
import Link from "next/link";

export type CatalogueTab = { value: string; label: string; href: string };
export type CatalogueChip = { id: string; label: string; href: string };

/**
 * Onglets de statut du catalogue : centrés, actif en blanc souligné,
 * inactifs en gris, défilables horizontalement sur mobile.
 */
export function CatalogueTabs({ tabs, active }: { tabs: CatalogueTab[]; active: string }) {
  return (
    <nav aria-label="Filtrer par statut" className="min-w-0 flex-1 overflow-x-auto">
      <div className="flex w-max min-w-full items-stretch justify-center gap-1 border-b border-line">
        {tabs.map((tab) => {
          const isActive = tab.value === active;
          return (
            <Link
              key={tab.value || "tout"}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm transition-colors",
                isActive
                  ? "border-primary font-semibold text-fg"
                  : "border-transparent text-muted hover:text-fg",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Filtres actifs sous forme de chips supprimables + bouton « Réinitialiser ». */
export function ActiveChips({ chips, resetHref }: { chips: CatalogueChip[]; resetHref: string }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Filtres actifs :</span>
      {chips.map((chip) => (
        <Link
          key={chip.id}
          href={chip.href}
          className="chip chip-active"
          aria-label={`Retirer ${chip.label}`}
        >
          {chip.label} <span aria-hidden>×</span>
        </Link>
      ))}
      <Link href={resetHref} className="chip">
        Réinitialiser
      </Link>
    </div>
  );
}
