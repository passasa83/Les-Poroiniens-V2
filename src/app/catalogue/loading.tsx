const SKELETON = Array.from({ length: 12 });

/** Squelette de grille affiché pendant le chargement du catalogue. */
export default function CatalogueLoading() {
  return (
    <div className="container-site space-y-6 py-8" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-surface2" />
        <div className="h-4 w-28 animate-pulse rounded bg-surface2" />
      </div>
      <div className="card h-56 animate-pulse bg-surface2" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
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
