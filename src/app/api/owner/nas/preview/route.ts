import { jsonError, guardNas } from "../guard";
import { isSafePath, nasErrorMessage, nasList } from "@/lib/nas";

export const runtime = "nodejs";

type Anomaly = { name: string; reason: string };

/** Pages manquantes dans la séquence : `001, 002, 004` → `[3]`. */
function missingIndexes(names: string[]): number[] {
  const numbers = names
    .map((name) => Number((name.match(/^\D*(\d+)/)?.[1] ?? "")))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (numbers.length === 0) return [];
  const present = new Set(numbers);
  const max = Math.max(...numbers);
  const missing: number[] = [];
  for (let i = 1; i <= max; i++) if (!present.has(i)) missing.push(i);
  return missing;
}

/**
 * GET /api/owner/nas/preview?path= — aperçu d'un chapitre avant indexation
 * (§5.1, étape 2) : nombre de pages, trous de numérotation, doublons de hash
 * et pages inhabituelles (poids, proportions, dimensions absentes).
 */
export async function GET(request: Request) {
  const guard = await guardNas(request);
  if (!guard.ok) return guard.response;

  const path = (new URL(request.url).searchParams.get("path") ?? "").trim();
  if (!isSafePath(path)) {
    return jsonError("Chemin refusé (validation anti traversal).", "invalid_path", 400);
  }

  let listing: Awaited<ReturnType<typeof nasList>>;
  try {
    listing = await nasList(path);
  } catch (err) {
    return jsonError(nasErrorMessage(err), "nas_error", 502);
  }

  const pages = listing.pages;
  const anomalies: Anomaly[] = [];

  for (const index of missingIndexes(pages.map((p) => p.name))) {
    anomalies.push({ name: `page ${index}`, reason: "numéro manquant dans la séquence" });
  }

  const byHash = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.hash) continue;
    byHash.set(page.hash, [...(byHash.get(page.hash) ?? []), page.name]);
  }
  for (const [hash, names] of byHash) {
    if (names.length > 1) {
      anomalies.push({ name: names.join(", "), reason: `contenu identique (${hash.slice(0, 8)})` });
    }
  }

  for (const page of pages) {
    if (!page.width || !page.height) {
      anomalies.push({ name: page.name, reason: "dimensions inconnues" });
      continue;
    }
    const ratio = page.width / page.height;
    if (ratio < 0.3 || ratio > 2) {
      anomalies.push({ name: page.name, reason: `proportions inhabituelles ${page.width}×${page.height}` });
    }
    if (page.bytes && page.bytes > 4_000_000) {
      anomalies.push({ name: page.name, reason: `fichier très lourd (${Math.round(page.bytes / 1e6)} Mo)` });
    }
  }

  return Response.json({
    path,
    count: pages.length,
    pages: pages.map((page, index) => ({
      index,
      name: page.name,
      width: page.width ?? null,
      height: page.height ?? null,
      bytes: page.bytes ?? null,
      hash: page.hash ?? null,
    })),
    missing: missingIndexes(pages.map((p) => p.name)),
    duplicates: [...byHash.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([, names]) => names),
    anomalies,
  });
}
