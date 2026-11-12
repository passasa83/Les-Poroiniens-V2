import type { Classification, Unite } from "@/lib/types";

export type SeriesLite = {
  id: string;
  titre: string;
  slug: string;
  classification: Classification;
  /** Organisation de la série : chapitres ou tomes (« Tome 3 » partout). */
  unite: Unite;
};

export type PageEntry = { name: string; preview: string | null };

export type ImportResult = {
  chapterId: string;
  numero: number;
  /** Organisation retenue à la création (« Tome 3 créé » dans le rapport). */
  unite: Unite;
  titre: string;
  slug: string;
  nbPages: number;
  seriesTitre: string;
  storage: "nas" | "demo" | "imgchest";
  statut: ImportStatut;
  warning?: string;
};

export type NasItem = { name: string; isDir: boolean };

/** Album ImgChest : un album = une unité de lecture, ses images sont servies par le CDN. */
export type ImgPost = {
  id: string;
  title: string;
  views: number;
  nsfw: boolean;
  thumbnail: string | null;
  created: string | null;
};

export type ImgInfo = {
  id: string;
  title: string;
  count: number;
  bytes: number;
  views: number;
  nsfw: boolean;
};

/** Aperçu d'un dossier avant indexation (étape 2). */
export type PreviewData = {
  path: string;
  count: number;
  missing: number[];
  duplicates: string[][];
  anomalies: { name: string; reason: string }[];
};

/** Candidat renvoyé par `/api/owner/nas/scan` (import par lot). */
export type ScanCandidate = {
  name: string;
  path: string;
  numero: number | null;
  kind: "chapitre" | "volume" | "dossier";
  pages: number;
  dejaImporte: boolean;
  etat: "pret" | "deja_importe" | "pas_d_image" | "numero_a_corriger";
  selectionne: boolean;
};

/** Ligne du rapport de lot : créé, ignoré ou en erreur. */
export type BatchRow = {
  name: string;
  numero: number | null;
  statut: "cours" | "ok" | "erreur";
  pages?: number;
  message?: string;
};

export const ETAT_LABEL: Record<ScanCandidate["etat"], string> = {
  pret: "Prêt à importer",
  deja_importe: "Déjà importé",
  pas_d_image: "Aucune image",
  numero_a_corriger: "Numéro à corriger",
};

export type ImportStatut = "draft" | "scheduled" | "published";

/** Tri naturel : page-2 avant page-10. */
export function naturalSort(entries: PageEntry[]): PageEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
}

export function normalizeNas(raw: unknown): NasItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): NasItem => {
      if (typeof item === "string") return { name: item, isDir: item.endsWith("/") };
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? row.path ?? row.filename ?? "");
      const type = String(row.type ?? "");
      const isDir =
        type === "dir" ||
        type === "directory" ||
        type === "folder" ||
        row.is_dir === true ||
        row.isDir === true ||
        name.endsWith("/");
      return { name, isDir };
    })
    .filter((item) => item.name.length > 0);
}

/** Taille lisible : `18,4 Mo` (album ImgChest avant import). */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/** POST/PATCH JSON vers une route d'import ; corps de réponse lu sans lever. */
export async function sendJson<T>(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<{ res: Response; data: (T & { error?: string }) | null }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  return { res, data };
}

/** GET JSON ; corps de réponse lu sans lever. */
export async function getJson<T>(
  url: string,
): Promise<{ res: Response; data: (T & { error?: string }) | null }> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  return { res, data };
}
