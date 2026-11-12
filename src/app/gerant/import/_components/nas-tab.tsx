"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp, FileImage, FolderTree, Loader2, RefreshCw } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "@/components/ui/kit";
import { Breadcrumbs } from "./breadcrumbs";
import { EntryList } from "./entry-list";
import { ImportForm } from "./import-form";
import { PreviewPanel } from "./preview-panel";
import { getJson, naturalSort, type PageEntry, type PreviewData } from "./types";
import type { ImportTarget } from "./use-import-target";
import { childPath, parentPath, useNasBrowser } from "./use-nas-browser";
import type { SingleImport } from "./use-single-import";

/** Onglet « Un chapitre / tome » : pages choisies une à une, ou un dossier entier. */
export function NasTab({
  target,
  single,
  nasConfigured,
}: {
  target: ImportTarget;
  single: SingleImport;
  nasConfigured: boolean;
}) {
  const [entries, setEntries] = useState<PageEntry[]>([]);
  /** Dossier d'unité retenu : le listing des pages est alors fait côté serveur. */
  const [nasFolder, setNasFolder] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const nas = useNasBrowser(() => {
    setNasFolder(null);
    setPreview(null);
  });

  /** Aperçu d'un dossier avant indexation : trous de numérotation,
   *  doublons de hash et pages inhabituelles. */
  async function loadPreview(path: string) {
    setPreviewBusy(true);
    nas.setError(null);
    try {
      const { res, data } = await getJson<{
        path?: string;
        count?: number;
        missing?: number[];
        duplicates?: string[][];
        anomalies?: { name: string; reason: string }[];
      }>(`/api/owner/nas/preview?path=${encodeURIComponent(path)}`);
      if (!res.ok || typeof data?.count !== "number") {
        nas.setError(data?.error ?? "Aperçu impossible.");
        setPreview(null);
        setNasFolder(null);
        return;
      }
      setPreview({
        path: data.path ?? path,
        count: data.count,
        missing: data.missing ?? [],
        duplicates: data.duplicates ?? [],
        anomalies: data.anomalies ?? [],
      });
      setNasFolder(data.path ?? path);
    } catch {
      nas.setError("Erreur réseau : réessayez.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (entries.length === 0 && !nasFolder) {
      single.setError(
        `Ajoutez d'abord les pages du ${target.sing} (ou sélectionnez un dossier NAS).`,
      );
      return;
    }
    const ok = await single.submit(
      {
        source: "nas",
        pages: entries.map((e) => e.name),
        ...(nasFolder ? { chemin: nasFolder } : {}),
      },
      entries.length,
    );
    if (ok) {
      setEntries([]);
      setNasFolder(null);
      setPreview(null);
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <FolderTree className="size-4 text-primary" /> Dossiers du NAS
        </h2>
        <p className="mt-1 text-xs text-muted">
          Le contenu reste sur le NAS : seul l&apos;index des pages est enregistré en base.
        </p>
      </div>

      {!nasConfigured ? (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Fonctionnalité désactivée : la variable d&apos;environnement{" "}
          <code className="font-mono">NAS_API_BASE</code> n&apos;est pas renseignée. Ajoutez
          l&apos;URL de l&apos;API du NAS (et les identifiants{" "}
          <code className="font-mono">NAS_API_CLIENT_ID</code> /{" "}
          <code className="font-mono">NAS_API_CLIENT_SECRET</code> si elle est protégée par
          Cloudflare Access) puis redéployez.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Field label="Dossier sur le NAS" htmlFor="nas-path">
                <Input
                  id="nas-path"
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
            <Button
              type="button"
              onClick={() => nas.goTo(parentPath(nas.path))}
              disabled={nas.busy || nas.path === "/"}
              title="Monter d'un niveau"
            >
              <ArrowUp className="size-4" /> Monter
            </Button>
            <Button type="button" onClick={() => nas.goTo(nas.path)} disabled={nas.busy}>
              {nas.busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Lister
            </Button>
          </div>

          <Breadcrumbs crumbs={nas.crumbs} onGo={nas.goTo} />

          {nas.error && <p className="text-sm text-adult">{nas.error}</p>}

          {nas.items.length > 0 && (
            <ul className="max-h-72 overflow-auto rounded-xl border border-line divide-y divide-line">
              {nas.items.map((item) => {
                return (
                  <li key={item.name}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface2"
                      onClick={() => {
                        if (item.isDir) {
                          nas.goTo(childPath(nas.path, item.name));
                        } else {
                          setEntries((prev) =>
                            naturalSort([...prev, { name: item.name, preview: null }]),
                          );
                        }
                      }}
                    >
                      {item.isDir ? (
                        <FolderTree className="size-4 text-muted" />
                      ) : (
                        <FileImage className="size-4 text-muted" />
                      )}
                      <span className="truncate">{item.name}</span>
                      <span className="ml-auto text-xs text-muted">
                        {item.isDir ? "ouvrir" : "ajouter"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {nas.items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => void loadPreview(nas.path)}
                disabled={previewBusy}
              >
                {previewBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileImage className="size-4" />
                )}
                Aperçu de ce dossier
              </Button>
              {nasFolder && <Badge tone="ok">Dossier retenu : {nasFolder}</Badge>}
            </div>
          )}

          {preview && <PreviewPanel preview={preview} />}

          <EntryList entries={entries} onClear={() => setEntries([])} />

          <ImportForm {...single.formProps("nas", submit)} />
        </>
      )}
    </Card>
  );
}
