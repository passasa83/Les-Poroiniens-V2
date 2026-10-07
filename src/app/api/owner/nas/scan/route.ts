import { jsonError, guardNas } from "../guard";
import { isSafePath, nasErrorMessage, nasList, nasTree } from "@/lib/nas";
import { detectNumero, stemCouverture, uniteDominante, type CandidateKind } from "@/lib/unite";
import { getDb, TABLES } from "@/lib/db";
import type { Chapter } from "@/lib/types";

export const runtime = "nodejs";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
/** bornes : un scan reste une requête unique, même sur une longue série. */
const MAX_DIRS = 160;
const CONCURRENCY = 6;

export type Candidate = {
  name: string;
  path: string;
  /** Numéro détecté dans le nom du dossier (`null` = à saisir à la main). */
  numero: number | null;
  kind: CandidateKind;
  /** Nombre de planches lues sur le NAS (0 = pas une planche). */
  pages: number;
  /** Chapitre déjà présent en base pour ce numéro. */
  dejaImporte: boolean;
  chapterId?: string;
  /** `pret` : importable en l'état. */
  etat: "pret" | "deja_importe" | "pas_d_image" | "numero_a_corriger";
  /** `true` si la case est cochée par défaut dans l'interface. */
  selectionne: boolean;
};

/** Exécution bornée en parallèle : le NAS ne doit pas être martelé. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

function natural(a: string, b: string): number {
  return a.localeCompare(b, "fr", { numeric: true });
}

/**
 * L'API du NAS renvoie `path` encodé segment par segment (`%20`) mais `name`
 * en clair : les chemins retournés à l'interface sont décodés pour rester
 * composable (fil d'Ariane, montée d'un niveau). Le NAS accepte les deux formes.
 */
function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * GET /api/owner/nas/scan?path=&series_id= — analyse d'un dossier de série
 * avant import par lot.
 *
 * Une seule requête vers le NAS (`/tree`) plus, au plus, une requête `/list`
 * par dossier **non encore importé** : les chapitres déjà en base sont
 * résolus sans toucher au stockage.
 */
export async function GET(request: Request) {
  const guard = await guardNas(request, { limit: 30, windowMs: 60_000 });
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const path = (url.searchParams.get("path") ?? "").trim();
  const seriesId = (url.searchParams.get("series_id") ?? "").trim();

  if (!path || !isSafePath(path)) {
    return jsonError("Chemin refusé (validation anti traversal).", "invalid_path", 400);
  }

  // ── Chapitres déjà en base pour la série ciblée ────────────────────────
  const existants = new Map<number, { id: string; nbPages: number }>();
  if (seriesId) {
    const { items } = await getDb().list<Chapter>(TABLES.chapters, {
      filters: [{ field: "series_id", op: "eq", value: seriesId }],
      limit: 5000,
    });
    for (const chapter of items) {
      existants.set(Math.round(chapter.numero), { id: chapter.id, nbPages: chapter.nb_pages ?? 0 });
    }
  }

  // ── Contenu du dossier (1 appel NAS) ──────────────────────────────────
  let tree: Awaited<ReturnType<typeof nasTree>>;
  try {
    tree = await nasTree(path);
  } catch (err) {
    return jsonError(nasErrorMessage(err), "nas_error", 502);
  }

  const dirs = tree.entries.filter((e) => e.isDir).sort((a, b) => natural(a.name, b.name));
  const fichiers = tree.entries.filter((e) => !e.isDir);
  const imagesRacine = fichiers.filter((f) => IMAGE_EXT.test(f.name)).length;
  const suspects = dirs.slice(MAX_DIRS);

  /* Images posées à côté des dossiers : `Tome 1 LQ.jpg` couvre `Tome 1`,
     ce sont des vignettes de couverture, jamais des planches. */
  const nomsDossiers = new Set(dirs.map((d) => d.name.toLowerCase()));
  const couvertures = fichiers.filter(
    (f) => IMAGE_EXT.test(f.name) && nomsDossiers.has(stemCouverture(f.name)),
  ).length;

  /* Structure dominante : une série de tomes s'affiche en tomes. */
  const unite = uniteDominante(dirs.map((d) => detectNumero(d.name).kind));

  const candidates: Candidate[] = await mapLimit(dirs.slice(0, MAX_DIRS), CONCURRENCY, async (dir) => {
    const chemin = decodePath(dir.path);
    const { numero, kind } = detectNumero(dir.name);
    const deja = numero !== null && existants.has(numero);
    const existant = numero !== null ? existants.get(numero) : undefined;

    if (deja && existant) {
      return {
        name: dir.name,
        path: chemin,
        numero,
        kind,
        pages: existant.nbPages,
        dejaImporte: true,
        chapterId: existant.id,
        etat: "deja_importe",
        selectionne: false,
      } satisfies Candidate;
    }

    // Dossier inconnu : une lecture NAS suffit à savoir s'il porte des planches.
    let pages = 0;
    try {
      const listing = await nasList(chemin);
      pages = listing.pages.length;
    } catch {
      pages = 0;
    }

    if (pages === 0) {
      return {
        name: dir.name,
        path: chemin,
        numero,
        kind,
        pages: 0,
        dejaImporte: false,
        etat: "pas_d_image",
        selectionne: false,
      } satisfies Candidate;
    }

    const indetermine = numero === null;
    return {
      name: dir.name,
      path: chemin,
      numero,
      kind,
      pages,
      dejaImporte: false,
      etat: indetermine ? "numero_a_corriger" : "pret",
      // Unité identifiée (tome ou chapitre) : cochée d'office dans l'interface.
      selectionne: !indetermine,
    } satisfies Candidate;
  });

  const avertissements: string[] = [];
  if (suspects.length > 0) {
    avertissements.push(
      `${suspects.length} dossier(s) non analysés : la limite de ${MAX_DIRS} dossiers par scan est atteinte.`,
    );
  }
  if (couvertures > 0) {
    avertissements.push(
      `${couvertures} couverture(s) à côté des dossiers (« Tome 1 LQ.jpg ») : ignorée(s), ce ne sont pas des planches.`,
    );
  } else if (imagesRacine > 0) {
    avertissements.push(
      `${imagesRacine} image(s) directement dans ce dossier : elles ne font pas partie d'un chapitre et sont ignorées.`,
    );
  }
  if (dirs.length === 0 && imagesRacine === 0) {
    avertissements.push("Aucun sous-dossier ni image détecté à cet emplacement.");
  }

  return Response.json({
    path: tree.path,
    dossier: path.split("/").filter(Boolean).pop() ?? path,
    candidates,
    imagesRacine,
    couvertures,
    unite,
    avertissements,
    total: dirs.length,
    scannes: Math.min(dirs.length, MAX_DIRS),
  });
}
