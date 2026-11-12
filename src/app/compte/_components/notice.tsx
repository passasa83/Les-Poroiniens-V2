"use client";

import { useState } from "react";

export type NoticeState = { tone: "ok" | "error"; text: string } | null;

/** Message d'état d'une section (succès / erreur), annoncé aux lecteurs d'écran. */
export function useNotice() {
  const [notice, setNotice] = useState<NoticeState>(null);
  return {
    notice,
    ok: (text: string) => setNotice({ tone: "ok", text }),
    fail: (text: string) => setNotice({ tone: "error", text }),
    clear: () => setNotice(null),
  };
}

export function Notice({ notice }: { notice: NoticeState }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={`rounded-xl border px-3 py-2 text-sm ${
        notice.tone === "ok"
          ? "border-ok/40 bg-ok/10 text-ok"
          : "border-adult/40 bg-adult/10 text-adult"
      }`}
    >
      {notice.text}
    </p>
  );
}
