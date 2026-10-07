"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Search, Undo2 } from "lucide-react";
import { Badge, Card, Input } from "@/components/ui/kit";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/lib/types";

export type UserRow = {
  userId: string;
  pseudo: string;
  role: Role;
  dateInscription: string;
  banni: boolean;
  nbCommentaires: number;
};

const ROLE_OPTIONS: Role[] = ["membre", "modo", "admin", "owner"];
const HIGH_ROLES: Role[] = ["admin", "owner"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Table des profils : changement de rôle et bannissement.
 * Cloisonnement : un admin ne touche pas aux rôles Admin/Gérant
 * et ne se modifie jamais lui-même — le serveur revérifie de toute façon.
 */
export function UsersPanel({ rows, me }: { rows: UserRow[]; me: { id: string; role: Role } }) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meIsOwner = me.role === "owner";

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((row) => row.pseudo.toLowerCase().includes(needle));
  }, [items, query]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Modification impossible.");
        return false;
      }
      return true;
    } catch {
      setError("Erreur réseau : réessayez.");
      return false;
    }
  }

  async function changeRole(row: UserRow, role: Role) {
    if (role === row.role) return;
    if (!window.confirm(`Attribuer le rôle « ${ROLE_LABELS[role]} » à ${row.pseudo} ?`)) return;
    setBusyId(row.userId);
    const ok = await patch({ userId: row.userId, role });
    if (ok) {
      setItems((prev) => prev.map((r) => (r.userId === row.userId ? { ...r, role } : r)));
      router.refresh();
    }
    setBusyId(null);
  }

  async function toggleBan(row: UserRow) {
    const action = row.banni ? "débannir" : "bannir";
    if (!window.confirm(`Voulez-vous ${action} ${row.pseudo} ?`)) return;
    setBusyId(row.userId);
    const banni = !row.banni;
    const ok = await patch({ userId: row.userId, banni });
    if (ok) {
      setItems((prev) => prev.map((r) => (r.userId === row.userId ? { ...r, banni } : r)));
      router.refresh();
    }
    setBusyId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex max-w-md items-center gap-2">
        <label className="sr-only" htmlFor="user-search">
          Rechercher un utilisateur
        </label>
        <Input
          id="user-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un pseudo…"
        />
        <Search className="size-4 shrink-0 text-muted" />
      </div>

      {error && (
        <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
          {error}
        </p>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-4 py-3 font-semibold">Pseudo</th>
              <th className="px-4 py-3 font-semibold">Rôle</th>
              <th className="px-4 py-3 font-semibold">Inscription</th>
              <th className="px-4 py-3 text-right font-semibold">Commentaires</th>
              <th className="px-4 py-3 text-right font-semibold">Compte</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const isSelf = row.userId === me.id;
              const targetIsHigh = HIGH_ROLES.includes(row.role);
              const canEditRole = !isSelf && (meIsOwner || !targetIsHigh);
              const tooltip = isSelf
                ? "Impossible de modifier son propre compte."
                : targetIsHigh && !meIsOwner
                  ? "Seul le Gérant peut modifier un Administrateur ou un Gérant."
                  : undefined;

              return (
                <tr key={row.userId} className="border-b border-line last:border-0 hover:bg-surface2/60">
                  <td className="px-4 py-3">
                    <span className="font-medium text-fg">{row.pseudo}</span>
                    {isSelf && <span className="ml-2 text-xs text-muted">(vous)</span>}
                    {row.banni && (
                      <span className="ml-2">
                        <Badge tone="adult">Banni</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input w-auto min-w-40 disabled:cursor-not-allowed disabled:opacity-60"
                      value={row.role}
                      disabled={busyId !== null || !canEditRole}
                      title={tooltip}
                      aria-label={`Rôle de ${row.pseudo}`}
                      onChange={(e) => changeRole(row, e.target.value as Role)}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role} disabled={!meIsOwner && HIGH_ROLES.includes(role)}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(row.dateInscription)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {row.nbCommentaires}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={row.banni ? "btn-secondary px-2 py-1 text-xs" : "btn-danger px-2 py-1 text-xs"}
                      disabled={busyId !== null || isSelf}
                      title={isSelf ? "Impossible de bannir son propre compte." : undefined}
                      onClick={() => toggleBan(row)}
                    >
                      {row.banni ? (
                        <>
                          <Undo2 className="size-3" /> Débannir
                        </>
                      ) : (
                        <>
                          <Ban className="size-3" /> Bannir
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Aucun profil ne correspond à « {query} ».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted">
        Le drapeau <code className="font-mono">banni</code> est enregistré sur le profil
        (colonne <code className="font-mono">profiles.banni</code>). Aucune route ne le bloque
        encore : l&apos;application du bannissement (interdiction de commenter ou de signaler,
        révocation de session) reste à brancher dans les routes concernées.
      </p>
    </div>
  );
}
