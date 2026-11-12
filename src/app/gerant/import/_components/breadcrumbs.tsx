/* -- Fil d'Ariane du navigateur NAS --------------------------------------- */

export function Breadcrumbs({
  crumbs,
  onGo,
}: {
  crumbs: Array<{ label: string; path: string }>;
  onGo: (path: string) => void;
}) {
  if (crumbs.length <= 1) return null;
  return (
    <nav aria-label="Fil d'Ariane du NAS" className="flex flex-wrap items-center gap-1 text-xs">
      {crumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center gap-1">
          {index > 0 && (
            <span className="text-muted" aria-hidden="true">
              /
            </span>
          )}
          <button
            type="button"
            className={index === crumbs.length - 1 ? "chip chip-active" : "chip"}
            aria-current={index === crumbs.length - 1 ? "page" : undefined}
            onClick={() => onGo(crumb.path)}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
