"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compteUnites, libelleUniteSingulier } from "@/lib/format";
import type { Unite } from "@/lib/types";
import { getJson, sendJson, type BatchRow, type ScanCandidate } from "./types";
import type { ImportTarget } from "./use-import-target";

type ImportReply = { nbPages?: number; warning?: string; retryAfter?: number };

/** Délai de la fenêtre de quota indiquée par le serveur (2 à 65 s). */
const attente = (retryAfter: unknown) => Math.min(65, Math.max(2, Number(retryAfter) || 60));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Import par lot d'un dossier de série : analyse des sous-dossiers
 * (`/api/owner/nas/scan`), puis indexation dossier par dossier sous un seul
 * job de suivi. Chaque requête reste courte, la progression est visible et
 * une erreur n'arrête pas le lot.
 */
export function useBatchImport(target: ImportTarget) {
  const router = useRouter();
  const [scan, setScan] = useState<ScanCandidate[] | null>(null);
  const [scanFolder, setScanFolder] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  /** Structure annoncée par la dernière analyse (tomes détectés ou non). */
  const [scanUnite, setScanUnite] = useState<Unite>("chapitre");
  const [scanBusy, setScanBusy] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [numeros, setNumeros] = useState<Record<string, string>>({});
  const [statut, setStatut] = useState<"draft" | "published">("draft");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [runIndex, setRunIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ crees: number; echecs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  /** Structure du lot : détectée par l'analyse, sinon celle de la série. */
  const unite: Unite = scan ? scanUnite : target.unite;
  const selected = (scan ?? []).filter((c) => checked[c.path] && (numeros[c.path] ?? "").trim());

  /** Met à jour la dernière ligne du rapport (l'unité en cours). */
  const updateLast = (patch: Partial<BatchRow>) =>
    setRows((prev) => prev.map((row, i) => (i === prev.length - 1 ? { ...row, ...patch } : row)));

  async function analyse(path: string) {
    setScanBusy(true);
    setScan(null);
    setScanFolder(null);
    setWarnings([]);
    setRows([]);
    setSummary(null);
    setError(null);
    try {
      const query = new URLSearchParams({ path });
      if (target.seriesId) query.set("series_id", target.seriesId);
      const { res, data } = await getJson<{
        path?: string;
        candidates?: ScanCandidate[];
        avertissements?: string[];
        unite?: Unite;
      }>(`/api/owner/nas/scan?${query.toString()}`);
      if (!res.ok || !Array.isArray(data?.candidates)) {
        setError(data?.error ?? "Analyse impossible.");
        setScan([]);
        return;
      }
      setScan(data.candidates);
      setScanFolder(data.path ?? path);
      setWarnings(data.avertissements ?? []);
      setScanUnite(data.unite ?? "chapitre");
      setChecked(Object.fromEntries(data.candidates.map((c) => [c.path, c.selectionne])));
      setNumeros(
        Object.fromEntries(
          data.candidates.map((c) => [c.path, c.numero === null ? "" : String(c.numero)]),
        ),
      );
    } catch {
      setError("Erreur réseau : réessayez.");
      setScan([]);
    } finally {
      setScanBusy(false);
    }
  }

  function selectAll(value: boolean) {
    setChecked(Object.fromEntries((scan ?? []).map((c) => [c.path, value && c.etat === "pret"])));
  }

  async function run(path: string) {
    const lotSing = libelleUniteSingulier(unite).toLowerCase();
    if (!target.seriesId) return setError("Sélectionnez la série cible avant de lancer le lot.");
    if (selected.length === 0) {
      return setError(`Cochez au moins un dossier avec un numéro de ${lotSing}.`);
    }
    const invalide = selected.find((c) => {
      const value = Number(numeros[c.path]);
      return !Number.isInteger(value) || value < 1;
    });
    if (invalide) {
      return setError(`Numéro invalide pour « ${invalide.name} » : un entier ≥ 1 est attendu.`);
    }

    setError(null);
    setBusy(true);
    setSummary(null);
    setRows([]);
    stopRef.current = false;

    // 1. Ouverture du suivi : un job « import par lot » pour tout le lot.
    let jobId = "";
    try {
      const { res, data } = await sendJson<{ jobId?: string }>("/api/owner/import/batch", "POST", {
        libelle: `Dossier ${scanFolder ?? path}`,
      });
      if (!res.ok || !data?.jobId) {
        setError(data?.error ?? "Ouverture du lot impossible.");
        setBusy(false);
        return;
      }
      jobId = data.jobId;
    } catch {
      setError("Erreur réseau : réessayez.");
      setBusy(false);
      return;
    }

    const total = selected.length;
    const erreurs: string[] = [];
    let crees = 0;
    let echecs = 0;

    // 2. Chaînage dossier par dossier.
    for (let i = 0; i < total; i++) {
      const cand = selected[i];
      const value = Number(numeros[cand.path]);
      setRunIndex(i);
      setRows((prev) => [...prev, { name: cand.name, numero: value, statut: "cours" }]);

      if (stopRef.current) {
        erreurs.push(`Lot interrompu après ${compteUnites(i, scanUnite)}.`);
        break;
      }

      const payload = {
        series_id: target.seriesId,
        numero: value,
        titre: "",
        volume: null,
        classification: target.classification,
        source: "nas",
        pages: [],
        chemin: cand.path,
        /* Nature du dossier : l'analyse sait que « Tome 3 » n'est pas un
           chapitre ; un nom neutre (« 12 ») laisse la série décider. */
        unite: cand.kind === "dossier" ? undefined : cand.kind === "volume" ? "tome" : "chapitre",
        statut,
        publish_at: null,
        batch: { jobId, index: i + 1, total },
      };

      try {
        let reply = await sendJson<ImportReply>("/api/owner/import", "POST", payload);
        /* Quota minute atteint : attente de la fenêtre indiquée par le
           serveur, puis un seul nouvel essai — un lot ne doit pas échouer en
           plein parcours pour un simple compteur. */
        if (reply.res.status === 429 && !stopRef.current) {
          const wait = attente(reply.data?.retryAfter);
          updateLast({ message: `Quota minute atteint — attente ${wait}s…` });
          await sleep(wait * 1000);
          if (!stopRef.current) {
            reply = await sendJson<ImportReply>("/api/owner/import", "POST", payload);
          }
        }

        if (!reply.res.ok) {
          echecs += 1;
          const message = reply.data?.error ?? "Import impossible.";
          erreurs.push(`${cand.name} : ${message}`);
          updateLast({ statut: "erreur", message });
        } else {
          crees += 1;
          updateLast({
            statut: "ok",
            pages: reply.data?.nbPages ?? 0,
            message: reply.data?.warning,
          });
        }
      } catch {
        echecs += 1;
        erreurs.push(`${cand.name} : erreur réseau.`);
        updateLast({ statut: "erreur", message: "Erreur réseau." });
      }
    }

    // 3. Clôture du job avec le rapport complet.
    const message =
      echecs === 0
        ? `Import par lot terminé : ${compteUnites(crees, scanUnite)} créé${crees === 1 ? "" : "s"}.`
        : `Import par lot : ${crees} créé(s), ${echecs} en erreur.`;
    try {
      await sendJson("/api/owner/import/batch", "PATCH", {
        jobId,
        statut: echecs > 0 ? "erreur" : "termine",
        progression: 100,
        message,
        erreurs: erreurs.slice(0, 100),
      });
    } catch {
      /* le rapport local reste affiché même si la clôture échoue */
    }

    setSummary({ crees, echecs });
    setRunIndex(-1);
    setBusy(false);
    router.refresh();
  }

  return {
    scan,
    warnings,
    scanBusy,
    checked,
    setChecked,
    numeros,
    setNumeros,
    statut,
    setStatut,
    rows,
    runIndex,
    busy,
    summary,
    error,
    unite,
    selected,
    analyse,
    selectAll,
    run,
    stop: () => {
      stopRef.current = true;
    },
  };
}
