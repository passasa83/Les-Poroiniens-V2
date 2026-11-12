"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { ROLE_LABELS } from "@/lib/roles";
import type { CurrentUser, Profile } from "@/lib/types";
import { apiJson } from "../_lib/api";
import { dateInscription } from "../_lib/dates";
import { Notice, useNotice } from "./notice";

/** Informations du compte, export RGPD et suppression définitive. */
export function CompteSection({ user, profile }: { user: CurrentUser; profile: Profile }) {
  const router = useRouter();
  const { notice, fail } = useNotice();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    setDeleting(true);
    const result = await apiJson<{ ok: boolean }>("/api/account", { method: "DELETE" });
    if (!result.ok) {
      setDeleting(false);
      setConfirmOpen(false);
      return fail(result.error);
    }
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <Notice notice={notice} />
      <section className="card space-y-5 p-6" aria-label="Compte">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="label">Adresse e-mail</dt>
            <dd className="text-fg">{user.email}</dd>
          </div>
          <div>
            <dt className="label">Rôle</dt>
            <dd>
              <Badge tone={user.role === "membre" ? "neutral" : "primary"}>
                {ROLE_LABELS[user.role]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="label">Date d&apos;inscription</dt>
            <dd className="text-fg">{dateInscription(profile.date_inscription)}</dd>
          </div>
          <div>
            <dt className="label">Identifiant</dt>
            <dd className="truncate font-mono text-xs text-muted">{user.id}</dd>
          </div>
        </dl>

        <div className="divider" />

        <div className="space-y-3">
          <p className="section-title">Données personnelles (RGPD)</p>
          <p className="text-sm text-muted">
            Vous pouvez exporter l&apos;intégralité de vos données ou supprimer définitivement votre
            compte.
          </p>
          <div className="flex flex-wrap gap-2">
            <a className="btn-secondary" href="/api/account/export" download>
              <Download className="size-4" />
              Exporter mes données (JSON)
            </a>
            <button type="button" className="btn-danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="size-4" />
              Supprimer mon compte
            </button>
          </div>
        </div>
      </section>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Supprimer mon compte">
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            Cette action est <strong className="text-adult">définitive</strong> : profil,
            bibliothèque, historique et statistiques seront effacés, vos commentaires seront
            anonymisés et votre session sera détruite.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => void deleteAccount()}
              disabled={deleting}
            >
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
