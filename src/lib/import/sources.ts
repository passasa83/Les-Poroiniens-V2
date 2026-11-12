import "server-only";
import { demoPagePath } from "@/server/db/seed";
import { imgchestErrorMessage, imgchestPost } from "@/lib/imgchest";
import { nasErrorMessage, nasList } from "@/lib/nas";

/*
 * Sources d'import : chacune renvoie l'index des pages d'une unité de
 * lecture (chemin ou URL, dimensions, poids, hash), sans rien écrire. Les
 * octets ne transitent jamais par le serveur : seul l'index est stocké.
 */

export type IndexedPage = {
  chemin: string;
  largeur: number;
  hauteur: number;
  bytes?: number;
  hash?: string;
};

export type Storage = "nas" | "imgchest" | "demo";

export interface SourceIndex {
  storage: Storage;
  pages: IndexedPage[];
}

/** Échec d'une source, traduit en réponse HTTP par la route. */
export class SourceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Dimensions par défaut d'une planche quand la source ne les donne pas. */
const LARGEUR = 1200;
const HAUTEUR = 1800;

/**
 * Album ImgChest déjà publié par le Gérant : les URLs CDN sont résolues ici
 * puis stockées en base — la lecture n'appelle jamais ImgChest.
 */
export async function indexFromImgchest(albumId: string): Promise<SourceIndex> {
  if (!/^[a-z0-9]{4,32}$/i.test(albumId)) {
    throw new SourceError("Identifiant d'album ImgChest invalide.", "invalid_body", 400);
  }
  let album;
  try {
    album = await imgchestPost(albumId);
  } catch (err) {
    throw new SourceError(imgchestErrorMessage(err), "imgchest_error", 502);
  }
  return {
    storage: "imgchest",
    pages: album.files.map((file) => ({
      chemin: file.url,
      largeur: file.width ?? LARGEUR,
      hauteur: file.height ?? HAUTEUR,
      ...(file.bytes ? { bytes: file.bytes } : {}),
      ...(file.hash ? { hash: file.hash } : {}),
    })),
  };
}

/**
 * Dossier du NAS : listing côté serveur (`GET /list`), largeurs, hauteurs,
 * poids et hash lus sur le NAS.
 */
export async function indexFromNas(path: string): Promise<SourceIndex> {
  let listing;
  try {
    listing = await nasList(path);
  } catch (err) {
    throw new SourceError(nasErrorMessage(err), "nas_error", 502);
  }
  if (listing.pages.length === 0) {
    throw new SourceError(
      "Aucune image détectée dans ce dossier (format attendu : 001.webp, 002.webp…).",
      "empty_folder",
      422,
    );
  }
  return {
    storage: "nas",
    pages: listing.pages.map((page) => ({
      chemin: page.path || `${path}/${page.name}`,
      largeur: page.width ?? LARGEUR,
      hauteur: page.height ?? HAUTEUR,
      ...(page.bytes ? { bytes: page.bytes } : {}),
      ...(page.hash ? { hash: page.hash } : {}),
    })),
  };
}

/**
 * Noms de pages seuls (NAS non configuré) : planches de démonstration, pour
 * remplir et tester le site sans source réelle.
 */
export function indexDemo(seriesSlug: string, numero: number, names: string[]): SourceIndex {
  const tries = [...names].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  return {
    storage: "demo",
    pages: tries.map((_, index) => ({
      chemin: demoPagePath(seriesSlug, numero, index),
      largeur: LARGEUR,
      hauteur: HAUTEUR,
      bytes: 0,
      hash: `demo-${index}`,
    })),
  };
}

/** Message de fin d'import, par source (journal des jobs). */
export function messageResultat(
  libelle: string,
  index: SourceIndex,
  origine: string,
  warning?: string,
): string {
  const n = index.pages.length;
  if (warning)
    return `${libelle} indexé (${n} pages) mais le déplacement NAS a échoué : ${warning}`;
  if (index.storage === "nas") return `${libelle} indexé : ${n} pages depuis ${origine}.`;
  if (index.storage === "imgchest") {
    return `${libelle} indexé : ${n} pages depuis l'album ImgChest ${origine}.`;
  }
  return `${libelle} créé avec ${n} pages de démonstration — utilisez l'onglet « Depuis le NAS » pour indexer les scans réels.`;
}
