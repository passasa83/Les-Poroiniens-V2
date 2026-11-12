import { decimal, type Periode, type Point } from "../_lib/periodes";

/* ── Graphique (rendu serveur : lisible sans JavaScript) ────────────────── */

export function Graphique({
  points,
  periode,
  detail,
}: {
  points: Point[];
  periode: Periode;
  detail: string;
}) {
  const maxPages = Math.max(1, ...points.map((p) => p.pages));
  const totalPages = points.reduce((somme, p) => somme + p.pages, 0);
  const totalChapitres = points.reduce((somme, p) => somme + p.chapitres, 0);
  const moyenne = totalPages / points.length;
  const base = 130;
  const pas = 600 / points.length;
  const largeurBarre = Math.max(4, pas - (points.length > 16 ? 4 : 8));
  const pasLibelle = points.length <= 12 ? 1 : Math.ceil(points.length / 6);

  return (
    <section className="card space-y-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Pages lues — {detail}</h2>
        <p className="text-xs text-muted">pages par jour ou par mois</p>
      </div>

      {/* Chiffres clés en toutes lettres : lisibles avant même le graphique. */}
      <p className="text-sm text-fg">
        Total : <strong>{totalPages}</strong> page{totalPages > 1 ? "s" : ""} ·{" "}
        <strong>{totalChapitres}</strong> chapitre{totalChapitres > 1 ? "s" : ""} · moyenne de{" "}
        {decimal(moyenne)} page{moyenne > 1 ? "s" : ""} par {periode === "annee" ? "mois" : "jour"}{" "}
        · maximum {maxPages} page
        {maxPages > 1 ? "s" : ""} sur une même période
      </p>

      <svg
        viewBox="0 0 600 170"
        className="mt-1 w-full"
        role="img"
        aria-label={`Pages lues sur les ${detail} : ${totalPages} pages au total, maximum ${maxPages} pages sur une même période`}
      >
        <line
          x1="0"
          y1={base + 0.5}
          x2="600"
          y2={base + 0.5}
          stroke="var(--line)"
          strokeWidth="1"
        />
        {points.map((point, i) => {
          const hauteur = (point.pages / maxPages) * 118;
          const x = i * pas + (pas - largeurBarre) / 2;
          const y = base - hauteur;
          const estLibelle = i % pasLibelle === 0 || i === points.length - 1 || points.length <= 12;
          return (
            <g key={point.cle}>
              <rect
                className="chart-bar"
                style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }}
                x={x}
                y={y}
                width={largeurBarre}
                height={Math.max(point.pages > 0 ? 2 : 0, hauteur)}
                rx="2"
                fill={point.pages > 0 ? "var(--primary)" : "var(--surface2)"}
              >
                <title>{`${point.intitule} : ${point.pages} page(s), ${point.chapitres} chapitre(s)`}</title>
              </rect>
              {estLibelle && (
                <text
                  x={x + largeurBarre / 2}
                  y={base + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {point.libelle}
                </text>
              )}
            </g>
          );
        })}
        <text x="0" y="165" fontSize="10" fill="var(--muted)">
          Maximum : {maxPages} page(s) / {periode === "annee" ? "mois" : "jour"}
        </text>
      </svg>

      {/* Le tableau reste consultable sans JavaScript et pour les lecteurs
          d'écran : chaque valeur du graphique existe aussi en texte. */}
      <details className="rounded-xl border border-line bg-surface2 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-fg">
          Voir les valeurs en tableau
        </summary>
        <table className="mt-3 w-full text-left text-sm">
          <caption className="sr-only">Pages et chapitres lus, {detail}</caption>
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="py-1 pr-4 font-medium">
                Période
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Pages
              </th>
              <th scope="col" className="py-1 font-medium">
                Chapitres
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.cle} className="border-t border-line/60">
                <th scope="row" className="py-1 pr-4 font-medium text-fg">
                  {point.intitule}
                </th>
                <td className="py-1 pr-4 text-fg">{point.pages}</td>
                <td className="py-1 text-fg">{point.chapitres}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
