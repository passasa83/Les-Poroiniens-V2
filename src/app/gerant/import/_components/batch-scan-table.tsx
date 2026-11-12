import { Badge } from "@/components/ui/kit";
import { libelleUniteSingulier, libelleUnitesPluriel } from "@/lib/format";
import type { Unite } from "@/lib/types";
import { ETAT_LABEL, type ScanCandidate } from "./types";

/* ── Résultat de l'analyse d'un dossier de série (import par lot) ───────── */

const ETAT_TONE: Record<ScanCandidate["etat"], "ok" | "neutral" | "warn"> = {
  pret: "ok",
  deja_importe: "neutral",
  pas_d_image: "neutral",
  numero_a_corriger: "warn",
};

/**
 * Analyse d'un dossier de série avant import : chaque ligne est un sous-dossier
 * du dépôt. La colonne de numéro suit l'organisation détectée (« N° de tome »
 * pour un dépôt structuré en tomes) et le chemin complet reste affiché :
 * un dossier « Tome 4 » est un contenu normal, pas un cas particulier.
 */
export function BatchScanTable({
  candidates,
  unite,
  checked,
  numeros,
  onCheck,
  onNumero,
  onSelectAll,
}: {
  candidates: ScanCandidate[];
  /** Organisation détectée par l'analyse (colonne et libellés ARIA). */
  unite: Unite;
  checked: Record<string, boolean>;
  numeros: Record<string, string>;
  onCheck: (path: string, value: boolean) => void;
  onNumero: (path: string, value: string) => void;
  onSelectAll: (value: boolean) => void;
}) {
  const pret = candidates.filter((c) => c.etat === "pret").length;
  const deja = candidates.filter((c) => c.etat === "deja_importe").length;
  const sing = libelleUniteSingulier(unite).toLowerCase();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg">
          {candidates.length} sous-dossier(s) — {pret} à importer
          {deja > 0 && ` · ${deja} déjà importé(s)`}{" "}
          <span className="ml-2 text-xs font-normal text-muted">
            structure détectée : {libelleUnitesPluriel(unite).toLowerCase()}
          </span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => onSelectAll(true)}
          >
            Tout cocher
          </button>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => onSelectAll(false)}
          >
            Tout décocher
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2 font-semibold">Importer</th>
              <th className="px-3 py-2 font-semibold">Dossier</th>
              <th className="px-3 py-2 font-semibold">{`N° de ${sing}`}</th>
              <th className="px-3 py-2 text-right font-semibold">Planches</th>
              <th className="px-3 py-2 font-semibold">État</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((cand) => {
              const disabled = cand.etat !== "pret";
              return (
                <tr key={cand.path} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-primary,#3b82f6)]"
                      checked={Boolean(checked[cand.path])}
                      disabled={disabled}
                      aria-label={`Importer ${cand.name}`}
                      onChange={(e) => onCheck(cand.path, e.target.checked)}
                    />
                  </td>
                  <td className="max-w-[18rem] px-3 py-2">
                    <span className="block truncate text-fg" title={cand.path}>
                      {cand.name}
                    </span>
                    <span className="block truncate text-xs text-muted">{cand.path}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      className="input w-24"
                      value={numeros[cand.path] ?? ""}
                      disabled={cand.etat === "deja_importe" || cand.etat === "pas_d_image"}
                      aria-label={`Numéro de ${sing} pour ${cand.name}`}
                      onChange={(e) => onNumero(cand.path, e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{cand.pages}</td>
                  <td className="px-3 py-2">
                    <Badge tone={ETAT_TONE[cand.etat]}>{ETAT_LABEL[cand.etat]}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
