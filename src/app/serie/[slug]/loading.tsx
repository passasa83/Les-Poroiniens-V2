/** Squelette de la fiche série pendant le chargement. */
export default function SerieLoading() {
  return (
    <div className="container-site space-y-10 py-8" aria-busy="true" aria-live="polite">
      <header className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div className="mx-auto aspect-[2/3] w-40 animate-pulse rounded-xl bg-surface2 sm:mx-0 sm:w-full" />
        <div className="space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded bg-surface2" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-surface2" />
          <div className="h-4 w-full animate-pulse rounded bg-surface2" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-surface2" />
          <div className="flex gap-2">
            <div className="h-6 w-20 animate-pulse rounded-full bg-surface2" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-surface2" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-surface2" />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-20 animate-pulse bg-surface2" />
        ))}
      </div>

      <div className="space-y-2">
        <div className="h-6 w-40 animate-pulse rounded bg-surface2" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 w-full animate-pulse rounded-xl bg-surface2" />
        ))}
      </div>
    </div>
  );
}
