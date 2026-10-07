"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";

export type HistoriqueEntree = {
  key: string;
  chapterId: string;
  seriesId: string;
  page: number;
  completed: boolean;
  readAt: string;
  titre: string;
  slug: string | null;
  numero: number | null;
  couverture: string | null;
};

export type HistoriqueGroupe = {
  date: string;
  label: string;
  entries: HistoriqueEntree[];
};

export function HistoriqueClient({ groupes }: { groupes: HistoriqueGroupe[] }) {
  const router = useRouter();
  const [removed, setRemoved] = useState<string[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = groupes.reduce((sum, g) => sum + g.entries.length, 0) - removed.length;

  async function removeEntry(entry: HistoriqueEntree) {
    setBusyKey(entry.key);
    setError(null);
    try {
      const res = await fetch(
        `/api/reading/history?entry=${encodeURIComponent(entry.chapterId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Impossible de supprimer cette entrée.");
        return;
      }
      setRemoved((prev) => [...prev, entry.key]);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setBusyKey(null);
    }
  }

  async function clearAll() {
    setClearing(true);
    setError(null);
    try {
      const res = await fetch("/api/reading/history", { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Impossible d'effacer l'historique.");
        setConfirmOpen(false);
        return;
      }
      setRemoved(groupes.flatMap((g) => g.entries.map((e) => e.key)));
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
      setConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Historique de lecture</h1>
          <p className="text-sm text-muted">
            {total} entrée{total > 1 ? "s" : ""} · regroupée{total > 1 ? "s" : ""} par jour
          </p>
        </div>
        <button
          type="button"
          className="btn-danger text-sm"
          onClick={() => setConfirmOpen(true)}
          disabled={total === 0}
        >
          <Trash2 className="size-4" />
          Tout effacer
        </button>
      </header>

      {error && (
        <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
          {error}
        </p>
      )}

      {groupes.map((groupe) => {
        const entries = groupe.entries.filter((e) => !removed.includes(e.key));
        if (entries.length === 0) return null;
        return (
          <section key={groupe.date}>
            <h2 className="section-title">{groupe.label}</h2>
            <ul className="mt-3 space-y-2">
              {entries.map((entry) => (
                <li key={entry.key} className="card flex items-center gap-3 p-3">
                  {/* couverture et titre mènent à la fiche série ; la
                      reprise de lecture est un bouton explicite à part. */}
                  <Link
                    href={entry.slug ? `/serie/${entry.slug}` : "/catalogue"}
                    className="shrink-0"
                    aria-label={`Voir la fiche de ${entry.titre}`}
                  >
                    {entry.couverture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.couverture}
                        alt=""
                        width={48}
                        height={72}
                        loading="lazy"
                        decoding="async"
                        className="h-[72px] w-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="grid h-[72px] w-12 shrink-0 place-items-center rounded-lg bg-surface2 text-xs text-muted">
                        ?
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={entry.slug ? `/serie/${entry.slug}` : "/catalogue"}
                        className="truncate font-semibold text-fg hover:text-primary"
                      >
                        {entry.titre}
                      </Link>
                      {entry.completed && <Badge tone="ok">Terminé</Badge>}
                    </div>
                    <p className="text-xs text-muted">
                      {entry.numero !== null ? `Chapitre ${entry.numero} · ` : ""}
                      page {Math.max(entry.page, 1)} ·{" "}
                      {new Date(entry.readAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {entry.numero !== null && entry.slug && (
                      <Link
                        href={`/serie/${entry.slug}/chapitre-${entry.numero}`}
                        className="btn-ghost text-sm"
                        aria-label={`Reprendre ${entry.titre} au chapitre ${entry.numero}, page ${Math.max(entry.page, 1)}`}
                      >
                        <Play aria-hidden className="size-4" />
                        Reprendre
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => void removeEntry(entry)}
                      disabled={busyKey === entry.key}
                      aria-label={`Supprimer « ${entry.titre} » de l'historique`}
                      className="btn-ghost shrink-0 px-2 text-adult"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Effacer tout l’historique ?"
      >
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            Toutes les entrées de lecture seront supprimées. Votre bibliothèque et vos séries
            suivies ne sont pas concernées.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={clearing}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => void clearAll()}
              disabled={clearing}
            >
              {clearing ? "Effacement…" : "Tout effacer"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
