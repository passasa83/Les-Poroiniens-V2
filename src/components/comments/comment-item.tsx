"use client";

import clsx from "clsx";
import { CornerDownRight, Flag, Heart, Pencil, Trash2 } from "lucide-react";
import { relative, type CommentNode } from "./types";

export function CommentItem({
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
          <button
            type="button"
            className="link-muted ml-auto flex items-center gap-1"
            onClick={() => onEdit(node)}
          >
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
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={busy}
              onClick={onSaveEdit}
            >
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
        <button
          type="button"
          className="flex items-center gap-1 hover:text-fg"
          onClick={() => onReply(node)}
        >
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
