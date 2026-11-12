import { dateLongue, type Regularite } from "../_lib/periodes";

/** Grille des 30 derniers jours et indicateurs de régularité. */
export function RegulariteSection({
  regularite,
  joursConsecutifs,
}: {
  regularite: Regularite;
  joursConsecutifs: number;
}) {
  const joursRestants = 30 - regularite.joursActifs30;
  const regularite30 = Math.round((regularite.joursActifs30 / 30) * 100);
  return (
    <section className="card space-y-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Régularité</h2>
        <p className="text-xs text-muted">jours de lecture sur les 30 derniers jours</p>
      </div>

      <div
        className="flex flex-wrap gap-1"
        role="img"
        aria-label={`${regularite.joursActifs30} jours de lecture sur les 30 derniers jours`}
      >
        {regularite.grille.map((jour) => (
          <span
            key={jour.date}
            title={`${dateLongue(jour.date)} : ${jour.actif ? "lecture" : "aucune lecture"}`}
            aria-hidden
            className={`size-3.5 rounded-[3px] border border-line ${
              jour.actif ? "bg-primary" : "bg-surface2"
            }`}
          />
        ))}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface2 px-4 py-3">
          <dt className="text-xs text-muted">Jours de lecture (30 jours)</dt>
          <dd className="mt-1 text-xl font-black text-fg">{regularite.joursActifs30} / 30</dd>
          <dd className="text-xs text-muted">
            {regularite30} % du mois · {joursRestants} jour
            {joursRestants > 1 ? "s" : ""} sans lecture
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface2 px-4 py-3">
          <dt className="text-xs text-muted">Jours consécutifs (en cours)</dt>
          <dd className="mt-1 text-xl font-black text-fg">{joursConsecutifs}</dd>
          <dd className="text-xs text-muted">
            {joursConsecutifs > 0
              ? `une lecture chaque jour depuis ${joursConsecutifs} jour${
                  joursConsecutifs > 1 ? "s" : ""
                }`
              : "aucune série en cours"}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface2 px-4 py-3">
          <dt className="text-xs text-muted">Meilleure série de jours</dt>
          <dd className="mt-1 text-xl font-black text-fg">{regularite.meilleureSerie}</dd>
          <dd className="text-xs text-muted">plus longue suite ininterrompue de lectures</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface2 px-4 py-3">
          <dt className="text-xs text-muted">Jours de lecture (12 mois)</dt>
          <dd className="mt-1 text-xl font-black text-fg">{regularite.joursActifs12Mois} / 365</dd>
          <dd className="text-xs text-muted">
            {regularite.derniereLecture
              ? `dernière lecture : ${dateLongue(regularite.derniereLecture)}`
              : "aucune lecture enregistrée"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
