"use client";

import clsx from "clsx";
import { useRef, useState, type ReactNode } from "react";
import { EXPORT_FILENAME, exportSettings, importSettings } from "../settings/storage";

/**
 * Export / import des réglages de lecture (toutes séries comprises) via un
 * fichier JSON versionné ; les exports v1 du premier lecteur restent lisibles.
 */
export function ReglagesDonnees() {
  const [etat, setEtat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function exporter() {
    try {
      const blob = new Blob([exportSettings()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = EXPORT_FILENAME;
      link.click();
      URL.revokeObjectURL(url);
      setEtat("Réglages exportés.");
    } catch {
      setEtat("Export impossible sur cet appareil.");
    }
  }

  async function importer(file: File) {
    try {
      if (!importSettings(await file.text())) {
        setEtat("Fichier de réglages invalide ou vide.");
        return;
      }
      setEtat("Réglages importés : rechargement…");
      window.setTimeout(() => window.location.reload(), 600);
    } catch {
      setEtat("Fichier illisible.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-sm" onClick={exporter}>
          Exporter
        </button>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => fileRef.current?.click()}
        >
          Importer
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Fichier de réglages à importer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importer(file);
            e.target.value = "";
          }}
        />
      </div>
      {etat && (
        <p className="text-xs text-muted" role="status">
          {etat}
        </p>
      )}
    </div>
  );
}

/** Petit groupe de réglages : libellé, contrôle, aide. */
export function Reglage({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-fg">{titre}</p>
      {children}
      {aide && <p className="text-xs text-muted">{aide}</p>}
    </div>
  );
}

/** Sélecteur segmenté : boutons mutuellement exclusifs annoncés par `aria-pressed`. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ key: T; label: string; aria?: string; icon?: ReactNode }>;
  onChange: (next: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          aria-label={option.aria ?? option.label}
          onClick={() => onChange(option.key)}
          className={clsx(
            "chip min-h-11 flex-1 justify-center gap-1.5 px-3",
            value === option.key && "chip-active",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
