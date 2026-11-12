"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_LENGTH, type CommentNode, type Sort } from "./types";

/**
 * État et actions du fil de commentaires : chargement, tri, envoi, likes,
 * édition, suppression et signalement.
 */
export function useComments({
  targetType,
  targetId,
}: {
  targetType: "series" | "chapter";
  targetId: string;
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

  return {
    roots,
    setRoots,
    total,
    setTotal,
    sort,
    setSort,
    loading,
    setLoading,
    error,
    setError,
    text,
    setText,
    spoiler,
    setSpoiler,
    parentId,
    setParentId,
    replyTo,
    setReplyTo,
    sending,
    setSending,
    formError,
    setFormError,
    editing,
    setEditing,
    revealed,
    setRevealed,
    reporting,
    setReporting,
    textareaRef,
    load,
    shown,
    reveal,
    submit,
    toggleLike,
    patchNode,
    saveEdit,
    remove,
    report,
    startReply,
  };
}
