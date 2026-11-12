"use client";

import clsx from "clsx";
import { CornerDownRight, Loader2, Send } from "lucide-react";
import { CommentItem } from "./comment-item";
import { ReportDialog } from "./report-dialog";
import { MAX_LENGTH, REPORT_REASONS, type Sort } from "./types";
import { useComments } from "./use-comments";

export type { CommentNode } from "./types";

/**
 * Commentaires d’une série ou d’un chapitre : arbre 2 niveaux,
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
  const {
    total,
    sort,
    setSort,
    loading,
    error,
    text,
    setText,
    spoiler,
    setSpoiler,
    setParentId,
    replyTo,
    setReplyTo,
    sending,
    formError,
    setFormError,
    editing,
    setEditing,
    revealed,
    reporting,
    roots,
    setReporting,
    textareaRef,
    shown,
    reveal,
    submit,
    toggleLike,
    saveEdit,
    remove,
    report,
    startReply,
  } = useComments({ targetType, targetId });

  return (
    <section id="commentaires" className="scroll-mt-24 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">
          Commentaires <span className="text-sm font-normal text-muted">({total})</span>
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
              <span
                className={clsx("text-xs", text.length > MAX_LENGTH ? "text-adult" : "text-muted")}
              >
                {text.length}/{MAX_LENGTH}
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={sending || text.trim().length === 0}
                onClick={submit}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
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
