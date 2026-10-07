"use client";

import clsx from "clsx";
import { LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TRIS_BIBLIO, type TriBiblio, type VueBiblio } from "./tri-vue";

// Les valeurs (isTriBiblio…) restent à importer depuis "./tri-vue" dans les
// composants serveur : depuis un module `use client` elles deviennent des
// références client et l'appel échoue au rendu.
export type { TriBiblio, VueBiblio } from "./tri-vue";

/**
 * Barre d'outils de la bibliothèque : tri et bascule grille / liste.
 * Le tri est appliqué dans l'URL (retour du navigateur inchangé) et la vue
 * reste navigable sans JavaScript (liens natifs).
 */
export function LibraryToolbar({
  tri,
  vue,
  total,
}: {
  tri: TriBiblio;
  vue: VueBiblio;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const href = (cible: { tri?: TriBiblio; vue?: VueBiblio }) => {
    const triSuivant = cible.tri ?? tri;
    const vueSuivante = cible.vue ?? vue;
    const next = new URLSearchParams(searchParams.toString());
    // Tri / vue par défaut laissés hors URL : les liens restent propres.
    if (triSuivant === "lecture") next.delete("tri");
    else next.set("tri", triSuivant);
    if (vueSuivante === "liste") next.delete("vue");
    else next.set("vue", vueSuivante);
    const qs = next.toString();
    return qs ? `/bibliotheque?${qs}` : "/bibliotheque";
  };

  const vues: Array<{ value: VueBiblio; label: string; Icon: typeof List }> = [
    { value: "liste", label: "Vue liste", Icon: List },
    { value: "grille", label: "Vue grille", Icon: LayoutGrid },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-muted">
        {total} série{total > 1 ? "s" : ""} affichée{total > 1 ? "s" : ""}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <label htmlFor="biblio-tri" className="sr-only">
            Trier la bibliothèque
          </label>
          <select
            id="biblio-tri"
            value={tri}
            onChange={(event) => router.push(href({ tri: event.target.value as TriBiblio }))}
            className="input h-11 min-h-11 w-auto cursor-pointer appearance-none pr-8 text-sm font-medium"
          >
            {TRIS_BIBLIO.map((option) => (
              <option key={option.value} value={option.value}>
                Tri : {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Mode d’affichage">
          {vues.map(({ value, label, Icon }) => (
            <Link
              key={value}
              href={href({ vue: value })}
              aria-current={vue === value ? "true" : undefined}
              title={label}
              className={clsx(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
                vue === value
                  ? "border-accent bg-accent/15 text-fg"
                  : "border-line bg-surface2 text-muted hover:text-fg",
              )}
            >
              <Icon aria-hidden className="size-4" />
              {value === "liste" ? "Liste" : "Grille"}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
