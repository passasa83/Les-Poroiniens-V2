import type { Metadata } from "next";
import { Sommaire } from "../sommaire";
import { NoticeForm } from "./notice-form";

export const metadata: Metadata = {
  title: "Signalement de contenu (DMCA)",
  description:
    "Procédure de signalement et de retrait de contenu (notice & takedown) du site Les Poroiniens.",
};

/** Sommaire ancré (§6.13) : chaque entrée pointe vers l'id de la section. */
const SOMMAIRE = [
  { id: "contenu", titre: "Ce que doit contenir un signalement" },
  { id: "formulaire", titre: "Formulaire de signalement" },
  { id: "traitement", titre: "Traitement et délais" },
  { id: "bon-a-savoir", titre: "Bon à savoir" },
];

const STEPS: Array<[string, string]> = [
  [
    "Décrivez le contenu concerné",
    "Indiquez la série (et le chapitre ou la page s'il y a lieu) afin que l'équipe puisse localiser rapidement le contenu visé.",
  ],
  [
    "Situez-le précisément",
    "Donnez l'adresse de la page ou décrivez son emplacement dans le site (rubrique, chapitre, position).",
  ],
  [
    "Justifiez vos droits",
    "Précisez la qualité dont vous vous prévaluez (auteur, éditeur, représentant légal, ayants droit) et le fondement de votre demande.",
  ],
  [
    "Laissez un contact",
    "Fournissez une adresse e-mail valide pour un éventuel complément d'information ou un accusé de réception.",
  ],
];

export default function DmcaPage() {
  return (
    <div className="container-site py-10">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Conformité
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
          Signalement de contenu
        </h1>
        <p className="mt-3 text-sm text-muted">
          Vous estimez qu&apos;un contenu diffusé sur ce site porte atteinte à vos droits ou
          qu&apos;il a été publié par erreur ? Vous pouvez adresser un signalement (procédure de
          retrait, dite « notice & takedown »). Les signalements sont examinés par l&apos;équipe
          et le contenu concerné peut être retiré ou mis hors ligne en attendant l&apos;examen.
        </p>
        <p className="mt-2 text-xs text-muted">Dernière mise à jour : 4 octobre 2026.</p>
      </header>

      <Sommaire entrees={SOMMAIRE} />

      <div className="mt-8 grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          <section className="card p-6" id="contenu">
            <h2 className="section-title">Ce que doit contenir un signalement</h2>
            <ol className="mt-4 space-y-4">
              {STEPS.map(([titre, texte], index) => (
                <li key={titre} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-fg">{titre}</p>
                    <p className="mt-0.5 text-sm text-muted">{texte}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-6" id="formulaire">
            <h2 className="section-title">Formulaire de signalement</h2>
            <p className="mb-4 mt-2 text-sm text-muted">
              Les champs marqués comme facultatifs peuvent être laissés vides. Trois envois maximum
              par heure et par adresse IP.
            </p>
            <NoticeForm />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-6" id="traitement">
            <h2 className="section-title">Traitement</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
              <li>
                Délai visé : accusé de réception sous <strong className="text-fg">48 heures
                ouvrées</strong>, examen du signalement sous <strong className="text-fg">7 jours
                ouvrés</strong>.
              </li>
              <li>Ces délais sont indicatifs et ne constituent pas un engagement contractuel.</li>
              <li>
                Un signalement incomplet ou ne permettant pas de localiser le contenu peut allonger
                le traitement.
              </li>
              <li>
                L&apos;équipe peut vous recontacter à l&apos;adresse indiquée si un complément
                d&apos;information est nécessaire.
              </li>
              <li>
                L&apos;issue du traitement (retrait, maintien, classement) vous est communiquée
                dans la mesure du possible.
              </li>
            </ul>
          </section>

          <section className="card p-6" id="bon-a-savoir">
            <h2 className="section-title">Bon à savoir</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
              <li>
                Un signalement manifestement abusif ou sciemment inexact peut être écarté sans
                traitement.
              </li>
              <li>
                Les commentaires peuvent également être signalés directement depuis le site, via le
                bouton « Signaler » présent sur chaque commentaire.
              </li>
              <li>
                Les pages manquantes ou les problèmes de scan relèvent du bouton « Signaler un
                problème » du lecteur, plus rapide qu&apos;un signalement de droits.
              </li>
              <li>
                Les demandes relatives à vos données personnelles suivent la{" "}
                <a className="link-muted underline" href="/legal/confidentialite">
                  politique de confidentialité
                </a>
                .
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <aside className="mt-8 max-w-3xl rounded-2xl border border-line bg-surface2 p-4">
        <p className="text-sm font-semibold text-fg">À titre d&apos;information</p>
        <p className="mt-1 text-xs text-muted">
          Cette procédure est décrite par l&apos;équipe du site à titre informatif : elle ne
          constitue ni un conseil juridique, ni une consultation juridique, ni une reconnaissance
          de responsabilité. Seul un professionnel qualifié peut vous indiquer les démarches qui
          s&apos;appliquent à votre situation.
        </p>
      </aside>
    </div>
  );
}
