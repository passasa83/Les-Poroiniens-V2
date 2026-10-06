// Recette des chapitres à numéros décimaux (`8.5`, `10.51`) — sans compte.
//   BASE=http://localhost:3000 node scripts/recette-decimaux.mjs
//
// Contrôle : une fiche listant un lien `chapitre-<entier>.<décimales>`,
// la page du chapitre (200, libellé « Chapitre 8.5 », navigation
// précédent/suivant, pages de scan), et l'absence de 404 réel du proxy.
const BASE = process.env.BASE || "http://localhost:3000";

let ko = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) ko++;
};

const strip = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");

async function html(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const raw = await res.text();
  return { status: res.status, raw, text: strip(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
}

/* Cible : d'abord le sitemap (chapitres publiés non adultes), sinon les
   fiches du catalogue (comme `e2e-lecteur.mjs`, sans le restreindre aux
   entiers). */
async function decouvrirCible() {
  try {
    const res = await fetch(`${BASE}/sitemap.xml`);
    const xml = await res.text();
    const m = xml.match(/\/serie\/([^/<"]+)\/chapitre-(\d+\.\d+)/);
    if (m) return { slug: m[1], numero: m[2] };
  } catch { /* repli catalogue */ }
  for (let page = 1; page <= 12; page++) {
    const cat = await html(`/catalogue?page=${page}`);
    if (cat.status !== 200) return null;
    const slugs = [...new Set([...cat.raw.matchAll(/<a [^>]*href="\/serie\/([^"?#]+)"/g)].map((m) => m[1]))];
    if (slugs.length === 0) return null;
    for (const slug of slugs) {
      const fiche = await html(`/serie/${slug}`);
      if (fiche.status !== 200) continue;
      const m = fiche.raw.match(new RegExp(`/serie/${slug}/chapitre-(\\d+\\.\\d+)`));
      if (m) return { slug, numero: m[1] };
    }
  }
  return null;
}

const cible = await decouvrirCible();
if (!cible) {
  console.log("SKIP chapitre décimal — aucun lien `chapitre-<décimal>` trouvé (sitemap + 12 pages de catalogue)");
  process.exit(0);
}
const { slug, numero } = cible;
console.log(`Cible : /serie/${slug}/chapitre-${numero}`);

const page = await html(`/serie/${slug}/chapitre-${numero}`);
check(page.status === 200, "page de chapitre décimal servie — HTTP", String(page.status));
check(!/name="robots" content="noindex/.test(page.raw) || /Chapitre /.test(page.text), "page non bloquée (ni noindex ni portail)");
check(new RegExp(`Chapitre ${numero.replace(".", "\\.")}`).test(page.text), `libellé « Chapitre ${numero} » affiché`);
check(!/\bundefined\b/.test(page.text), "aucun « undefined » affiché");
check(/data-reader-bar="haut"/.test(page.raw), "lecteur rendu (barre haute)");
check(new RegExp(`alt="Page 1 du chapitre ${numero.replace(".", "\\.")}"`).test(page.raw), `alt « Page 1 du chapitre ${numero} »`);

const hrefs = [...page.raw.matchAll(new RegExp(`/serie/${slug}/chapitre-(\\d+(?:\\.\\d+)?)`, "g"))].map((m) => m[1]);
const uniques = [...new Set(hrefs)].map(Number).sort((a, b) => a - b);
const idx = uniques.indexOf(Number(numero));
check(idx >= 0, "chapitre présent dans la navigation", uniques.join(", "));
if (idx > 0) {
  const prev = await html(`/serie/${slug}/chapitre-${uniques[idx - 1]}`);
  check(prev.status === 200, `chapitre précédent (${uniques[idx - 1]}) — HTTP`, String(prev.status));
}
if (idx >= 0 && idx < uniques.length - 1) {
  const next = await html(`/serie/${slug}/chapitre-${uniques[idx + 1]}`);
  check(next.status === 200, `chapitre suivant (${uniques[idx + 1]}) — HTTP`, String(next.status));
}

/* Robustesse : un segment non numérique reste introuvable, sans casser. */
const faux = await html(`/serie/${slug}/chapitre-onceupon`);
check(faux.status === 404 || /noindex/.test(faux.raw), "segment non numérique : 404 réel ou noindex", `HTTP ${faux.status}`);

console.log(ko === 0 ? "\n✔ Chapitres décimaux : tout est vert" : `\n✖ ${ko} contrôle(s) en échec`);
process.exit(ko === 0 ? 0 : 1);
