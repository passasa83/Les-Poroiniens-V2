import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getChapterById } from "@/lib/data/chapters";
import { libraryWithSeries } from "@/lib/data/library";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const COLUMNS = [
  "titre",
  "statut",
  "favori",
  "note",
  "dernier_chapitre",
  "derniere_page",
  "mis_a_jour",
] as const;

function csvCell(value: string | number | boolean | null): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * GET /api/account/library/export?format=json|csv — export de la bibliothèque
 * (§7.3). Identité lue dans la session serveur, jamais dans l'URL.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`account:library-export:${user.id}:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop d'exports récents. Réessayez dans un instant.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const entries = await libraryWithSeries(user.id);

  const rows = await Promise.all(
    entries.map(async (entry) => {
      const chapter = entry.last_chapter_id ? await getChapterById(entry.last_chapter_id) : null;
      return {
        series_id: entry.series_id,
        titre: entry.series?.titre ?? entry.series_id,
        slug: entry.series?.slug ?? null,
        statut: entry.statut,
        favori: entry.favori,
        note: entry.note,
        dernier_chapitre: chapter ? chapter.numero : null,
        derniere_page: entry.last_page,
        mis_a_jour: entry.updated_at,
      };
    }),
  );

  const day = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    // BOM UTF-8 : Excel ouvre correctement les accents français.
    const lines = [COLUMNS.join(";")];
    for (const row of rows) {
      lines.push(
        [
          csvCell(row.titre),
          csvCell(row.statut),
          csvCell(row.favori),
          csvCell(row.note),
          csvCell(row.dernier_chapitre),
          csvCell(row.derniere_page),
          csvCell(row.mis_a_jour),
        ].join(";"),
      );
    }
    return new NextResponse(`\uFEFF${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bibliotheque-poroiniens-${day}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      format: "poroiniens/bibliotheque/v1",
      exporte_le: new Date().toISOString(),
      total: rows.length,
      entrees: rows,
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="bibliotheque-poroiniens-${day}.json"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
