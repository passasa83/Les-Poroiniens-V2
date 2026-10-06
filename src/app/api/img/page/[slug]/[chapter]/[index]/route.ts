import { serieDeDemo } from "@/lib/demo-gate";

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
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Page de scan de démonstration : une planche SVG déterministe.
 * En production, `pages.chemin` pointe vers le NAS/CDN et cette route
 * ne sert plus qu'aux chemins locaux (voir src/lib/media.ts).
 *
 * Les chemins `demoPagePath` d'une série de la graine sont toutefois refusés
 * en production (masquage du jeu de démo) : seuls ces slugs-là sont bloqués,
 * les séries importées ayant reçu des planches placeholder via
 * `/api/owner/import` (slug non démo) restent servies.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; chapter: string; index: string }> },
) {
  const { slug, chapter, index } = await params;
  if (serieDeDemo(slug)) {
    return new Response("Planche introuvable", { status: 404 });
  }
  const page = Number(index) || 0;
  const seed = hash(`${slug}-${chapter}-${page}`);

  // Grille de cases 3×4, quelques-unes fusionnées pour varier la mise en page
  const cols = 3;
  const rows = 4;
  const margin = 60;
  const gap = 18;
  const width = 1200;
  const height = 1800;
  const headerH = 90;
  const footerH = 80;
  const cellW = (width - margin * 2 - gap * (cols - 1)) / cols;
  const cellH = (height - headerH - footerH - margin - gap * (rows - 1)) / rows;

  const panels: string[] = [];
  let panelIndex = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const merge = (seed >> (panelIndex % 12)) % 7 === 0 && c < cols - 1;
      const w = merge ? cellW * 2 + gap : cellW;
      const x = margin + c * (cellW + gap);
      const y = headerH + margin + r * (cellH + gap);
      const tone = 232 + ((seed >> (panelIndex % 16)) % 3) * 4;
      const accent = `hsl(${(seed + panelIndex * 37) % 360} 30% ${40 + ((seed >> (panelIndex % 9)) % 3) * 8}%)`;
      const figures = Array.from({ length: 3 }, (_, i) => {
        const fx = x + 30 + ((seed >> ((panelIndex + i) % 18)) % Math.max(1, Math.floor(w - 90)));
        const fy = y + 40 + ((seed >> ((panelIndex + i * 3) % 19)) % Math.max(1, Math.floor(cellH - 110)));
        return `<ellipse cx="${fx}" cy="${fy}" rx="${26 + i * 12}" ry="${34 + i * 8}" fill="${accent}" opacity="0.55"/>`;
      }).join("");
      panels.push(`
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${cellH}" fill="rgb(${tone},${tone},${tone + 4})" stroke="#111" stroke-width="4"/>
      ${figures}
      <rect x="${x + 14}" y="${y + 14}" width="${Math.max(20, w - 160)}" height="6" fill="rgba(0,0,0,0.15)"/>
      <rect x="${x + 14}" y="${y + 30}" width="${Math.max(20, w - 220)}" height="6" fill="rgba(0,0,0,0.12)"/>
    </g>`);
      if (merge) c++;
      panelIndex++;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${margin}" y="52" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#111">${escapeXml(slug.replace(/-/g, " "))}</text>
  <text x="${width - margin}" y="52" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#666">Ch. ${escapeXml(chapter)}</text>
  ${panels.join("\n")}
  <text x="${width / 2}" y="${height - 34}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#666">— ${page + 1} —</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Cache": "DEMO",
    },
  });
}
