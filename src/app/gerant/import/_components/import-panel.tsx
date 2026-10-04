"use client";

import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ExternalLink,
  FileImage,
  FolderTree,
  Loader2,
  RefreshCw,
  Rocket,
  UploadCloud,
} from "lucide-react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui/kit";
import type { Classification } from "@/lib/types";

export type SeriesLite = {
  id: string;
  titre: string;
  slug: string;
  classification: Classification;
};

type PageEntry = { name: string; preview: string | null };

type ImportResult = {
  chapterId: string;
  numero: number;
  titre: string;
  slug: string;
  nbPages: number;
  seriesTitre: string;
  storage: "nas" | "demo";
  statut: ImportStatut;
  warning?: string;
};

type NasItem = { name: string; isDir: boolean };

/** Aperçu d'un dossier avant indexation (§5.1, étape 2). */
type PreviewData = {
  path: string;
  count: number;
  missing: number[];
  duplicates: string[][];
  anomalies: { name: string; reason: string }[];
};

type ImportStatut = "draft" | "scheduled" | "published";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const ARCHIVE_EXT = /\.(zip|cbz)$/i;

/** Tri naturel : page-2 avant page-10 (§10.2). */
function naturalSort(entries: PageEntry[]): PageEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
}

/**
 * Lecture du répertoire central d'une archive ZIP/CBZ : seuls les noms de
 * fichiers sont lus (aucune décompression), suffisants pour indexer les pages.
 */
async function readZipEntries(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const end = buffer.byteLength - 22;
  const floor = Math.max(0, buffer.byteLength - 66_000);
  let eocd = -1;
  for (let i = end; i >= floor; i--) {
    if (view.getUint32(i, true) === 0x0605_4b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Archive ZIP/CBZ illisible.");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const names: string[] = [];

  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.byteLength) break;
    if (view.getUint32(offset, true) !== 0x0201_4b50) break;
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLen));
    if (!name.endsWith("/")) names.push(name);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  if (names.length === 0) throw new Error("Aucun fichier détecté dans l'archive.");
  return names;
}

function normalizeNas(raw: unknown): NasItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): NasItem => {
      if (typeof item === "string") return { name: item, isDir: item.endsWith("/") };
      const row = item as Record<string, unknown>;
      const name = String(row.name ?? row.path ?? row.filename ?? "");
      const type = String(row.type ?? "");
      const isDir =
        type === "dir" ||
        type === "directory" ||
        type === "folder" ||
        row.is_dir === true ||
        row.isDir === true ||
        name.endsWith("/");
      return { name, isDir };
    })
    .filter((item) => item.name.length > 0);
}

export function ImportPanel({
  series,
  nasConfigured,
  driveConfigured,
}: {
  series: SeriesLite[];
  nasConfigured: boolean;
  driveConfigured: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"upload" | "nas" | "drive">("upload");

  // État commun du formulaire d'import
  const [seriesFilter, setSeriesFilter] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [numero, setNumero] = useState("");
  const [titre, setTitre] = useState("");
  const [classification, setClassification] = useState<Classification>("all");
  const [entries, setEntries] = useState<PageEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const previewsRef = useRef<string[]>([]);

  // État NAS
  const [nasPath, setNasPath] = useState("/");
  const [nasItems, setNasItems] = useState<NasItem[]>([]);
  const [nasBusy, setNasBusy] = useState(false);
  const [nasError, setNasError] = useState<string | null>(null);
  /** Dossier de chapitre retenu : le listing est alors fait côté serveur (§5.1). */
  const [nasFolder, setNasFolder] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // Statut à la création (§5.1, étape 4)
  const [statut, setStatut] = useState<ImportStatut>("draft");
  const [publishAt, setPublishAt] = useState("");

  // État Drive
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [driveTone, setDriveTone] = useState<"ok" | "warn" | "adult">("ok");

  const serie = series.find((s) => s.id === seriesId) ?? null;
  const filteredSeries = useMemo(() => {
    const needle = seriesFilter.trim().toLowerCase();
    if (!needle) return series;
    return series.filter((s) => s.titre.toLowerCase().includes(needle));
  }, [series, seriesFilter]);

  function releasePreviews() {
    for (const url of previewsRef.current) URL.revokeObjectURL(url);
    previewsRef.current = [];
  }

  async function handleFiles(fileList: FileList | File[]) {
    const list = Array.from(fileList);
    const images = list.filter((f) => f.type.startsWith("image/") && IMAGE_EXT.test(f.name));
    const archives = list.filter((f) => ARCHIVE_EXT.test(f.name));
    const unsupported = list.length - images.length - archives.length;

    setError(null);
    releasePreviews();

    const collected: PageEntry[] = images.map((file) => ({
      name: file.name,
      preview: URL.createObjectURL(file),
    }));
    previewsRef.current = collected
      .map((e) => e.preview)
      .filter((url): url is string => Boolean(url));

    for (const archive of archives) {
      try {
        const names = await readZipEntries(archive);
        collected.push(...names.map((name) => ({ name, preview: null })));
      } catch (err) {
        setError(
          `Archive « ${archive.name} » ignorée : ${err instanceof Error ? err.message : "lecture impossible"}.`,
        );
      }
    }

    if (images.length + archives.length === 0) {
      setError("Aucun fichier exploitable : déposez des images (jpg/png/webp) ou une archive ZIP/CBZ.");
      return;
    }
    if (unsupported > 0 && images.length > 0) {
      setError(`${unsupported} fichier(s) ignoré(s) (type non pris en charge).`);
    }

    setEntries(naturalSort(collected));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) void handleFiles(event.dataTransfer.files);
  }

  function onPickSeries(id: string) {
    setSeriesId(id);
    const target = series.find((s) => s.id === id);
    if (target) setClassification(target.classification);
  }

  async function submitImport(source: "upload" | "nas", event?: FormEvent) {
    event?.preventDefault();
    setError(null);

    if (!seriesId) {
      setError("Sélectionnez une série.");
      return;
    }
    const numeroValue = Number(numero);
    if (!numeroValue || numeroValue < 1) {
      setError("Indiquez un numéro de chapitre valide.");
      return;
    }
    if (entries.length === 0 && !nasFolder) {
      setError("Ajoutez d'abord les pages du chapitre (ou sélectionnez un dossier NAS).");
      return;
    }
    if (statut === "scheduled") {
      if (!publishAt) {
        setError("Indiquez la date et l'heure de publication.");
        return;
      }
      if (new Date(publishAt).getTime() <= Date.now()) {
        setError("La date de publication doit être dans le futur.");
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch("/api/owner/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          series_id: seriesId,
          numero: numeroValue,
          titre: titre.trim(),
          volume: null,
          classification,
          source,
          pages: entries.map((e) => e.name),
          ...(nasFolder ? { chemin: nasFolder } : {}),
          statut,
          publish_at: statut === "scheduled" ? new Date(publishAt).toISOString() : null,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            chapter?: { id: string; numero: number; titre: string };
            nbPages?: number;
            storage?: "nas" | "demo";
            warning?: string;
          }
        | null;

      if (!res.ok || !data?.chapter) {
        setError(data?.error ?? "Import impossible.");
        return;
      }

      releasePreviews();
      setEntries([]);
      setNasFolder(null);
      setPreview(null);
      setResult({
        chapterId: data.chapter.id,
        numero: data.chapter.numero,
        titre: data.chapter.titre,
        slug: serie?.slug ?? "",
        nbPages: data.nbPages ?? entries.length,
        seriesTitre: serie?.titre ?? "",
        storage: data.storage ?? "demo",
        statut,
        warning: data.warning,
      });
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function listNas(path: string) {
    setNasBusy(true);
    setNasError(null);
    setNasFolder(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/owner/nas/list?path=${encodeURIComponent(path)}`);
      const data = (await res.json().catch(() => null)) as
        | { error?: string; entries?: unknown }
        | null;
      if (!res.ok) {
        setNasError(data?.error ?? "Listing impossible.");
        setNasItems([]);
        return;
      }
      setNasItems(normalizeNas(data?.entries));
    } catch {
      setNasError("Erreur réseau : réessayez.");
    } finally {
      setNasBusy(false);
    }
  }

  /** Aperçu d'un dossier avant indexation (§5.1, étape 2) : trous de
   *  numérotation, doublons de hash et pages inhabituelles. */
  async function loadPreview(path: string) {
    setPreviewBusy(true);
    setNasError(null);
    try {
      const res = await fetch(`/api/owner/nas/preview?path=${encodeURIComponent(path)}`);
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            path?: string;
            count?: number;
            missing?: number[];
            duplicates?: string[][];
            anomalies?: { name: string; reason: string }[];
          }
        | null;
      if (!res.ok || typeof data?.count !== "number") {
        setNasError(data?.error ?? "Aperçu impossible.");
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
      setNasError("Erreur réseau : réessayez.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function launchDriveSync() {
    setDriveBusy(true);
    setDriveMessage(null);
    try {
      const res = await fetch("/api/owner/drive/sync", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; job?: { id: string; message: string } }
        | null;
      if (!res.ok) {
        setDriveTone("adult");
        setDriveMessage(data?.error ?? "Synchronisation impossible.");
        return;
      }
      setDriveTone("ok");
      setDriveMessage(
        data?.job ? `Job ${data.job.id} créé : ${data.job.message}` : "Synchronisation lancée.",
      );
      router.refresh();
    } catch {
      setDriveTone("adult");
      setDriveMessage("Erreur réseau : réessayez.");
    } finally {
      setDriveBusy(false);
    }
  }

  const tabs: Array<{ key: "upload" | "nas" | "drive"; label: string }> = [
    { key: "upload", label: "Upload direct" },
    { key: "nas", label: "Depuis le NAS" },
    { key: "drive", label: "Google Drive (séries)" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Méthode d'import">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "chip-active chip" : "chip"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Onglet 1 : upload direct ─────────────────────────────────── */}
      {tab === "upload" && (
        <Card className="space-y-5 p-5">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-line bg-surface2 px-6 py-10 text-center"
          >
            <UploadCloud className="size-8 text-primary" />
            <p className="text-sm font-semibold text-fg">
              Déposez vos images ou une archive ZIP / CBZ
            </p>
            <p className="text-xs text-muted">
              Tri naturel automatique · aucune image n&apos;est envoyée à Vercel : seuls les noms
              de fichiers sont indexés (les octets restent sur le NAS).
            </p>
            <label className="btn-secondary cursor-pointer">
              Choisir des fichiers
              <input
                type="file"
                multiple
                accept="image/*,.zip,.cbz"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files);
                }}
              />
            </label>
          </div>

          <EntryList entries={entries} onClear={() => { releasePreviews(); setEntries([]); }} />
          <ImportForm
            series={filteredSeries}
            seriesFilter={seriesFilter}
            onFilter={setSeriesFilter}
            seriesId={seriesId}
            onSeries={onPickSeries}
            numero={numero}
            onNumero={setNumero}
            titre={titre}
            onTitre={setTitre}
            classification={classification}
            onClassification={setClassification}
            error={error}
            busy={busy}
            onSubmit={(e) => submitImport("upload", e)}
            source="upload"
            statut={statut}
            onStatut={setStatut}
            publishAt={publishAt}
            onPublishAt={setPublishAt}
          />
        </Card>
      )}

      {/* ── Onglet 2 : NAS ───────────────────────────────────────────── */}
      {tab === "nas" && (
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
              <div className="flex gap-2">
                <Input
                  value={nasPath}
                  onChange={(e) => setNasPath(e.target.value)}
                  aria-label="Chemin sur le NAS"
                  placeholder="/scans/mon-manga"
                />
                <Button type="button" onClick={() => listNas(nasPath)} disabled={nasBusy}>
                  {nasBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Lister
                </Button>
              </div>

              {nasError && <p className="text-sm text-adult">{nasError}</p>}

              {nasItems.length > 0 && (
                <ul className="max-h-72 overflow-auto rounded-xl border border-line divide-y divide-line">
                  {nasItems.map((item) => {
                    const childPath = `${nasPath.replace(/\/+$/, "")}/${item.name.replace(/^\/+/, "")}`;
                    return (
                      <li key={item.name}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface2"
                          onClick={() => {
                            if (item.isDir) {
                              setNasPath(childPath);
                              void listNas(childPath);
                            } else {
                              setEntries((prev) =>
                                naturalSort([
                                  ...prev,
                                  { name: item.name, preview: null },
                                ]),
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

              {nasItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void loadPreview(nasPath)}
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

              <ImportForm
                series={filteredSeries}
                seriesFilter={seriesFilter}
                onFilter={setSeriesFilter}
                seriesId={seriesId}
                onSeries={onPickSeries}
                numero={numero}
                onNumero={setNumero}
                titre={titre}
                onTitre={setTitre}
                classification={classification}
                onClassification={setClassification}
                error={error}
                busy={busy}
                onSubmit={(e) => submitImport("nas", e)}
                source="nas"
                statut={statut}
                onStatut={setStatut}
                publishAt={publishAt}
                onPublishAt={setPublishAt}
              />
            </>
          )}
        </Card>
      )}

      {/* ── Onglet 3 : Google Drive ──────────────────────────────────── */}
      {tab === "drive" && (
        <Card className="space-y-4 p-5">
          <h2 className="section-title flex items-center gap-2">
            <Archive className="size-4 text-primary" /> Google Drive — ressources de séries
          </h2>
          <ul className="space-y-2 text-sm text-muted">
            <li>• Drive ne contient que les couvertures, bannières et métadonnées des séries.</li>
            <li>• Les pages de scans ne transitent jamais par Drive (§6.5) : elles restent sur le NAS.</li>
            <li>• Connexion par compte de service, en lecture seule, côté serveur uniquement.</li>
            <li>• Aucun lien Drive n&apos;est exposé au client.</li>
          </ul>

          <div className="rounded-xl border border-line bg-surface2 px-4 py-3 text-sm">
            <span className="text-muted">État de la connexion : </span>
            {driveConfigured ? (
              <Badge tone="ok">Compte de service configuré</Badge>
            ) : (
              <Badge tone="warn">Non connecté</Badge>
            )}
            {!driveConfigured && (
              <p className="mt-2 text-xs text-muted">
                Renseignez <code className="font-mono">GOOGLE_DRIVE_SERVICE_ACCOUNT</code> (JSON du
                compte de service) et, si nécessaire,{" "}
                <code className="font-mono">GOOGLE_DRIVE_FOLDER_ID</code>.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" variant="primary" onClick={launchDriveSync} disabled={driveBusy}>
              {driveBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Lancer une synchronisation
            </Button>
          </div>

          {driveMessage && (
            <p
              className={`rounded-xl border px-4 py-3 text-sm ${
                driveTone === "adult"
                  ? "border-adult/40 bg-adult/10 text-adult"
                  : "border-ok/40 bg-ok/10 text-ok"
              }`}
            >
              {driveMessage}
            </p>
          )}
        </Card>
      )}

      {result && <ResultPanel result={result} onChanged={() => setResult(null)} />}
    </div>
  );
}

/* ── Aperçu d'un dossier NAS avant indexation (§5.1) ──────────────────── */

function PreviewPanel({ preview }: { preview: PreviewData }) {
  const clean = preview.anomalies.length === 0;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <FolderTree className="size-4 text-primary" />
          <span className="truncate">{preview.path}</span>
          <span className="text-muted">· {preview.count} page(s)</span>
        </p>
        <Badge tone={clean ? "ok" : "warn"}>
          {clean ? "Aucune anomalie" : `${preview.anomalies.length} point(s) à vérifier`}
        </Badge>
      </div>

      {preview.missing.length > 0 && (
        <p className="text-xs text-warn">
          Numéros manquants dans la séquence : {preview.missing.join(", ")}
        </p>
      )}

      {preview.duplicates.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-warn">Contenus identiques (doublons probables) :</p>
          <ul className="space-y-0.5 text-xs text-muted">
            {preview.duplicates.map((group, index) => (
              <li key={index}>• {group.join(", ")}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.anomalies.length > 0 && (
        <ul className="max-h-32 space-y-1 overflow-auto text-xs text-muted">
          {preview.anomalies.map((anomaly, index) => (
            <li key={index}>
              • <span className="text-fg">{anomaly.name}</span> — {anomaly.reason}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Ces points n&apos;empêchent pas l&apos;indexation : ils sont à vérifier avant publication.
      </p>
    </div>
  );
}

/* ── Aperçu des pages ────────────────────────────────────────────────── */

function EntryList({ entries, onClear }: { entries: PageEntry[]; onClear: () => void }) {
  if (entries.length === 0) return null;
  const previews = entries.filter((e) => e.preview).slice(0, 12);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg">
          {entries.length} page{entries.length > 1 ? "s" : ""} · tri naturel appliqué
        </p>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onClear}>
          Vider
        </button>
      </div>

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((entry) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={entry.name}
              src={entry.preview ?? ""}
              alt={entry.name}
              loading="lazy"
              className="h-24 w-16 rounded-lg border border-line object-cover"
            />
          ))}
          {entries.length > previews.length && (
            <span className="flex h-24 items-center px-2 text-xs text-muted">
              +{entries.length - previews.length}
            </span>
          )}
        </div>
      )}

      <ol className="max-h-40 overflow-auto rounded-xl border border-line text-xs">
        {entries.map((entry, i) => (
          <li
            key={`${entry.name}-${i}`}
            className="flex gap-3 border-b border-line px-3 py-1.5 last:border-0"
          >
            <span className="tabular-nums text-muted">{i + 1}.</span>
            <span className="truncate text-fg">{entry.name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Formulaire commun ───────────────────────────────────────────────── */

function ImportForm(props: {
  series: SeriesLite[];
  seriesFilter: string;
  onFilter: (value: string) => void;
  seriesId: string;
  onSeries: (id: string) => void;
  numero: string;
  onNumero: (value: string) => void;
  titre: string;
  onTitre: (value: string) => void;
  classification: Classification;
  onClassification: (value: Classification) => void;
  error: string | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  source: "upload" | "nas";
  statut: ImportStatut;
  onStatut: (value: ImportStatut) => void;
  publishAt: string;
  onPublishAt: (value: string) => void;
}) {
  const submitLabel =
    props.statut === "published"
      ? props.source === "nas"
        ? "Indexer et publier"
        : "Importer et publier"
      : props.statut === "scheduled"
        ? "Programmer la publication"
        : props.source === "nas"
          ? "Indexer le chapitre (brouillon)"
          : "Importer en brouillon";

  return (
    <form onSubmit={props.onSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
        <Field label="Filtrer les séries" htmlFor="i-filter">
          <Input
            id="i-filter"
            value={props.seriesFilter}
            onChange={(e) => props.onFilter(e.target.value)}
            placeholder="Titre de la série…"
          />
        </Field>
        <Field label="Série *" htmlFor="i-series">
          <Select id="i-series" value={props.seriesId} onChange={(e) => props.onSeries(e.target.value)}>
            <option value="">— Choisir une série —</option>
            {props.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.titre}
                {s.classification === "adult" ? " (+18)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Numéro de chapitre *" htmlFor="i-numero">
        <Input
          id="i-numero"
          type="number"
          min={1}
          value={props.numero}
          onChange={(e) => props.onNumero(e.target.value)}
          placeholder="25"
        />
      </Field>

      <Field label="Titre du chapitre" htmlFor="i-titre" hint="Facultatif (« Chapitre 25 » par défaut).">
        <Input id="i-titre" value={props.titre} onChange={(e) => props.onTitre(e.target.value)} maxLength={200} />
      </Field>

      <Field label="Classification" htmlFor="i-classification">
        <Select
          id="i-classification"
          value={props.classification}
          onChange={(e) => props.onClassification(e.target.value as Classification)}
        >
          <option value="all">Tout public</option>
          <option value="adult">+18</option>
        </Select>
      </Field>

      <Field label="Statut à la création" htmlFor="i-statut"
        hint="Les chapitres programmés sont publiés automatiquement par le cron.">
        <Select
          id="i-statut"
          value={props.statut}
          onChange={(e) => props.onStatut(e.target.value as ImportStatut)}
        >
          <option value="draft">Brouillon</option>
          <option value="scheduled">Programmé</option>
          <option value="published">Publié immédiatement</option>
        </Select>
      </Field>

      {props.statut === "scheduled" && (
        <Field label="Date et heure de publication" htmlFor="i-publish">
          <Input
            id="i-publish"
            type="datetime-local"
            value={props.publishAt}
            onChange={(e) => props.onPublishAt(e.target.value)}
          />
        </Field>
      )}

      <div className="flex items-end gap-3">
        <Button type="submit" variant="primary" disabled={props.busy}>
          {props.busy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
          {props.busy ? "Import en cours…" : submitLabel}
        </Button>
      </div>

      {props.error && (
        <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult md:col-span-2">
          {props.error}
        </p>
      )}
    </form>
  );
}

/* ── Publication après import ────────────────────────────────────────── */

function ResultPanel({
  result,
  onChanged,
}: {
  result: ImportResult;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [currentStatut, setCurrentStatut] = useState<ImportStatut>(result.statut);
  const [nasError, setNasError] = useState<string | null>(null);

  const statutLabel =
    currentStatut === "published"
      ? "Publié"
      : currentStatut === "scheduled"
        ? "Programmé"
        : "Brouillon";
  const statutTone = currentStatut === "published" ? "ok" : "warn";
  const isPublished = currentStatut === "published";

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNasError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${result.chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; nas?: { action?: string; error?: string } }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "Action impossible.");
        return;
      }
      if (typeof body.statut === "string") setCurrentStatut(body.statut as ImportStatut);
      if (data?.nas?.error) setNasError(data.nas.error);
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 border-primary/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">
            Chapitre {result.numero} créé — {result.nbPages} pages indexées
          </h2>
          <p className="text-sm text-muted">
            {result.seriesTitre} ·{" "}
            {result.storage === "nas"
              ? "index lu sur le NAS (dimensions et hash en base)"
              : "pages de démonstration"}
          </p>
        </div>
        <Badge tone={statutTone}>{statutLabel}</Badge>
      </div>

      {(result.warning || nasError) && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {result.warning ?? nasError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {result.slug && (
          <a
            href={`/serie/${result.slug}/chapitre-${result.numero}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            <ExternalLink className="size-4" /> Ouvrir dans le lecteur
          </a>
        )}
        {!isPublished && (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => patch({ statut: "published" })}
          >
            <Rocket className="size-4" /> Publier maintenant
          </Button>
        )}
        {!isPublished && (
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              className="input w-auto"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-label="Date et heure de publication"
            />
            <Button
              type="button"
              disabled={busy || !when}
              onClick={() => patch({ statut: "scheduled", publish_at: new Date(when).toISOString() })}
            >
              Planifier
            </Button>
          </div>
        )}
        <button type="button" className="btn-ghost" onClick={onChanged} disabled={busy}>
          Nouvel import
        </button>
      </div>

      {error && <p className="text-sm text-adult">{error}</p>}
      <p className="text-xs text-muted">
        Publication = déplacement <code className="font-mono">staging/</code> →{" "}
        <code className="font-mono">public/</code> sur le NAS, purge Cloudflare ciblée et entrée
        au journal d&apos;audit (acteur, date, IP).
      </p>
    </Card>
  );
}
