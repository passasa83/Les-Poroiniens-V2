"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MonitorSmartphone } from "lucide-react";
import { Badge } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import type { SessionInfo } from "@/lib/types";
import { apiJson } from "../_lib/api";
import { horodatage } from "../_lib/dates";
import { Notice, useNotice } from "./notice";

export function SessionsSection({ sessions }: { sessions: SessionInfo[] }) {
  const router = useRouter();
  const { notice, ok, fail } = useNotice();
  const [confirmSessions, setConfirmSessions] = useState(false);
  const [revoking, setRevoking] = useState(false);

  /** Révoque une session : si c'est la nôtre, la page bascule sur /connexion. */
  async function revokeOne(session: SessionInfo) {
    const result = await apiJson<{ ok: boolean; courante?: boolean }>(
      `/api/account/sessions/${encodeURIComponent(session.id)}`,
      { method: "DELETE" },
    );
    if (!result.ok) return fail(result.error);
    if (result.data.courante) {
      router.push("/connexion");
      router.refresh();
      return;
    }
    ok("Session révoquée : cet appareil est déconnecté.");
    router.refresh();
  }

  /** Révoque toutes les sessions, la nôtre comprise → déconnexion complète. */
  async function revokeEverywhere() {
    setConfirmSessions(false);
    setRevoking(true);
    const result = await apiJson<{ ok: boolean }>("/api/account/sessions", {
      method: "DELETE",
    });
    setRevoking(false);
    if (!result.ok) return fail(result.error);
    router.push("/connexion");
    router.refresh();
  }

  return (
    <>
      <Notice notice={notice} />
      <section className="card space-y-5 p-6" aria-label="Sessions">
        <div className="space-y-1">
          <p className="section-title">Sessions de connexion</p>
          <p className="text-sm text-muted">
            Les appareils actuellement connectés à votre compte. Révoquer une session déconnecte
            immédiatement l’appareil concerné.
          </p>
        </div>

        {sessions.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-muted">
            Aucune session active détectée pour ce compte.
          </p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => {
              const depuis = horodatage(session.creeeLe);
              const expiration = horodatage(session.expireLe);
              return (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                      <MonitorSmartphone className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="truncate">{session.appareil}</span>
                      {session.courante && <Badge tone="ok">Session actuelle</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {session.fournisseur}
                      {session.ip ? ` · ${session.ip}` : ""}
                      {session.pays ? ` · ${session.pays}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {depuis ? `Connecté depuis le ${depuis}` : "Date de connexion inconnue"}
                      {expiration ? ` · expire le ${expiration}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={() => void revokeOne(session)}
                  >
                    {session.courante ? "Se déconnecter ici" : "Révoquer"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="divider" />

        <div className="space-y-2">
          <button
            type="button"
            className="btn-danger"
            onClick={() => setConfirmSessions(true)}
            disabled={revoking}
          >
            Révoquer toutes les sessions
          </button>
          <p className="text-xs text-muted">
            Vous serez déconnecté de tous les appareils, y compris de celui-ci.
          </p>
        </div>

        <Modal
          open={confirmSessions}
          onClose={() => setConfirmSessions(false)}
          title="Révoquer toutes les sessions"
        >
          <div className="space-y-4 text-sm">
            <p className="text-muted">
              Toutes les sessions seront détruites : vous devrez vous reconnecter sur chacun de vos
              appareils, y compris celui-ci.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmSessions(false)}
                disabled={revoking}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => void revokeEverywhere()}
                disabled={revoking}
              >
                {revoking ? "Révocation…" : "Tout révoquer et se déconnecter"}
              </button>
            </div>
          </div>
        </Modal>
      </section>
    </>
  );
}
