"use client";

import { useEffect, useRef } from "react";
import type { ReaderPage } from "../types";

/** Préchargement des prochaines pages (mode page / double / webtoon). */
export function Prefetch({
  pages,
  from,
  count = 3,
}: {
  pages: ReaderPage[];
  from: number;
  count?: number;
}) {
  const next = pages.slice(from, from + count);
  if (next.length === 0) return null;
  return (
    <div className="hidden" aria-hidden>
      {next.map((item) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={item.index} src={item.url} alt="" loading="eager" />
      ))}
    </div>
  );
}

/** Préchargement de la première page du chapitre suivant en fin de lecture. */
export function NextChapterPrefetch({
  chapterId,
  active,
}: {
  chapterId: string | null;
  active: boolean;
}) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active || !chapterId || doneRef.current) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}/pages`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        doneRef.current = true;
        const data = (await res.json()) as { pages?: { url?: string }[] };
        const url = data.pages?.[0]?.url;
        if (url) new Image().src = url;
      } catch {
        /* préchargement best effort */
      }
    })();
    return () => controller.abort();
  }, [active, chapterId]);

  return null;
}
