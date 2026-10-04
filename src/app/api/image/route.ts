import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Proxy d'images vers le NAS (§5.3) : n'utilisé qu'en l'absence de CDN.
 * Le NAS n'est jamais exposé directement : clé côté serveur, chemin validé,
 * en-tête de cache long pour que le CDN en amont puisse absorber les lectures.
 */
export async function GET(request: NextRequest) {
  const base = process.env.NAS_API_URL;
  const key = process.env.NAS_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { error: "source_unavailable", code: "NAS_NOT_CONFIGURED" },
      { status: 502 },
    );
  }

  const rawPath = request.nextUrl.searchParams.get("path") ?? "";
  if (!rawPath || rawPath.includes("..") || rawPath.startsWith("/")) {
    return NextResponse.json({ error: "bad_path", code: "INVALID_PATH" }, { status: 400 });
  }

  try {
    const target = `${base.replace(/\/$/, "")}/file?path=${encodeURIComponent(rawPath)}`;
    const upstream = await fetch(target, {
      headers: { "x-api-key": key },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "source_error", code: "NAS_ERROR" },
        { status: 502, headers: { "X-Cache": "MISS" } },
      );
    }
    const blob = await upstream.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Cache": upstream.headers.get("x-cache") ?? "MISS",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "source_unreachable", code: "NAS_UNREACHABLE" },
      { status: 502 },
    );
  }
}
