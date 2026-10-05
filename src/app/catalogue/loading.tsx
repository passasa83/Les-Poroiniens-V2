const SKELETON = Array.from({ length: 16 });

/** Squelette du catalogue : titre, barre d'onglets + menus, grille (§6.3). */
export default function CatalogueLoading() {
  return (
    <div className="container-site space-y-5 py-8" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-surface2" />
        <div className="h-4 w-28 animate-pulse rounded bg-surface2" />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-stretch justify-center gap-1 border-b border-line">
          <div className="h-11 w-16 animate-pulse rounded-t-lg bg-surface2" />
          <div className="h-11 w-24 animate-pulse rounded-t-lg bg-surface2" />
          <div className="h-11 w-24 animate-pulse rounded-t-lg bg-surface2" />
          <div className="h-11 w-24 animate-pulse rounded-t-lg bg-surface2" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="h-10 w-32 animate-pulse rounded-lg bg-surface2" />
          <div className="h-10 w-28 animate-pulse rounded-lg bg-surface2" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
        {SKELETON.map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-surface2" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface2" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface2" />
          </div>
        ))}
      </div>
    </div>
  );
}
