"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Like du chapitre sur l’écran de fin : lecture du statut via
 * `GET /api/chapters/[id]/like`, bascule optimiste via POST / DELETE
 * (même motif que les likes de commentaires).
 */
export function ChapterLike({
  chapterId,
  initialLikes,
}: {
  chapterId: string;
  initialLikes: number;
}) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}/like`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { liked?: boolean; likes?: number };
        setLiked(Boolean(data.liked));
        if (typeof data.likes === "number") setLikes(data.likes);
      } catch {
        /* lecture facultative : on garde l’état initial */
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chapterId]);

  async function toggle() {
    const before = { liked, likes };
    setMessage(null);
    // État optimiste : la réponse serveur confirme ou on revient en arrière.
    setLiked(!before.liked);
    setLikes(Math.max(0, before.likes + (before.liked ? -1 : 1)));
    try {
      const res = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}/like`, {
        method: before.liked ? "DELETE" : "POST",
      });
      if (res.status === 401) {
        setLiked(before.liked);
        setLikes(before.likes);
        setMessage("Connectez-vous pour aimer ce chapitre.");
        return;
      }
      if (res.status === 403) {
        setLiked(before.liked);
        setLikes(before.likes);
        setMessage("Ce chapitre est réservé aux adultes.");
        return;
      }
      if (!res.ok) {
        setLiked(before.liked);
        setLikes(before.likes);
        setMessage("Le like n’a pas pu être enregistré.");
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        liked?: boolean;
        likes?: number;
      } | null;
      if (data) {
        setLiked(Boolean(data.liked));
        if (typeof data.likes === "number") setLikes(data.likes);
      }
    } catch {
      /* erreur réseau : l’état optimiste reste affiché */
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        className="btn-secondary"
        aria-pressed={liked}
        aria-label={liked ? "Retirer mon like du chapitre" : "Aimer ce chapitre"}
        onClick={() => void toggle()}
      >
        <Heart className={liked ? "size-4 fill-current text-adult" : "size-4"} />
        {likes} {likes > 1 ? "likes" : "like"}
      </button>
      {message && <span className="text-xs text-muted">{message}</span>}
    </span>
  );
}
