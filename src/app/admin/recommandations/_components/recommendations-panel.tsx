"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui/kit";
import type { Recommendation } from "@/lib/types";

type SeriesLite = { id: string; titre: string; slug: string; couverture: string };

const PLACEMENTS: Array<{ value: Recommendation["placement"]; label: string }> = [
  { value: "home", label: "Page d'accueil" },
  { value: "series", label: "Fiche série" },
  { value: "end_chapter", label: "Fin de chapitre" },
];

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Sélecteur de série (recherche par titre) ─────────────────────────── */

function SeriesSelector({
  value,
  onChange,
  seriesById,
}: {
  value: string;
  onChange: (id: string) => void;
  seriesById: Record<string, SeriesLite>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SeriesLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      // différé d'un tick : évite un setState synchrone dans l'effet
      const clear = window.setTimeout(() => setResults([]), 0);
      return () => window.clearTimeout(clear);
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/catalogue/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data: unknown) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : [];
          setResults(list as SeriesLite[]);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  const selected = seriesById[value];

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.couverture}
            alt=""
            width={40}
            height={60}
            loading="lazy"
            className="h-15 w-10 rounded object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
            {selected.titre}
          </span>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
          >
            Changer
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une série par titre…"
              aria-label="Rechercher une série"
            />
            <Search className="size-4 shrink-0 text-muted" />
          </div>
          {loading && <p className="mt-1 text-xs text-muted">Recherche…</p>}
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-fg hover:bg-surface2"
                    onClick={() => {
                      onChange(item.id);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.couverture}
                      alt=""
                      width={24}
                      height={36}
                      loading="lazy"
                      className="h-9 w-6 rounded object-cover"
                    />
                    <span className="truncate">{item.titre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && !loading && results.length === 0 && (
            <p className="mt-1 text-xs text-muted">Aucun résultat.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Panneau CRUD ─────────────────────────────────────────────────────── */

export function RecommendationsPanel({
  initial,
  seriesById,
}: {
  initial: Recommendation[];
  seriesById: Record<string, SeriesLite>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [placement, setPlacement] = useState<Recommendation["placement"]>("home");
  const [titre, setTitre] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [ordre, setOrdre] = useState("0");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [actif, setActif] = useState(true);

  const editing = useMemo(() => items.find((i) => i.id === editId) ?? null, [items, editId]);

  useEffect(() => {
    if (!editing) return;
    // préremplissage différé d'un tick (pas de setState synchrone dans l'effet)
    const timer = window.setTimeout(() => {
      setPlacement(editing.placement);
      setTitre(editing.titre);
      setSeriesId(editing.series_id);
      setOrdre(String(editing.ordre));
      setDebut(toLocalInput(editing.debut));
      setFin(toLocalInput(editing.fin));
      setActif(editing.actif);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editing]);

  function resetForm() {
    setEditId(null);
    setPlacement("home");
    setTitre("");
    setSeriesId("");
    setOrdre("0");
    setDebut("");
    setFin("");
    setActif(true);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!seriesId) {
      setError("Sélectionnez une série.");
      return;
    }
    setBusy(true);
    setError(null);

    const payload = {
      placement,
      titre: titre.trim() || "Sélection de la rédaction",
      series_id: seriesId,
      ordre: Number(ordre) || 0,
      debut: toIso(debut),
      fin: toIso(fin),
      actif,
    };

    try {
      const res = await fetch(
        editId ? `/api/admin/recommendations/${editId}` : "/api/admin/recommendations",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Enregistrement impossible.");
        return;
      }
      resetForm();
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActif(item: Recommendation) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/recommendations/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif: !item.actif }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Modification impossible.");
        return;
      }
      setItems((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, actif: !item.actif } : r)),
      );
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    }
  }

  async function remove(item: Recommendation) {
    if (!window.confirm(`Supprimer la recommandation « ${item.titre} » ?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/recommendations/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Suppression impossible.");
        return;
      }
      setItems((prev) => prev.filter((r) => r.id !== item.id));
      if (editId === item.id) resetForm();
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Card className="h-fit space-y-4 p-5">
        <h2 className="section-title">{editId ? "Modifier" : "Nouvelle recommandation"}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Série</label>
            <SeriesSelector value={seriesId} onChange={setSeriesId} seriesById={seriesById} />
          </div>

          <Field label="Titre de la sélection" htmlFor="r-titre">
            <Input
              id="r-titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              maxLength={120}
              placeholder="Coup de cœur de la rédaction"
            />
          </Field>

          <Field label="Placement" htmlFor="r-placement">
            <Select
              id="r-placement"
              value={placement}
              onChange={(e) => setPlacement(e.target.value as Recommendation["placement"])}
            >
              {PLACEMENTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ordre" htmlFor="r-ordre">
              <Input
                id="r-ordre"
                type="number"
                min={0}
                max={999}
                value={ordre}
                onChange={(e) => setOrdre(e.target.value)}
              />
            </Field>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={actif}
                  onChange={(e) => setActif(e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Actif
              </label>
            </div>
          </div>

          <Field label="Début (optionnel)" htmlFor="r-debut">
            <Input
              id="r-debut"
              type="datetime-local"
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
            />
          </Field>
          <Field label="Fin (optionnel)" htmlFor="r-fin">
            <Input id="r-fin" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
          </Field>

          {error && <p className="text-sm text-adult">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              <Plus className="size-4" />
              {editId ? "Enregistrer" : "Créer"}
            </Button>
            {editId && (
              <button type="button" className="btn-ghost" onClick={resetForm}>
                Annuler
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[42rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-4 py-3 font-semibold">Sélection</th>
              <th className="px-4 py-3 font-semibold">Placement</th>
              <th className="px-4 py-3 font-semibold">Série</th>
              <th className="px-4 py-3 text-right font-semibold">Ordre</th>
              <th className="px-4 py-3 font-semibold">Période</th>
              <th className="px-4 py-3 font-semibold">État</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-line last:border-0 hover:bg-surface2/60">
                <td className="px-4 py-3 font-medium text-fg">{item.titre}</td>
                <td className="px-4 py-3 text-muted">
                  {PLACEMENTS.find((p) => p.value === item.placement)?.label ?? item.placement}
                </td>
                <td className="px-4 py-3 text-muted">
                  {seriesById[item.series_id]?.titre ?? "Série supprimée"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">{item.ordre}</td>
                <td className="px-4 py-3 text-xs text-muted">
                  {formatDate(item.debut)} → {formatDate(item.fin)}
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => toggleActif(item)} title="Activer / désactiver">
                    <Badge tone={item.actif ? "ok" : "neutral"}>{item.actif ? "Actif" : "Inactif"}</Badge>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn-secondary px-2 py-1 text-xs"
                      onClick={() => setEditId(item.id)}
                    >
                      <Pencil className="size-3" /> Modifier
                    </button>
                    <button
                      type="button"
                      className="btn-danger px-2 py-1 text-xs"
                      onClick={() => remove(item)}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Aucune recommandation pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
