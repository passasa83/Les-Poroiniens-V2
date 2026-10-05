const BAR_STYLE = `
@keyframes lp-loading-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
.lp-loading-bar {
  width: 25%;
  animation: lp-loading-slide 1.1s ease-in-out infinite;
}
`;

/**
 * Squelette de chargement global : barre animée + grille de blocs en pulse.
 * Rendu par défaut pour toute navigation dont le segment n'a pas encore de
 * contenu (Next.js, convention `loading.tsx`).
 */
export default function Loading() {
  return (
    <div className="container-site py-10">
      <style href="lp-loading-bar" precedence="loading">
        {BAR_STYLE}
      </style>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface2"
        role="status"
        aria-label="Chargement en cours"
      >
        <div className="lp-loading-bar h-full rounded-full bg-primary" />
      </div>

      <div className="mt-6 h-7 w-56 animate-pulse rounded-lg bg-surface2" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="card overflow-hidden">
            {/* Squelette à la forme exacte de la carte de couverture (§3.5) :
                ratio 2:3 identique au contenu réel, pas de saut de mise en
                page lors du remplacement (CLS §8.2). */}
            <div className="aspect-[2/3] w-full animate-pulse bg-surface2" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface2" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
