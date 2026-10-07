import "server-only";
import { getDb, TABLES } from "@/lib/db";
import { exclureDemo, idDeDemo } from "@/lib/demo-gate";
import type { Annonce } from "@/lib/types";

/**
 * Annonces de l'équipe : liste datée (`/annonces`), page de détail
 * (`/annonces/[slug]`) et dernière annonce mise en avant sur l'accueil.
 *
 * Aucun cache mémoire : les annonces sont rares et la recette crée/supprime
 * sa propre fixture — un cache de quelques secondes afficherait une page
 * désuète juste après une publication.
 *
 * Les annonces de la graine sont masquées en production (voir
 * `@/lib/demo-gate`) : une annonce réelle publiée ensuite reste servie.
 */

const DATE_INVALIDE = (valeur: string) => Number.isNaN(Date.parse(valeur));

/** Liste du plus récent au plus ancien ; les lignes sans date valide sont écartées. */
export async function listAnnonces(limit = 50): Promise<Annonce[]> {
  const { items } = await getDb().list<Annonce>(TABLES.annonces, {
    order: { field: "date", dir: "desc" },
    limit: Math.min(Math.max(limit, 1), 100),
  });
  return exclureDemo(
    items.filter((a) => a.slug && a.titre && !DATE_INVALIDE(a.date)),
  );
}

/** Dernière annonce publiée (bloc de l'accueil). */
export async function derniereAnnonce(): Promise<Annonce | null> {
  const [derniere] = await listAnnonces(1);
  return derniere ?? null;
}

/** Annonce par son slug public ; `null` → `notFound()` sur la page détail. */
export async function getAnnonceBySlug(slug: string): Promise<Annonce | null> {
  if (!slug || slug.length > 128) return null;
  /* Annonce de la graine masquée en production : `null` → vrai 404. */
  if (idDeDemo(slug)) return null;
  const { items } = await getDb().list<Annonce>(TABLES.annonces, {
    filters: [{ field: "slug", op: "eq", value: slug }],
    limit: 1,
  });
  const annonce = items[0];
  return annonce && !DATE_INVALIDE(annonce.date) ? annonce : null;
}

/** Date de publication en toutes lettres (« 5 octobre 2026 »). */
export function dateAnnonce(valeur: string): string {
  const temps = Date.parse(valeur);
  if (Number.isNaN(temps)) return "Date non renseignée";
  return new Date(temps).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Valeur `datetime` de la balise `<time>` (ISO courte, locale HTML). */
export function dateIsoAnnonce(valeur: string): string | undefined {
  const temps = Date.parse(valeur);
  if (Number.isNaN(temps)) return undefined;
  return new Date(temps).toISOString().slice(0, 10);
}

/** Corps de l'annonce découpé en paragraphes (ligne vide = nouvelle alinéa). */
export function paragraphesAnnonce(contenu: string): string[] {
  return (contenu ?? "")
    .split(/\n{2,}/)
    .map((bloc) => bloc.trim())
    .filter(Boolean);
}
