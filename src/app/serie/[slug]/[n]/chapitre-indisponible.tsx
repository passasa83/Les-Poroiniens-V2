"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ReportDialog } from "@/components/reader/reader-report";
import { libelleUnite, libelleUniteSingulier } from "@/lib/format";
import type { Unite } from "@/lib/types";

/**
 * État « chapitre indisponible » : le chapitre existe mais aucune page
 * ne se charge (index de pages vide en base, fichier non publié…).
 * Message précis, bouton **Réessayer** (nouvelle lecture côté serveur) et
 * bouton **Signaler** (modale de signalement déjà utilisée par le lecteur).
 */
export function ChapitreIndisponible({
  chapterId,
  chapterNumero,
  serieTitre,
  unite,
}: {
  chapterId: string;
  chapterNumero: number;
  serieTitre: string;
  /** Organisation de la série : « Tome 3 » au lieu de « Chapitre 3 ». */
  unite?: Unite | null;
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
          {libelleUniteSingulier(unite)} indisponible
        </h2>
        <p className="max-w-md text-sm text-muted">
          <strong className="text-fg">
            Les pages de ce {libelleUniteSingulier(unite).toLowerCase()} ne se chargent pas.
          </strong>{" "}
          Le fichier de {serieTitre} — {libelleUnite(chapterNumero, unite).toLowerCase()} est
          peut-être en cours de publication ou momentanément inaccessible.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className="btn-primary" onClick={reessayer} disabled={enCours}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {enCours ? "Réessayer…" : "Réessayer"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setSignalerOuvert(true)}>
            Signaler ce {libelleUniteSingulier(unite).toLowerCase()}
          </button>
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {enCours
            ? `Rechargement du ${libelleUniteSingulier(unite).toLowerCase()} en cours…`
            : "Si le problème persiste, signalez-le : l'équipe sera prévenue de la lecture concernée."}
        </p>
      </section>

      <ReportDialog
        key={`indisponible-${chapterId}`}
        open={signalerOuvert}
        onClose={() => setSignalerOuvert(false)}
        chapterId={chapterId}
        chapterNumero={chapterNumero}
        unite={unite}
        page={null}
      />
    </div>
  );
}
