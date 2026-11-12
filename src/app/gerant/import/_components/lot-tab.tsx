"use client";

import { FolderTree, ListChecks, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { Button, Card, Field, Input, Select } from "@/components/ui/kit";
import { compteUnites, libelleUnitesPluriel } from "@/lib/format";
import { BatchProgress } from "./batch-progress";
import { BatchScanTable } from "./batch-scan-table";
import { Breadcrumbs } from "./breadcrumbs";
import { useBatchImport } from "./use-batch-import";
import type { ImportTarget } from "./use-import-target";
import { childPath, useNasBrowser } from "./use-nas-browser";

/** Onglet « Import par lot » : un dossier de série, ses sous-dossiers indexés en une passe. */
export function LotTab({
  target: t,
  nasConfigured,
}: {
  target: ImportTarget;
  nasConfigured: boolean;
}) {
  const nas = useNasBrowser();
  const b = useBatchImport(t);
  const plur = libelleUnitesPluriel(b.unite).toLowerCase();

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <ListChecks className="size-4 text-primary" /> Import par lot — dossier de série
        </h2>
        <p className="mt-1 text-xs text-muted">
          Pointez le dossier qui contient les {plur} d&apos;une série : chaque sous-dossier est
          analysé, les {plur} déjà en base sont écartés, puis les manquants sont indexés en une
          passe. Un seul « job » suit le lot dans le tableau de bord.
        </p>
      </div>

      {!nasConfigured ? (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Fonctionnalité désactivée : la variable d&apos;environnement{" "}
          <code className="font-mono">NAS_API_BASE</code> n&apos;est pas renseignée.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Filtrer les séries"
              htmlFor="lot-filter"
              hint={`La série cible sert à écarter les ${plur} déjà importés.`}
            >
              <Input
                id="lot-filter"
                value={t.seriesFilter}
                onChange={(e) => t.setSeriesFilter(e.target.value)}
                placeholder="Titre de la série…"
              />
            </Field>
            <Field label="Série cible *" htmlFor="lot-series">
              <Select
                id="lot-series"
                value={t.seriesId}
                onChange={(e) => t.pickSeries(e.target.value)}
              >
                <option value="">— Choisir une série —</option>
                {t.filteredSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titre}
                    {s.classification === "adult" ? " (+18)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Dossier de la série sur le NAS" htmlFor="lot-path">
                <Input
                  id="lot-path"
                  value={nas.path}
                  onChange={(e) => nas.setPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      nas.goTo(nas.path);
                    }
                  }}
                  aria-label="Chemin sur le NAS"
                  placeholder="/scans/mon-manga"
                />
              </Field>
            </div>
            <Button type="button" onClick={() => nas.goTo(nas.path)} disabled={nas.busy}>
              {nas.busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Ouvrir
            </Button>
            <Button
              type="button"
              onClick={() => void b.analyse(nas.path)}
              variant="primary"
              disabled={b.scanBusy || !t.seriesId}
              title={
                t.seriesId
                  ? "Analyser les sous-dossiers de ce dossier"
                  : "Choisissez d'abord la série cible"
              }
            >
              {b.scanBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ListChecks className="size-4" />
              )}
              Analyser le dossier
            </Button>
          </div>

          <Breadcrumbs crumbs={nas.crumbs} onGo={nas.goTo} />

          {(nas.error ?? b.error) && <p className="text-sm text-adult">{nas.error ?? b.error}</p>}

          {nas.items.length > 0 && (
            <ul className="max-h-56 overflow-auto rounded-xl border border-line divide-y divide-line">
              {nas.items
                .filter((item) => item.isDir)
                .slice(0, 60)
                .map((item) => {
                  return (
                    <li key={item.name}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface2"
                        onClick={() => nas.goTo(childPath(nas.path, item.name))}
                      >
                        <FolderTree className="size-4 text-muted" />
                        <span className="truncate">{item.name}</span>
                        <span className="ml-auto text-xs text-muted">ouvrir</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}

          {b.scan && (
            <BatchScanTable
              candidates={b.scan}
              unite={b.unite}
              checked={b.checked}
              numeros={b.numeros}
              onCheck={(path, value) => b.setChecked((prev) => ({ ...prev, [path]: value }))}
              onNumero={(path, value) => b.setNumeros((prev) => ({ ...prev, [path]: value }))}
              onSelectAll={b.selectAll}
            />
          )}

          {b.scan && b.scan.length === 0 && (
            <p className="rounded-xl border border-line bg-surface2 px-4 py-3 text-sm text-muted">
              Aucun sous-dossier dans ce dossier.
            </p>
          )}

          {b.warnings.map((warn) => (
            <p
              key={warn}
              className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn"
            >
              {warn}
            </p>
          ))}

          {b.scan && b.scan.length > 0 && (
            <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface2 px-4 py-3">
              <Field label={`Statut des ${plur} créés`} htmlFor="lot-statut">
                <Select
                  id="lot-statut"
                  value={b.statut}
                  onChange={(e) => b.setStatut(e.target.value as "draft" | "published")}
                >
                  <option value="draft">Brouillon (à publier ensuite)</option>
                  <option value="published">Publié immédiatement</option>
                </Select>
              </Field>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void b.run(nas.path)}
                  disabled={b.busy || b.selected.length === 0}
                >
                  {b.busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  Importer {compteUnites(b.selected.length, b.unite)}
                </Button>
                {b.busy && (
                  <Button type="button" variant="danger" onClick={b.stop}>
                    <Square className="size-4" /> Interrompre
                  </Button>
                )}
              </div>
              <p className="w-full text-xs text-muted">
                {b.selected.length} dossier(s) sélectionné(s) sur {b.scan.length}. L&apos;import se
                fait dossier par dossier : les erreurs sont listées sans arrêter le lot.
              </p>
            </div>
          )}

          <BatchProgress
            busy={b.busy}
            runIndex={b.runIndex}
            total={b.selected.length}
            unite={b.unite}
            rows={b.rows}
          />

          {b.summary && !b.busy && (
            <p
              className={`rounded-xl border px-4 py-3 text-sm ${
                b.summary.echecs > 0
                  ? "border-adult/40 bg-adult/10 text-adult"
                  : "border-ok/40 bg-ok/10 text-ok"
              }`}
            >
              Lot terminé : {compteUnites(b.summary.crees, b.unite)} créé
              {b.summary.crees === 1 ? "" : "s"}
              {b.summary.echecs > 0 && `, ${b.summary.echecs} en erreur`}. Ouvrez le tableau de bord
              pour le rapport détaillé.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
