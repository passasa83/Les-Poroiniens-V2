import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDb, TABLES } from "@/lib/db";
import { filtresSansDemo } from "@/lib/demo-gate";
import { getLibraryEntry, upsertLibraryEntry } from "@/lib/data/library";
import { getSeriesById, getSeriesBySlug } from "@/lib/data/series";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { atLeast } from "@/lib/roles";
import type { LibraryStatus, Series } from "@/lib/types";

export const runtime = "nodejs";

const STATUTS: LibraryStatus[] = ["en_cours", "a_lire", "termine", "en_pause", "abandonne"];

/** Accepte la clé interne (`en_cours`) comme le libellé affiché (« En cours »). */
const STATUTS_LIBELLES: Record<string, LibraryStatus> = {
  en_cours: "en_cours",
  a_lire: "a_lire",
  termine: "termine",
  en_pause: "en_pause",
  abandonne: "abandonne",
  "en cours": "en_cours",
  "à lire": "a_lire",
  "a lire": "a_lire",
  terminé: "termine",
  "en pause": "en_pause",
  abandonné: "abandonne",
};

const Body = z.object({
  format: z.enum(["json", "csv"]),
  contenu: z.string().min(1).max(1_500_000),
});

/** Séparateur `;` (export CSV du site), guillemets doubles échappés. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ";") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = (cells[index] ?? "").trim();
    });
    return row;
  });
}

interface LigneImport {
  series_id?: string;
  slug?: string;
  titre?: string;
  statut?: LibraryStatus;
  favori?: boolean;
  note?: number | null;
}

function toStatut(raw: unknown): LibraryStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const key = raw.trim().toLowerCase();
  if (STATUTS.includes(key as LibraryStatus)) return key as LibraryStatus;
  return STATUTS_LIBELLES[key];
}

function toBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (["true", "1", "oui", "vrai", "x"].includes(value)) return true;
  if (["false", "0", "non", "faux", ""].includes(value)) return false;
  return undefined;
}

function toNote(raw: unknown): number | null | undefined {
  if (raw === null) return null;
  if (raw === "" || raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  const note = Math.round(value);
  if (note < 1 || note > 10) return undefined;
  return note;
}

/** Normalise une ligne JSON ou CSV vers le modèle d'import. */
function normalize(raw: Record<string, unknown>): LigneImport {
  const statut = toStatut(raw.statut);
  const favori = toBoolean(raw.favori);
  const note = toNote(raw.note);
  const seriesId = typeof raw.series_id === "string" ? raw.series_id.trim() : "";
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const titre = typeof raw.titre === "string" ? raw.titre.trim() : "";
  return {
    ...(seriesId ? { series_id: seriesId } : {}),
    ...(slug ? { slug } : {}),
    ...(titre ? { titre } : {}),
    ...(statut ? { statut } : {}),
    ...(favori !== undefined ? { favori } : {}),
    ...(note !== undefined ? { note } : {}),
  };
}

function lireJson(contenu: string): LigneImport[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contenu);
  } catch {
    return null;
  }
  const entrees = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { entrees?: unknown }).entrees)
      ? (parsed as { entrees: unknown[] }).entrees
      : null;
  if (!entrees) return null;
  return entrees
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map(normalize);
}

/** Résolution d'une ligne vers la fiche série (identifiant, slug, puis titre exact). */
async function resolverSerie(line: LigneImport): Promise<Series | null> {
  if (line.series_id) {
    const byId = await getSeriesById(line.series_id);
    if (byId) return byId;
  }
  if (line.slug) {
    const bySlug = await getSeriesBySlug(line.slug);
    if (bySlug) return bySlug;
  }
  if (line.titre) {
    const { items } = await getDb().list<Series>(TABLES.series, {
      filters: [
        { field: "titre", op: "eq", value: line.titre },
        /* Série de la graine : jamais résolue en production (la fiche est
           masquée, une ligne de bibliothèque ne peut pas la remonter). */
        ...filtresSansDemo("series"),
      ],
      limit: 1,
    });
    if (items[0]) return getSeriesById(items[0].id);
  }
  return null;
}

/**
 * POST /api/account/library/import — import d'une bibliothèque.
 *
 * Fusion non destructive : seules les séries absentes de la bibliothèque sont
 * ajoutées, les entrées déjà suivies sont conservées telles quelles. Identité
 * lue dans la session serveur, jamais dans le corps de la requête.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }
  if (!atLeast(user.role, "membre")) {
    return NextResponse.json({ error: "Accès réservé aux membres.", code: "forbidden" }, { status: 403 });
  }

  const limit = rateLimit(`library-import:${user.id}:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop d'imports récents. Réessayez dans un instant.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide.", code: "bad_request" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides.", code: "validation_error" }, { status: 400 });
  }

  const { format, contenu } = parsed.data;
  const lines = format === "json" ? lireJson(contenu) : parseCsv(contenu).map(normalize);
  if (lines === null) {
    return NextResponse.json(
      { error: "Fichier JSON illisible (clés « entrees » ou tableau attendu).", code: "invalid_file" },
      { status: 400 },
    );
  }
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Aucune série à importer dans ce fichier.", code: "empty_file" },
      { status: 400 },
    );
  }
  if (lines.length > 500) {
    return NextResponse.json(
      { error: "Fichier trop volumineux : 500 séries maximum par import.", code: "too_large" },
      { status: 413 },
    );
  }

  let importees = 0;
  let conservees = 0;
  let inconnues = 0;

  for (const line of lines) {
    const series = await resolverSerie(line);
    if (!series) {
      inconnues += 1;
      continue;
    }
    const existing = await getLibraryEntry(user.id, series.id);
    if (existing) {
      conservees += 1;
      continue;
    }
    await upsertLibraryEntry(user.id, series.id, {
      statut: line.statut ?? "a_lire",
      favori: line.favori ?? false,
      note: line.note ?? null,
    });
    importees += 1;
  }

  return NextResponse.json({
    ok: true,
    importees,
    conservees,
    inconnues,
    message: [
      importees > 0 ? `${importees} série${importees > 1 ? "s" : ""} importée${importees > 1 ? "s" : ""}` : null,
      conservees > 0 ? `${conservees} déjà suivie${conservees > 1 ? "s" : ""}` : null,
      inconnues > 0 ? `${inconnues} introuvable${inconnues > 1 ? "s" : ""}` : null,
      importees === 0 && conservees === 0 ? "rien à importer" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });
}
