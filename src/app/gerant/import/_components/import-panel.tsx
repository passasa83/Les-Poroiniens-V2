"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileImage,
  FolderTree,
  Images,
  ListChecks,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  Square,
} from "lucide-react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui/kit";
import { compteUnites, libelleUnite, libelleUniteSingulier, libelleUnitesPluriel } from "@/lib/format";
import type { Classification, Unite } from "@/lib/types";

export type SeriesLite = {
  id: string;
  titre: string;
  slug: string;
  classification: Classification;
  /** Organisation de la série : chapitres ou tomes (« Tome 3 » partout). */
  unite: Unite;
};

type PageEntry = { name: string; preview: string | null };

type ImportResult = {
  chapterId: string;
  numero: number;
  /** Organisation retenue à la création (« Tome 3 créé » dans le rapport). */
  unite: Unite;
  titre: string;
  slug: string;
  nbPages: number;
  seriesTitre: string;
  storage: "nas" | "demo" | "imgchest";
  statut: ImportStatut;
  warning?: string;
};

type NasItem = { name: string; isDir: boolean };

/** Album ImgChest : un album = une unité de lecture, ses images sont servies par le CDN. */
type ImgPost = {
  id: string;
  title: string;
  views: number;
  nsfw: boolean;
  thumbnail: string | null;
  created: string | null;
};

type ImgInfo = {
  id: string;
  title: string;
  count: number;
  bytes: number;
  views: number;
  nsfw: boolean;
};

/** Aperçu d'un dossier avant indexation (étape 2). */
type PreviewData = {
  path: string;
  count: number;
  missing: number[];
  duplicates: string[][];
  anomalies: { name: string; reason: string }[];
};

/** Candidat renvoyé par `/api/owner/nas/scan` (import par lot). */
type ScanCandidate = {
  name: string;
  path: string;
  numero: number | null;
  kind: "chapitre" | "volume" | "dossier";
  pages: number;
  dejaImporte: boolean;
  etat: "pret" | "deja_importe" | "pas_d_image" | "numero_a_corriger";
  selectionne: boolean;
};

/** Ligne du rapport de lot : créé, ignoré ou en erreur. */
type BatchRow = {
  name: string;
  numero: number | null;
  statut: "cours" | "ok" | "erreur";
  pages?: number;
  message?: string;
};

const ETAT_LABEL: Record<ScanCandidate["etat"], string> = {
  pret: "Prêt à importer",
  deja_importe: "Déjà importé",
  pas_d_image: "Aucune image",
  numero_a_corriger: "Numéro à corriger",
};

type ImportStatut = "draft" | "scheduled" | "published";

/** Tri naturel : page-2 avant page-10. */
function naturalSort(entries: PageEntry[]): PageEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
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

/** Taille lisible : `18,4 Mo` (album ImgChest avant import). */
function formatBytes(bytes: number): string {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

export function ImportPanel({
  series,
  nasConfigured,
  driveConfigured,
  imgchestList,
  initialSeriesId = "",
}: {
  series: SeriesLite[];
  nasConfigured: boolean;
  driveConfigured: boolean;
  /** Vrai si `IMG_CHEST_USERNAME` est renseignée (liste des albums). */
  imgchestList: boolean;
  /** Série pré-sélectionnée (`/gerant/import?series=…`, lien depuis une fiche). */
  initialSeriesId?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"lot" | "nas" | "imgchest" | "drive">("lot");

  // État commun du formulaire d'import
  const [seriesFilter, setSeriesFilter] = useState("");
  const [seriesId, setSeriesId] = useState(initialSeriesId);
  const [numero, setNumero] = useState("");
  const [titre, setTitre] = useState("");
  // La classification hérite de la série cible (le +18 ne s'applique jamais à l'inverse).
  const [classification, setClassification] = useState<Classification>(
    () => series.find((s) => s.id === initialSeriesId)?.classification ?? "all",
  );
  const [entries, setEntries] = useState<PageEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // État NAS
  const [nasPath, setNasPath] = useState("/");
  const [nasItems, setNasItems] = useState<NasItem[]>([]);
  const [nasBusy, setNasBusy] = useState(false);
  const [nasError, setNasError] = useState<string | null>(null);
  /** Dossier d'unité (chapitre ou tome) retenu : le listing est alors fait côté serveur. */
  const [nasFolder, setNasFolder] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // État de l'import par lot
  const [scan, setScan] = useState<ScanCandidate[] | null>(null);
  const [scanFolder, setScanFolder] = useState<string | null>(null);
  const [scanWarn, setScanWarn] = useState<string[]>([]);
  /** Structure annoncée par la dernière analyse (tomes détectés ou non). */
  const [scanUnite, setScanUnite] = useState<Unite>("chapitre");
  const [scanBusy, setScanBusy] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [numeros, setNumeros] = useState<Record<string, string>>({});
  const [lotStatut, setLotStatut] = useState<"draft" | "published">("draft");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [runIndex, setRunIndex] = useState(-1);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{ crees: number; echecs: number } | null>(null);
  const stopRef = useRef(false);

  // Statut à la création (étape 4)
  const [statut, setStatut] = useState<ImportStatut>("draft");
  const [publishAt, setPublishAt] = useState("");

  // État Drive
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [driveTone, setDriveTone] = useState<"ok" | "warn" | "adult">("ok");

  // État ImgChest (source d'images : un album par unité de lecture)
  const [imgPosts, setImgPosts] = useState<ImgPost[]>([]);
  const [imgPage, setImgPage] = useState(1);
  const [imgMore, setImgMore] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgManual, setImgManual] = useState("");
  const [imgSelected, setImgSelected] = useState<string | null>(null);
  const [imgInfo, setImgInfo] = useState<ImgInfo | null>(null);

  const serie = series.find((s) => s.id === seriesId) ?? null;
  /** Organisation de la série cible : pilote les libellés du formulaire. */
  const serieUnite: Unite = serie?.unite ?? "chapitre";
  const serieSing = libelleUniteSingulier(serieUnite).toLowerCase();
  /** Structure du lot : détectée par l'analyse, sinon celle de la série. */
  const lotUnite: Unite = scan ? scanUnite : serieUnite;
  const lotSing = libelleUniteSingulier(lotUnite).toLowerCase();
  const lotPlur = libelleUnitesPluriel(lotUnite).toLowerCase();
  const filteredSeries = useMemo(() => {
    const needle = seriesFilter.trim().toLowerCase();
    if (!needle) return series;
    return series.filter((s) => s.titre.toLowerCase().includes(needle));
  }, [series, seriesFilter]);

  function onPickSeries(id: string) {
    setSeriesId(id);
    const target = series.find((s) => s.id === id);
    if (target) setClassification(target.classification);
  }

  async function submitImport(
    source: "nas" | "imgchest",
    event?: FormEvent,
  ) {
    event?.preventDefault();
    setError(null);

    if (!seriesId) {
      setError("Sélectionnez une série.");
      return;
    }
    const numeroValue = Number(numero);
    if (!numeroValue || numeroValue < 1) {
      setError(`Indiquez un numéro de ${serieSing} valide.`);
      return;
    }
    if (source === "imgchest") {
      if (!imgSelected) {
        setError("Sélectionnez un album ImgChest (ou saisissez son identifiant).");
        return;
      }
    } else if (entries.length === 0 && !nasFolder) {
      setError(`Ajoutez d'abord les pages du ${serieSing} (ou sélectionnez un dossier NAS).`);
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
          ...(source === "imgchest" && imgSelected ? { imgchest_post: imgSelected } : {}),
          statut,
          publish_at: statut === "scheduled" ? new Date(publishAt).toISOString() : null,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            chapter?: { id: string; numero: number; titre: string };
            /** Unité retenue par le serveur (dossier ou série). */
            unite?: Unite;
            nbPages?: number;
            storage?: "nas" | "demo" | "imgchest";
            warning?: string;
          }
        | null;

      if (!res.ok || !data?.chapter) {
        setError(data?.error ?? "Import impossible.");
        return;
      }

      setEntries([]);
      setNasFolder(null);
      setPreview(null);
      setImgSelected(null);
      setImgInfo(null);
      setResult({
        chapterId: data.chapter.id,
        numero: data.chapter.numero,
        unite: data.unite ?? serieUnite,
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

  /** Aperçu d'un dossier avant indexation (étape 2) : trous de
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

  /** Déplacement dans l'arborescence : fil d'Ariane, montée, descente. */
  function goTo(path: string) {
    const clean = path || "/";
    setNasPath(clean);
    void listNas(clean);
  }

  function parentPath(path: string): string {
    const clean = path.replace(/\/+$/, "");
    const cut = clean.lastIndexOf("/");
    return cut <= 0 ? "/" : clean.slice(0, cut);
  }

  /** Segments du fil d'Ariane, depuis la racine jusqu'au dossier courant. */
  const crumbs = useMemo(() => {
    const parts = nasPath.split("/").filter(Boolean);
    const out: Array<{ label: string; path: string }> = [{ label: "Racine", path: "/" }];
    let acc = "";
    for (const part of parts) {
      acc += `/${part}`;
      out.push({ label: part, path: acc });
    }
    return out;
  }, [nasPath]);

  /**
   * Analyse du dossier courant avant import par lot : chaque sous-dossier est
   * testé (numéro détecté, planches présentes, unité déjà en base) — le
   * serveur se limite aux dossiers non encore importés.
   */
  async function runScan() {
    if (!nasConfigured) return;
    setScanBusy(true);
    setScan(null);
    setScanFolder(null);
    setScanWarn([]);
    setRows([]);
    setBatchSummary(null);
    setNasError(null);
    try {
      const query = new URLSearchParams({ path: nasPath });
      if (seriesId) query.set("series_id", seriesId);
      const res = await fetch(`/api/owner/nas/scan?${query.toString()}`);
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            path?: string;
            candidates?: ScanCandidate[];
            avertissements?: string[];
            /** Structure dominante du dossier analysé (chapitres ou tomes). */
            unite?: Unite;
          }
        | null;
      if (!res.ok || !Array.isArray(data?.candidates)) {
        setNasError(data?.error ?? "Analyse impossible.");
        setScan([]);
        return;
      }
      setScan(data.candidates);
      setScanFolder(data.path ?? nasPath);
      setScanWarn(data.avertissements ?? []);
      setScanUnite(data.unite ?? "chapitre");
      const nextChecked: Record<string, boolean> = {};
      const nextNumeros: Record<string, string> = {};
      for (const cand of data.candidates) {
        nextChecked[cand.path] = cand.selectionne;
        nextNumeros[cand.path] = cand.numero === null ? "" : String(cand.numero);
      }
      setChecked(nextChecked);
      setNumeros(nextNumeros);
    } catch {
      setNasError("Erreur réseau : réessayez.");
      setScan([]);
    } finally {
      setScanBusy(false);
    }
  }

  const selectedCandidates = (scan ?? []).filter(
    (c) => checked[c.path] && (numeros[c.path] ?? "").trim(),
  );

  async function runBatch() {
    if (!seriesId) {
      setError("Sélectionnez la série cible avant de lancer le lot.");
      return;
    }
    if (selectedCandidates.length === 0) {
      setError(`Cochez au moins un dossier avec un numéro de ${lotSing}.`);
      return;
    }
    const invalide = selectedCandidates.find((c) => {
      const value = Number(numeros[c.path]);
      return !Number.isInteger(value) || value < 1;
    });
    if (invalide) {
      setError(`Numéro invalide pour « ${invalide.name} » : un entier ≥ 1 est attendu.`);
      return;
    }

    setError(null);
    setBatchBusy(true);
    setBatchSummary(null);
    setRows([]);
    stopRef.current = false;

    // 1. Ouverture du suivi : un job « import par lot » pour tout le lot.
    let jobId = "";
    try {
      const start = await fetch("/api/owner/import/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libelle: `Dossier ${scanFolder ?? nasPath}` }),
      });
      const startData = (await start.json().catch(() => null)) as
        | { error?: string; jobId?: string }
        | null;
      if (!start.ok || !startData?.jobId) {
        setError(startData?.error ?? "Ouverture du lot impossible.");
        setBatchBusy(false);
        return;
      }
      jobId = startData.jobId;
    } catch {
      setError("Erreur réseau : réessayez.");
      setBatchBusy(false);
      return;
    }

    const total = selectedCandidates.length;
    const erreurs: string[] = [];
    let crees = 0;
    let echecs = 0;

    /** Une unité du lot : la requête est isolée pour rester récupérable. */
    const postChapter = (payload: Record<string, unknown>) =>
      fetch("/api/owner/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

    // 2. Chaînage dossier par dossier : chaque requête reste courte, la
    //    progression est visible et une erreur n'arrête pas le lot.
    for (let i = 0; i < total; i++) {
      const cand = selectedCandidates[i];
      const value = Number(numeros[cand.path]);
      setRunIndex(i);
      setRows((prev) => [...prev, { name: cand.name, numero: value, statut: "cours" }]);

      if (stopRef.current) {
        erreurs.push(`Lot interrompu après ${compteUnites(i, scanUnite)}.`);
        break;
      }

      try {
        const payload = {
          series_id: seriesId,
          numero: value,
          titre: "",
          volume: null,
          classification,
          source: "nas",
          pages: [],
          chemin: cand.path,
          /* Nature du dossier : l'analyse sait que « Tome 3 » n'est pas un
             chapitre ; un nom neutre (« 12 ») laisse la série décider. */
          unite:
            cand.kind === "dossier" ? undefined : cand.kind === "volume" ? "tome" : "chapitre",
          statut: lotStatut,
          publish_at: null,
          batch: { jobId, index: i + 1, total },
        };

        let res = await postChapter(payload);
        let data = (await res.json().catch(() => null)) as
          | { error?: string; nbPages?: number; warning?: string; retryAfter?: number }
          | null;

        /* Quota minute atteinte : on attend la fenêtre indiquée par le
           serveur puis on réessaie une seule fois — un lot ne doit pas échouer
           en plein parcours pour un simple compteur. */
        if (res.status === 429 && !stopRef.current) {
          const wait = Math.min(65, Math.max(2, Number(data?.retryAfter) || 60));
          setRows((prev) =>
            prev.map((row, index) =>
              index === prev.length - 1
                ? { ...row, message: `Quota minute atteint — attente ${wait}s…` }
                : row,
            ),
          );
          await new Promise((resolve) => setTimeout(resolve, wait * 1000));
          if (!stopRef.current) {
            res = await postChapter(payload);
            data = (await res.json().catch(() => null)) as
              | { error?: string; nbPages?: number; warning?: string }
              | null;
          }
        }

        if (!res.ok) {
          echecs += 1;
          const message = data?.error ?? "Import impossible.";
          erreurs.push(`${cand.name} : ${message}`);
          setRows((prev) =>
            prev.map((row, index) =>
              index === prev.length - 1 ? { ...row, statut: "erreur", message } : row,
            ),
          );
        } else {
          crees += 1;
          setRows((prev) =>
            prev.map((row, index) =>
              index === prev.length - 1
                ? {
                    ...row,
                    statut: "ok",
                    pages: data?.nbPages ?? 0,
                    message: data?.warning,
                  }
                : row,
            ),
          );
        }
      } catch {
        echecs += 1;
        erreurs.push(`${cand.name} : erreur réseau.`);
        setRows((prev) =>
          prev.map((row, index) =>
            index === prev.length - 1
              ? { ...row, statut: "erreur", message: "Erreur réseau." }
              : row,
          ),
        );
      }
    }

    // 3. Clôture du job avec le rapport complet.
    const message =
      echecs === 0
        ? `Import par lot terminé : ${compteUnites(crees, scanUnite)} créé${
            crees === 1 ? "" : "s"
          }.`
        : `Import par lot : ${crees} créé(s), ${echecs} en erreur.`;
    try {
      await fetch("/api/owner/import/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          statut: echecs > 0 ? "erreur" : "termine",
          progression: 100,
          message,
          erreurs: erreurs.slice(0, 100),
        }),
      });
    } catch {
      /* le rapport local reste affiché même si la clôture échoue */
    }

    setBatchSummary({ crees, echecs });
    setRunIndex(-1);
    setBatchBusy(false);
    router.refresh();
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

  /** Albums récents du compte (Gérant) : une page = 24 albums. */
  async function loadImgPosts(page = 1) {
    setImgBusy(true);
    setImgError(null);
    try {
      const res = await fetch(`/api/owner/imgchest/posts?page=${page}`);
      const data = (await res.json().catch(() => null)) as
        | { error?: string; posts?: ImgPost[]; hasMore?: boolean }
        | null;
      if (!res.ok) {
        setImgError(data?.error ?? "Liste des albums impossible.");
        if (page === 1) setImgPosts([]);
        return;
      }
      const posts = Array.isArray(data?.posts) ? data.posts : [];
      setImgPosts((prev) => (page === 1 ? posts : [...prev, ...posts]));
      setImgPage(page);
      setImgMore(Boolean(data?.hasMore));
    } catch {
      setImgError("Erreur réseau : réessayez.");
    } finally {
      setImgBusy(false);
    }
  }

  /** Retient un album : le nombre de pages est vérifié avant l'import. */
  async function selectImgPost(id: string) {
    const target = id.trim();
    if (!target) {
      setError("Saisissez un identifiant d'album.");
      return;
    }
    setImgBusy(true);
    setImgError(null);
    try {
      const res = await fetch(`/api/owner/imgchest/post?id=${encodeURIComponent(target)}`);
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            id?: string;
            title?: string;
            count?: number;
            bytes?: number;
            views?: number;
            nsfw?: boolean;
          }
        | null;
      if (!res.ok || typeof data?.count !== "number") {
        setImgError(data?.error ?? "Album introuvable.");
        setImgInfo(null);
        setImgSelected(null);
        return;
      }
      setImgInfo({
        id: data.id ?? target,
        title: data.title ?? "Sans titre",
        count: data.count,
        bytes: data.bytes ?? 0,
        views: data.views ?? 0,
        nsfw: Boolean(data.nsfw),
      });
      setImgSelected(data.id ?? target);
      setImgManual(data.id ?? target);
    } catch {
      setImgError("Erreur réseau : réessayez.");
    } finally {
      setImgBusy(false);
    }
  }

  const tabs: Array<{ key: "lot" | "nas" | "imgchest" | "drive"; label: string }> = [
    { key: "lot", label: "Import par lot" },
    { key: "nas", label: `Un ${serieSing}` },
    { key: "imgchest", label: "Depuis ImgChest" },
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

      {/* ── Onglet 1 : import par lot depuis un dossier de série ────────── */}
      {tab === "lot" && (
        <Card className="space-y-5 p-5">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <ListChecks className="size-4 text-primary" /> Import par lot — dossier de série
            </h2>
            <p className="mt-1 text-xs text-muted">
              Pointez le dossier qui contient les {lotPlur} d&apos;une série : chaque sous-dossier
              est analysé, les {lotPlur} déjà en base sont écartés, puis les manquants sont indexés
              en une passe. Un seul « job » suit le lot dans le tableau de bord.
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
                  hint={`La série cible sert à écarter les ${lotPlur} déjà importés.`}
                >
                  <Input
                    id="lot-filter"
                    value={seriesFilter}
                    onChange={(e) => setSeriesFilter(e.target.value)}
                    placeholder="Titre de la série…"
                  />
                </Field>
                <Field label="Série cible *" htmlFor="lot-series">
                  <Select
                    id="lot-series"
                    value={seriesId}
                    onChange={(e) => onPickSeries(e.target.value)}
                  >
                    <option value="">— Choisir une série —</option>
                    {filteredSeries.map((s) => (
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
                      value={nasPath}
                      onChange={(e) => setNasPath(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          goTo(nasPath);
                        }
                      }}
                      aria-label="Chemin sur le NAS"
                      placeholder="/scans/mon-manga"
                    />
                  </Field>
                </div>
                <Button type="button" onClick={() => goTo(nasPath)} disabled={nasBusy}>
                  {nasBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Ouvrir
                </Button>
                <Button
                  type="button"
                  onClick={() => void runScan()}
                  variant="primary"
                  disabled={scanBusy || !seriesId}
                  title={
                    seriesId
                      ? "Analyser les sous-dossiers de ce dossier"
                      : "Choisissez d'abord la série cible"
                  }
                >
                  {scanBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ListChecks className="size-4" />
                  )}
                  Analyser le dossier
                </Button>
              </div>

              <Breadcrumbs crumbs={crumbs} onGo={goTo} />

              {nasError && <p className="text-sm text-adult">{nasError}</p>}

              {nasItems.length > 0 && (
                <ul className="max-h-56 overflow-auto rounded-xl border border-line divide-y divide-line">
                  {nasItems
                    .filter((item) => item.isDir)
                    .slice(0, 60)
                    .map((item) => {
                      const childPath = `${nasPath.replace(/\/+$/, "")}/${item.name}`;
                      return (
                        <li key={item.name}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface2"
                            onClick={() => goTo(childPath)}
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

              {scan && (
                <BatchScanTable
                  candidates={scan}
                  unite={lotUnite}
                  checked={checked}
                  numeros={numeros}
                  onCheck={(path, value) => setChecked((prev) => ({ ...prev, [path]: value }))}
                  onNumero={(path, value) => setNumeros((prev) => ({ ...prev, [path]: value }))}
                  onSelectAll={(value) =>
                    setChecked(() => {
                      const next: Record<string, boolean> = {};
                      for (const c of scan) next[c.path] = value ? c.etat === "pret" : false;
                      return next;
                    })
                  }
                />
              )}

              {scan && scan.length === 0 && (
                <p className="rounded-xl border border-line bg-surface2 px-4 py-3 text-sm text-muted">
                  Aucun sous-dossier dans ce dossier.
                </p>
              )}

              {scanWarn.map((warn) => (
                <p
                  key={warn}
                  className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn"
                >
                  {warn}
                </p>
              ))}

              {scan && scan.length > 0 && (
                <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface2 px-4 py-3">
                  <Field label={`Statut des ${lotPlur} créés`} htmlFor="lot-statut">
                    <Select
                      id="lot-statut"
                      value={lotStatut}
                      onChange={(e) => setLotStatut(e.target.value as "draft" | "published")}
                    >
                      <option value="draft">Brouillon (à publier ensuite)</option>
                      <option value="published">Publié immédiatement</option>
                    </Select>
                  </Field>
                  <div className="flex items-end gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void runBatch()}
                      disabled={batchBusy || selectedCandidates.length === 0}
                    >
                      {batchBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Play className="size-4" />
                      )}
                      Importer {compteUnites(selectedCandidates.length, lotUnite)}
                    </Button>
                    {batchBusy && (
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => {
                          stopRef.current = true;
                        }}
                      >
                        <Square className="size-4" /> Interrompre
                      </Button>
                    )}
                  </div>
                  <p className="w-full text-xs text-muted">
                    {selectedCandidates.length} dossier(s) sélectionné(s) sur {scan.length}.
                    L&apos;import se fait dossier par dossier : les erreurs sont listées sans
                    arrêter le lot.
                  </p>
                </div>
              )}

              {batchBusy && (
                <div className="space-y-2">
                  {(() => {
                    const pct = selectedCandidates.length
                      ? (Math.max(runIndex, 0) / selectedCandidates.length) * 100
                      : 0;
                    return (
                      <>
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>
                            {libelleUnite(
                              Math.min(runIndex + 1, selectedCandidates.length),
                              lotUnite,
                            )}{" "}
                            /{" "}
                            {selectedCandidates.length}
                          </span>
                          <span className="tabular-nums">{Math.round(pct)}%</span>
                        </div>
                        <div
                          className="h-2 overflow-hidden rounded-full bg-surface2"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(pct)}
                        >
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {rows.length > 0 && (
                <ol className="max-h-72 space-y-1 overflow-auto rounded-xl border border-line text-sm">
                  {rows.map((row, index) => (
                    <li
                      key={`${row.name}-${index}`}
                      className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-0"
                    >
                      {row.statut === "cours" ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                      ) : row.statut === "ok" ? (
                        <CheckCircle2 className="size-4 shrink-0 text-ok" />
                      ) : (
                        <CircleAlert className="size-4 shrink-0 text-adult" />
                      )}
                      <span className="tabular-nums text-muted">n°{row.numero}</span>
                      <span className="truncate text-fg">{row.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted">
                        {row.statut === "cours"
                          ? "indexation…"
                          : row.statut === "ok"
                            ? `${row.pages ?? 0} page(s)`
                            : (row.message ?? "erreur")}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {batchSummary && !batchBusy && (
                <p
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    batchSummary.echecs > 0
                      ? "border-adult/40 bg-adult/10 text-adult"
                      : "border-ok/40 bg-ok/10 text-ok"
                  }`}
                >
                  Lot terminé : {compteUnites(batchSummary.crees, lotUnite)} créé
                  {batchSummary.crees === 1 ? "" : "s"}
                  {batchSummary.echecs > 0 && `, ${batchSummary.echecs} en erreur`}. Ouvrez le
                  tableau de bord pour le rapport détaillé.
                </p>
              )}
            </>
          )}
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
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="Dossier sur le NAS" htmlFor="nas-path">
                    <Input
                      id="nas-path"
                      value={nasPath}
                      onChange={(e) => setNasPath(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          goTo(nasPath);
                        }
                      }}
                      aria-label="Chemin sur le NAS"
                      placeholder="/scans/mon-manga"
                    />
                  </Field>
                </div>
                <Button
                  type="button"
                  onClick={() => goTo(parentPath(nasPath))}
                  disabled={nasBusy || nasPath === "/"}
                  title="Monter d'un niveau"
                >
                  <ArrowUp className="size-4" /> Monter
                </Button>
                <Button type="button" onClick={() => goTo(nasPath)} disabled={nasBusy}>
                  {nasBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Lister
                </Button>
              </div>

              <Breadcrumbs crumbs={crumbs} onGo={goTo} />

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
                              goTo(childPath);
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
                unite={serieUnite}
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

      {/* ── Onglet 3 : ImgChest ──────────────────────────────────────── */}
      {tab === "imgchest" && (
        <Card className="space-y-5 p-5">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Images className="size-4 text-primary" /> Albums ImgChest
            </h2>
            <p className="mt-1 text-xs text-muted">
              Un album = un {serieSing}. Les images restent sur le CDN d&apos;ImgChest : seul
              l&apos;index
              des pages est enregistré en base, la lecture n&apos;appelle jamais ImgChest.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Identifiant d'album" htmlFor="i-imgchest" hint="Ex. : qe4gwgozq7j">
              <Input
                id="i-imgchest"
                value={imgManual}
                onChange={(e) => setImgManual(e.target.value)}
                placeholder="qe4gwgozq7j"
                className="max-w-[16rem]"
              />
            </Field>
            <Button
              type="button"
              onClick={() => void selectImgPost(imgManual)}
              disabled={imgBusy}
            >
              {imgBusy ? <Loader2 className="size-4 animate-spin" /> : <FileImage className="size-4" />}
              Vérifier l&apos;album
            </Button>
            {imgchestList && (
              <Button type="button" onClick={() => void loadImgPosts(1)} disabled={imgBusy}>
                <RefreshCw className="size-4" />
                Albums récents
              </Button>
            )}
          </div>

          {!imgchestList && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
              La liste automatique est désactivée : renseignez la variable{" "}
              <code className="font-mono">IMG_CHEST_USERNAME</code> (compte qui héberge les scans)
              puis redéployez. La saisie manuelle d&apos;identifiant fonctionne déjà.
            </p>
          )}

          {imgError && <p className="text-sm text-adult">{imgError}</p>}

          {imgPosts.length > 0 && (
            <ul className="max-h-80 overflow-auto rounded-xl border border-line divide-y divide-line">
              {imgPosts.map((post) => (
                <li key={post.id}>
                  <button
                    type="button"
                    aria-pressed={imgSelected === post.id}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                      imgSelected === post.id ? "bg-surface2" : "hover:bg-surface2"
                    }`}
                    onClick={() => void selectImgPost(post.id)}
                  >
                    {post.thumbnail ? (
                      // CDN externe d'ImgChest : miniatures 40px, non optimisables par next/image.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.thumbnail}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        className="size-10 shrink-0 rounded-md border border-line object-cover"
                      />
                    ) : (
                      <Images className="size-5 shrink-0 text-muted" />
                    )}
                    <span className="truncate text-fg">{post.title}</span>
                    {post.nsfw && <Badge tone="adult">+18</Badge>}
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
                      {post.views.toLocaleString("fr-FR")} vues
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {imgMore && (
            <div>
              <Button type="button" onClick={() => void loadImgPosts(imgPage + 1)} disabled={imgBusy}>
                <RefreshCw className="size-4" /> Albums suivants
              </Button>
            </div>
          )}

          {imgInfo && (
            <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
              Album retenu :{" "}
              <span className="font-semibold text-fg">{imgInfo.title}</span> — {imgInfo.count} pages ·{" "}
              {formatBytes(imgInfo.bytes)}
              {imgInfo.nsfw ? " · +18" : ""}
            </p>
          )}

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
            unite={serieUnite}
            classification={classification}
            onClassification={setClassification}
            error={error}
            busy={busy}
            onSubmit={(e) => submitImport("imgchest", e)}
            source="imgchest"
            statut={statut}
            onStatut={setStatut}
            publishAt={publishAt}
            onPublishAt={setPublishAt}
          />
        </Card>
      )}

      {/* ── Onglet 4 : Google Drive ──────────────────────────────────── */}
      {tab === "drive" && (
        <Card className="space-y-4 p-5">
          <h2 className="section-title flex items-center gap-2">
            <Archive className="size-4 text-primary" /> Google Drive — ressources de séries
          </h2>
          <ul className="space-y-2 text-sm text-muted">
            <li>• Drive ne contient que les couvertures, bannières et métadonnées des séries.</li>
            <li>• Les pages de scans ne transitent jamais par Drive : elles restent sur le NAS.</li>
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

/* ── Aperçu d'un dossier NAS avant indexation ──────────────────── */

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
              width={64}
              height={96}
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
  /** Organisation de la série cible : « Chapitre » ou « Tome ». */
  unite: Unite;
  classification: Classification;
  onClassification: (value: Classification) => void;
  error: string | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  source: "nas" | "imgchest";
  statut: ImportStatut;
  onStatut: (value: ImportStatut) => void;
  publishAt: string;
  onPublishAt: (value: string) => void;
}) {
  /** Sources où seuls des noms / URLs sont indexés (aucun octet transité). */
  const indexed = props.source === "nas" || props.source === "imgchest";
  const sing = libelleUniteSingulier(props.unite).toLowerCase();
  const plur = libelleUnitesPluriel(props.unite).toLowerCase();
  const submitLabel =
    props.statut === "published"
      ? indexed
        ? "Indexer et publier"
        : "Importer et publier"
      : props.statut === "scheduled"
        ? "Programmer la publication"
        : indexed
          ? `Indexer le ${sing} (brouillon)`
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

      <Field label={`Numéro de ${sing} *`} htmlFor="i-numero">
        <Input
          id="i-numero"
          type="number"
          min={1}
          value={props.numero}
          onChange={(e) => props.onNumero(e.target.value)}
          placeholder="25"
        />
      </Field>

      <Field
        label={`Titre du ${sing}`}
        htmlFor="i-titre"
        hint={`Facultatif (« ${libelleUnite(25, props.unite)} » par défaut).`}
      >
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
        hint={`Les ${plur} programmés sont publiés automatiquement par le cron.`}>
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
          {props.busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
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
            {libelleUnite(result.numero, result.unite)} créé — {result.nbPages} pages indexées
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

/* -- Fil d'Ariane du navigateur NAS --------------------------------------- */

function Breadcrumbs({
  crumbs,
  onGo,
}: {
  crumbs: Array<{ label: string; path: string }>;
  onGo: (path: string) => void;
}) {
  if (crumbs.length <= 1) return null;
  return (
    <nav aria-label="Fil d'Ariane du NAS" className="flex flex-wrap items-center gap-1 text-xs">
      {crumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center gap-1">
          {index > 0 && (
            <span className="text-muted" aria-hidden="true">
              /
            </span>
          )}
          <button
            type="button"
            className={index === crumbs.length - 1 ? "chip chip-active" : "chip"}
            aria-current={index === crumbs.length - 1 ? "page" : undefined}
            onClick={() => onGo(crumb.path)}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </nav>
  );
}

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
function BatchScanTable({
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
          {deja > 0 && ` · ${deja} déjà importé(s)`}
          {" "}
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
