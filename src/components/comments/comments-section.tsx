"use client";

import clsx from "clsx";
import {
  CornerDownRight,
  Flag,
  Heart,
  Loader2,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";

export interface CommentNode {
  id: string;
  target_type: "series" | "chapter";
  target_id: string;
  parent_id: string | null;
  user_id: string;
  pseudo: string;
  contenu: string;
  spoiler: boolean;
  likes: number;
  dislikes: number;
  statut: "visible" | "masque" | "supprime";
  created_at: string;
  updated_at: string;
  liked?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  children?: CommentNode[];
}

const MAX_LENGTH = 4000;

const REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: "spoiler_non_masque", label: "Spoiler non masqué" },
  { value: "spam", label: "Spam / publicité" },
  { value: "harcèlement", label: "Harcèlement ou propos haineux" },
  { value: "hors_sujet", label: "Hors sujet" },
  { value: "autre", label: "Autre" },
];

type Sort = "recents" | "populaires";

/**
 * Commentaires d’une série ou d’un chapitre (§8) : arbre 2 niveaux,
 * likes, spoiler, édition 15 min, suppression et signalement.
 */
export function CommentsSection({
  targetType,
  targetId,
  canComment,
  adultOnly = false,
}: {
  targetType: "series" | "chapter";
  targetId: string;
  canComment: boolean;
  adultOnly?: boolean;
}) {
  const [roots, setRoots] = useState<CommentNode[]>([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<Sort>("recents");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ id: string; contenu: string } | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/comments?target=${encodeURIComponent(`${targetType}:${targetId}`)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        comments?: CommentNode[];
        total?: number;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Impossible de charger les commentaires.");
        return;
      }
      setRoots(data?.comments ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      setError("Impossible de charger les commentaires.");
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    // premier chargement différé d'un tick (évite un setState synchrone
    // exécuté directement dans l'effet)
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const shown = useMemo(() => {
    const list = roots.map((r) => ({ ...r, children: [...(r.children ?? [])] }));
    if (sort === "populaires") {
      list.sort((a, b) => b.likes - a.likes);
      for (const r of list) r.children.sort((a, b) => b.likes - a.likes);
    }
    return list;
  }, [roots, sort]);

  function reveal(id: string) {
    setRevealed((prev) => new Set(prev).add(id));
  }

  async function submit() {
    const contenu = text.trim();
    if (!contenu) {
      setFormError("Le commentaire est vide.");
      return;
    }
    if (contenu.length > MAX_LENGTH) {
      setFormError(`Le commentaire dépasse ${MAX_LENGTH} caractères.`);
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, parentId, contenu, spoiler }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setFormError(data?.error ?? "Publication impossible, réessayez.");
        return;
      }
      setText("");
      setSpoiler(false);
      setParentId(null);
      setReplyTo(null);
      await load();
    } catch {
      setFormError("Erreur réseau, réessayez.");
    } finally {
      setSending(false);
    }
  }

  async function toggleLike(node: CommentNode) {
    const liked = Boolean(node.liked);
    try {
      const res = await fetch(`/api/comments/${node.id}/like`, {
        method: liked ? "DELETE" : "POST",
      });
      if (res.status === 401) {
        setError("Connectez-vous pour liker un commentaire.");
        return;
      }
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as {
        likes?: number;
        liked?: boolean;
      } | null;
      patchNode(node.id, (n) => ({
        ...n,
        likes: data?.likes ?? n.likes,
        liked: data?.liked ?? !liked,
      }));
    } catch {
      /* erreur silencieuse : le like reste optimiste */
    }
  }

  function patchNode(id: string, fn: (n: CommentNode) => CommentNode) {
    setRoots((prev) =>
      prev.map((root) => {
        if (root.id === id) return fn(root);
        return {
          ...root,
          children: root.children?.map((c) => (c.id === id ? fn(c) : c)),
        };
      }),
    );
  }

  async function saveEdit() {
    if (!editing) return;
    const contenu = editing.contenu.trim();
    if (!contenu) return;
    setSending(true);
    try {
      const res = await fetch(`/api/comments/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setFormError(data?.error ?? "Modification impossible.");
        return;
      }
      setEditing(null);
      await load();
    } catch {
      setFormError("Erreur réseau, réessayez.");
    } finally {
      setSending(false);
    }
  }

  async function remove(node: CommentNode) {
    if (!window.confirm("Supprimer définitivement ce commentaire ?")) return;
    try {
      const res = await fetch(`/api/comments/${node.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setFormError(data?.error ?? "Suppression impossible.");
        return;
      }
      await load();
    } catch {
      setFormError("Erreur réseau, réessayez.");
    }
  }

  async function report(node: CommentNode, raison: string, details: string) {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "comment", targetId: node.id, raison, details }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Signalement impossible.");
    }
    setReporting(null);
  }

  function startReply(node: CommentNode) {
    // 2 niveaux maximum : une réponse à une réponse reste rattachée au parent.
    setParentId(node.parent_id ?? node.id);
    setReplyTo(node.pseudo);
    setFormError(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return (
    <section id="commentaires" className="scroll-mt-24 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">
          Commentaires{" "}
          <span className="text-sm font-normal text-muted">({total})</span>
        </h2>
        <div className="flex gap-1" role="group" aria-label="Tri des commentaires">
          {(
            [
              { key: "recents", label: "Récents" },
              { key: "populaires", label: "Populaires" },
            ] as Array<{ key: Sort; label: string }>
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={clsx("chip", sort === s.key && "chip-active")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {canComment ? (
        <div className="card space-y-2 p-4">
          {replyTo && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <CornerDownRight className="size-3.5" />
              En réponse à <strong className="text-fg">{replyTo}</strong>
              <button
                type="button"
                className="link-muted"
                onClick={() => {
                  setParentId(null);
                  setReplyTo(null);
                }}
              >
                annuler
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="input min-h-24 resize-y"
            placeholder="Votre commentaire…"
            maxLength={MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Votre commentaire"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSpoiler((v) => !v)}
              aria-pressed={spoiler}
              className={clsx("chip", spoiler && "chip-active")}
            >
              {spoiler ? "Spoiler activé" : "Marquer comme spoiler"}
            </button>
            <div className="flex items-center gap-3">
              <span className={clsx("text-xs", text.length > MAX_LENGTH ? "text-adult" : "text-muted")}>
                {text.length}/{MAX_LENGTH}
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={sending || text.trim().length === 0}
                onClick={submit}
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Publier
              </button>
            </div>
          </div>
          {formError && <p className="text-xs text-adult">{formError}</p>}
        </div>
      ) : adultOnly ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Validez le gate +18 pour lire et écrire les commentaires de ce contenu.
        </p>
      ) : (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          <a href="/connexion" className="font-semibold text-primary underline">
            Connectez-vous
          </a>{" "}
          pour commenter.
        </p>
      )}

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-20 animate-pulse bg-surface2" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-adult">
          {error}
        </p>
      )}

      {!loading && !error && shown.length === 0 && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Aucun commentaire pour le moment. Soyez le premier à réagir !
        </p>
      )}

      {!loading &&
        !error &&
        shown.map((node) => (
          <div key={node.id} className="space-y-3">
            <CommentItem
              node={node}
              editing={editing}
              revealed={revealed}
              onLike={toggleLike}
              onReply={startReply}
              onEdit={(n) => {
                setEditing({ id: n.id, contenu: n.contenu });
                setFormError(null);
              }}
              onReveal={reveal}
              onReport={(n) => setReporting(n.id)}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditing(null)}
              onEditChange={(v) => setEditing((e) => (e ? { ...e, contenu: v } : e))}
              onDelete={remove}
              busy={sending}
              error={editing?.id === node.id ? formError : null}
            />
            {(node.children ?? []).map((child) => (
              <div key={child.id} className="ml-4 border-l border-line pl-4 sm:ml-8">
                <CommentItem
                  node={child}
                  editing={editing}
                  revealed={revealed}
                  onLike={toggleLike}
                  onReply={startReply}
                  onEdit={(n) => {
                    setEditing({ id: n.id, contenu: n.contenu });
                    setFormError(null);
                  }}
                  onReveal={reveal}
                  onReport={(n) => setReporting(n.id)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditing(null)}
                  onEditChange={(v) => setEditing((e) => (e ? { ...e, contenu: v } : e))}
                  onDelete={remove}
                  busy={sending}
                  error={editing?.id === child.id ? formError : null}
                />
              </div>
            ))}
          </div>
        ))}

      <ReportDialog
        open={reporting !== null}
        reasons={REPORT_REASONS}
        onClose={() => setReporting(null)}
        onSubmit={async (raison, details) => {
          const node = [...roots, ...roots.flatMap((r) => r.children ?? [])].find(
            (n) => n.id === reporting,
          );
          if (node) await report(node, raison, details);
        }}
      />
    </section>
  );
}

function CommentItem({
  node,
  editing,
  revealed,
  onLike,
  onReply,
  onEdit,
  onReveal,
  onReport,
  onSaveEdit,
  onCancelEdit,
  onEditChange,
  onDelete,
  busy,
  error,
}: {
  node: CommentNode;
  editing: { id: string; contenu: string } | null;
  revealed: Set<string>;
  onLike: (n: CommentNode) => void;
  onReply: (n: CommentNode) => void;
  onEdit: (n: CommentNode) => void;
  onReveal: (id: string) => void;
  onReport: (n: CommentNode) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (v: string) => void;
  onDelete: (n: CommentNode) => void;
  busy: boolean;
  error?: string | null;
}) {
  const isEditing = editing?.id === node.id;
  const hidden = node.spoiler && !revealed.has(node.id);

  return (
    <article className="card p-4">
      <header className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-fg">{node.pseudo}</span>
        <time dateTime={node.created_at}>{relative(node.created_at)}</time>
        {node.spoiler && <span className="badge bg-warn/15 text-warn">Spoiler</span>}
        {node.canEdit && !isEditing && (
          <button type="button" className="link-muted ml-auto flex items-center gap-1" onClick={() => onEdit(node)}>
            <Pencil className="size-3.5" /> Modifier
          </button>
        )}
        {node.canDelete && (
          <button
            type="button"
            className="link-muted flex items-center gap-1 hover:text-adult"
            onClick={() => onDelete(node)}
          >
            <Trash2 className="size-3.5" /> Supprimer
          </button>
        )}
      </header>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            className="input min-h-20 resize-y"
            value={editing?.contenu ?? ""}
            maxLength={4000}
            onChange={(e) => onEditChange(e.target.value)}
            aria-label="Modifier le commentaire"
          />
          <div className="flex gap-2">
            <button type="button" className="btn-primary text-sm" disabled={busy} onClick={onSaveEdit}>
              Enregistrer
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={onCancelEdit}>
              Annuler
            </button>
          </div>
          {error && <p className="text-xs text-adult">{error}</p>}
        </div>
      ) : hidden ? (
        <button
          type="button"
          onClick={() => onReveal(node.id)}
          className="w-full rounded-xl border border-dashed border-warn/50 bg-warn/10 px-3 py-4 text-sm text-warn"
        >
          Commentaire marqué spoiler — cliquez pour afficher
        </button>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm text-fg">{node.contenu}</p>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <button
          type="button"
          onClick={() => onLike(node)}
          aria-pressed={Boolean(node.liked)}
          className={clsx("flex items-center gap-1 hover:text-fg", node.liked && "text-adult")}
        >
          <Heart className={clsx("size-3.5", node.liked && "fill-current")} />
          {node.likes}
        </button>
        <button type="button" className="flex items-center gap-1 hover:text-fg" onClick={() => onReply(node)}>
          <CornerDownRight className="size-3.5" /> Répondre
        </button>
        <button
          type="button"
          className="flex items-center gap-1 hover:text-fg"
          onClick={() => onReport(node)}
        >
          <Flag className="size-3.5" /> Signaler
        </button>
      </footer>
    </article>
  );
}

function ReportDialog({
  open,
  reasons,
  onClose,
  onSubmit,
}: {
  open: boolean;
  reasons: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSubmit: (raison: string, details: string) => Promise<void>;
}) {
  const [raison, setRaison] = useState(reasons[0]?.value ?? "autre");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(raison, details);
      setDetails("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signalement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Signaler ce commentaire">
      <div className="space-y-4 text-sm">
        <div className="space-y-2">
          {reasons.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-muted">
              <input
                type="radio"
                name="report-reason"
                value={r.value}
                checked={raison === r.value}
                onChange={() => setRaison(r.value)}
                className="accent-primary"
              />
              {r.label}
            </label>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="report-details">
            Précisions (facultatif)
          </label>
          <textarea
            id="report-details"
            className="input min-h-20 resize-y"
            maxLength={2000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-adult">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            <X className="size-4" /> Annuler
          </button>
          <button type="button" className="btn-danger" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}
            Envoyer le signalement
          </button>
        </div>
      </div>
    </Modal>
  );
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}
