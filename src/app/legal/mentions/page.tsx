import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sommaire } from "../sommaire";

export const metadata: Metadata = {
  title: "Mentions légales",
  description:
    "Identité de l'éditeur, hébergeur, responsable de la publication et contacts du site Les Poroiniens.",
};

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

/** Sommaire ancré : chaque entrée pointe vers l'id de la section. */
const SOMMAIRE = [
  { id: "editeur", titre: "1. Éditeur du site" },
  { id: "hebergement", titre: "2. Hébergement" },
  { id: "propriete-intellectuelle", titre: "3. Propriété intellectuelle et contenus" },
  { id: "responsabilite", titre: "4. Responsabilité" },
  { id: "donnees-personnelles", titre: "5. Données personnelles" },
];

/** Champ non encore renseigné par le Gérant : visible dans le rendu. */
function Todo({ children }: { children: string }) {
  return (
    <span className="inline-block rounded border border-warn bg-surface px-1.5 py-0.5 font-mono text-xs text-warn">
      [à compléter : {children}]
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
      <dt className="text-sm font-semibold text-fg">{label}</dt>
      <dd className="text-sm text-muted">{children}</dd>
    </div>
  );
}

export default function MentionsLegalesPage() {
  return (
    <div className="container-site py-10">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Informations légales
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Mentions légales</h1>
        <p className="mt-3 text-sm text-muted">
          Informations relatives à l&apos;édition, à l&apos;hébergement et à la responsabilité du
          site « Les Poroiniens », conformément aux obligations d&apos;information applicables.
        </p>
        <p className="mt-2 text-xs text-muted">Dernière mise à jour : 4 octobre 2026.</p>
      </header>

      <Sommaire entrees={SOMMAIRE} />

      <div className="mt-8 max-w-3xl space-y-6">
        <section className="card p-6" id="editeur">
          <h2 className="section-title">1. Éditeur du site</h2>
          <dl className="mt-3 divide-y divide-line">
            <Row label="Dénomination">
              Site « Les Poroiniens » — plateforme de lecture de scans manga.
            </Row>
            <Row label="Éditeur">
              <Todo>nom / raison sociale de l&apos;éditeur</Todo>
            </Row>
            <Row label="Forme juridique et capital">
              <Todo>forme juridique, capital social</Todo>
            </Row>
            <Row label="Adresse du siège">
              <Todo>adresse postale complète</Todo>
            </Row>
            <Row label="Immatriculation">
              SIRET / RCS / numéro de TVA intracommunautaire le cas échéant{" "}
              <Todo>numéros</Todo>
            </Row>
            <Row label="Responsable de la publication">
              Le Gérant du site (compte « owner » du back-office) — <Todo>identité du responsable de la publication</Todo>
            </Row>
            <Row label="Contact">
              {contactEmail ? (
                <a className="link-muted underline" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
              ) : (
                <>
                  Via le{" "}
                  <a className="link-muted underline" href="/legal/dmca">
                    formulaire de signalement
                  </a>{" "}
                  et le bouton « Signaler un problème » du lecteur. Adresse e-mail directe :{" "}
                  <Todo>variable d&apos;environnement NEXT_PUBLIC_CONTACT_EMAIL</Todo>
                </>
              )}
            </Row>
          </dl>
        </section>

        <section className="card p-6" id="hebergement">
          <h2 className="section-title">2. Hébergement</h2>
          <dl className="mt-3 divide-y divide-line">
            <Row label="Hébergeur">
              Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.
              <br />
              <a
                className="link-muted underline"
                href="https://vercel.com/legal"
                target="_blank"
                rel="noreferrer noopener"
              >
                vercel.com/legal
              </a>{" "}
              (conditions d&apos;utilisation et informations légales de l&apos;hébergeur).
            </Row>
            <Row label="Données applicatives">
              Base de données hébergée sur l&apos;infrastructure du Gérant (serveur Appwrite
              auto-hébergé) ; fichiers de scans servis par un CDN devant le NAS.
            </Row>
            <Row label="Infrastructure complémentaire">
              <Todo>identité / coordonnées de l&apos;hébergeur du serveur applicatif et du NAS, le cas échéant</Todo>
            </Row>
          </dl>
        </section>

        <section className="card p-6" id="propriete-intellectuelle">
          <h2 className="section-title">3. Propriété intellectuelle et contenus</h2>
          <div className="mt-3 space-y-3 text-sm text-muted">
            <p>
              Les œuvres diffusées (manga, manhwa, manhua, illustrations, traductions) appartiennent
              à leurs auteurs et ayants droit respectifs. Le site n&apos;édite aucune œuvre et ne
              prétend à aucun droit sur celles-ci.
            </p>
            <p>
              La mise en page, les textes rédigés par l&apos;équipe et les éléments graphiques du
              site restent la propriété de leurs auteurs respectifs.
            </p>
            <p>
              Toute demande relative à un contenu (droit d&apos;auteur, erreur, retrait) suit la{" "}
              <a className="link-muted underline" href="/legal/dmca">
                procédure de signalement
              </a>
              .
            </p>
          </div>
        </section>

        <section className="card p-6" id="responsabilite">
          <h2 className="section-title">4. Responsabilité</h2>
          <div className="mt-3 space-y-3 text-sm text-muted">
            <p>
              Les informations publiées (synopses, dates, statuts, numéros de chapitres) sont
              fournies à titre indicatif et peuvent évoluer ou contenir des erreurs. Le site
              s&apos;efforce de maintenir un accès disponible, sans garantir une continuité
              absolue du service (maintenance, incidents techniques, indisponibilité de
              l&apos;hébergeur ou de la source de fichiers).
            </p>
            <p>
              Les liens vers des ressources extérieures sont fournis à titre pratique ; le site ne
              contrôle pas leur contenu ni leurs conditions d&apos;utilisation.
            </p>
            <p>
              L&apos;utilisateur reste responsable de l&apos;usage qu&apos;il fait du service et de
              la conformité de ses propres publications (commentaires, signalements).
            </p>
          </div>
        </section>

        <section className="card p-6" id="donnees-personnelles">
          <h2 className="section-title">5. Données personnelles</h2>
          <p className="mt-3 text-sm text-muted">
            Le détail des données collectées, des durées de conservation et de l&apos;exercice de
            vos droits figure dans la{" "}
            <a className="link-muted underline" href="/legal/confidentialite">
              politique de confidentialité
            </a>
            .
          </p>
        </section>
      </div>

      <aside className="mt-8 max-w-3xl rounded-2xl border border-line bg-surface2 p-4">
        <p className="text-sm font-semibold text-fg">À titre d&apos;information</p>
        <p className="mt-1 text-xs text-muted">
          Cette page est rédigée par l&apos;équipe du site à titre informatif : elle ne constitue
          ni un conseil juridique, ni une consultation juridique, ni une garantie de conformité.
          Seul un professionnel qualifié peut vous indiquer ce qui s&apos;applique à votre
          situation.
        </p>
      </aside>
    </div>
  );
}
