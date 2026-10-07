"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";

type Resultat = { ok: boolean; message: string };

/**
 * Import de bibliothèque (« Import / export de la bibliothèque »).
 * Le fichier est lu dans le navigateur puis envoyé en JSON : aucune donnée
 * existante n'est écrasée, l'API ne crée que les entrées manquantes.
 */
export function LibraryImport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResultat(null);
    try {
      const contenu = await file.text();
      const format = file.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
      const res = await fetch("/api/account/library/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, contenu }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      if (!res.ok) {
        setResultat({ ok: false, message: data?.error ?? "Import impossible, réessayez." });
      } else {
        setResultat({
          ok: true,
          message: data?.message ?? "Import terminé.",
        });
        router.refresh();
      }
    } catch {
      setResultat({ ok: false, message: "Fichier illisible : choisissez un export JSON ou CSV." });
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <input
          id="biblio-import"
          type="file"
          accept=".json,.csv,application/json,text/csv"
          className="peer sr-only"
          disabled={busy}
          onChange={onChange}
        />
        <label
          htmlFor="biblio-import"
          className="btn-secondary cursor-pointer text-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
        >
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Upload aria-hidden className="size-4" />}
          Importer
        </label>
        <span className="text-xs text-muted">JSON ou CSV</span>
      </div>
      <p role="status" aria-live="polite" className="text-xs text-muted">
        {resultat && (
          <span className={resultat.ok ? "text-ok" : "text-adult"}>{resultat.message}</span>
        )}
      </p>
    </div>
  );
}
