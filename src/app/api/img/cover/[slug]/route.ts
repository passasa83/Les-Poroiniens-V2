import { getSeriesBySlug } from "@/lib/data/series";

export const runtime = "nodejs";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(text: string, perLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > perLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
    if (lines.length >= 4) break;
  }
  if (current.trim()) lines.push(current.trim());
  return lines.slice(0, 4);
}

/** Couverture générée (démo). En production, les couvertures viennent d'Appwrite Storage. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const series = await getSeriesBySlug(slug);
  const title = series?.titre ?? slug.replace(/-/g, " ");
  const adult = series?.classification === "adult";
  const seed = hash(slug);
  const hue1 = seed % 360;
  const hue2 = (hue1 + 60 + (seed % 120)) % 360;
  const lines = wrap(title, 14);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue1} 65% 42%)"/>
      <stop offset="100%" stop-color="hsl(${hue2} 70% 24%)"/>
    </linearGradient>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="2" fill="rgba(255,255,255,0.16)"/>
    </pattern>
  </defs>
  <rect width="600" height="900" fill="url(#g)"/>
  <rect width="600" height="900" fill="url(#dots)"/>
  <circle cx="${120 + (seed % 300)}" cy="${180 + (seed % 200)}" r="150" fill="rgba(255,255,255,0.10)"/>
  <circle cx="${420 - (seed % 200)}" cy="${640 - (seed % 200)}" r="210" fill="rgba(0,0,0,0.18)"/>
  <rect x="36" y="36" width="528" height="828" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="60" y="${640 + i * 56}" font-family="Georgia, serif" font-size="46" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`,
    )
    .join("\n  ")}
  <text x="60" y="700" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.85)">${escapeXml(series?.auteurs.join(" · ") ?? "Auteur inconnu")}</text>
  ${
    adult
      ? `<rect x="452" y="740" width="112" height="44" rx="22" fill="#fb7185"/><text x="508" y="769" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#1a0a10">+18</text>`
      : `<text x="60" y="826" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="rgba(255,255,255,0.7)">${escapeXml((series?.type ?? "manga").toUpperCase())}</text>`
  }
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
