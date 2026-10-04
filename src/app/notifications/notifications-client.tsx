"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

export function NotificationsActions({ unread }: { unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/read", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Impossible de mettre à jour vos notifications.");
        return;
      }
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary text-sm"
        onClick={() => void markAll()}
        disabled={busy || unread === 0}
      >
        <CheckCheck className="size-4" />
        {busy ? "Mise à jour…" : "Tout marquer comme lu"}
      </button>
      {error && <p className="text-xs text-adult">{error}</p>}
    </div>
  );
}
