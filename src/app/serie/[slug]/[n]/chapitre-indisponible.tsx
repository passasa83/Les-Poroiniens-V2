"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ReportDialog } from "@/components/reader/reader-report";

/**
 * État « chapitre indisponible » (§6.12) : le chapitre existe mais aucune page
 * ne se charge (index de pages vide en base, fichier non publié…).
 * Message précis, bouton **Réessayer** (nouvelle lecture côté serveur) et
 * bouton **Signaler** (modale de signalement déjà utilisée par le lecteur).
 */
export function ChapitreIndisponible({
  chapterId,
  chapterNumero,
  serieTitre,
}: {
  chapterId: string;
  chapterNumero: number;
  serieTitre: string;
}) {
  const [signalerOuvert, setSignalerOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  function reessayer() {
    if (enCours) return;
    setEnCours(true);
    // Rechargement complet : la page re-dessine le lecteur avec `loading.tsx`.
    window.location.reload();
  }

  return (
    <div className="container-site">
      <section
        className="card flex flex-col items-center gap-4 p-8 text-center"
        role="alert"
        aria-labelledby="chapitre-indisponible-titre"
      >
        <TriangleAlert className="size-8 text-warn" aria-hidden="true" />
        <h2 className="section-title" id="chapitre-indisponible-titre">
          Chapitre indisponible
        </h2>
        <p className="max-w-md text-sm text-muted">
          <strong className="text-fg">Les pages de ce chapitre ne se chargent pas.</strong>{" "}
          Le fichier de {serieTitre} — chapitre {chapterNumero} est peut-être en cours de
          publication ou momentanément inaccessible.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className="btn-primary" onClick={reessayer} disabled={enCours}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {enCours ? "Réessayer…" : "Réessayer"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setSignalerOuvert(true)}>
            Signaler ce chapitre
          </button>
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {enCours
            ? "Rechargement du chapitre en cours…"
            : "Si le problème persiste, signalez-le : l'équipe sera prévenue du chapitre concerné."}
        </p>
      </section>

      <ReportDialog
        key={`indisponible-${chapterId}`}
        open={signalerOuvert}
        onClose={() => setSignalerOuvert(false)}
        chapterId={chapterId}
        chapterNumero={chapterNumero}
        page={null}
      />
    </div>
  );
}
