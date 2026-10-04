import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Données collectées, cookies, durées de conservation et exercice de vos droits sur le site Les Poroiniens.",
};

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

const DATA_ROWS: Array<[string, string, string]> = [
  [
    "Compte",
    "Adresse e-mail, pseudo, avatar, bio, rôle, date d'inscription, préférences (thème, mode et sens de lecture, langue, contenu +18, tags masqués, notifications).",
    "Jusqu'à la suppression du compte",
  ],
  [
    "Bibliothèque",
    "Statuts de lecture (à lire, en cours, terminé…), favoris, notes, dernier chapitre et page atteints.",
    "Jusqu'à la suppression du compte",
  ],
  [
    "Historique de lecture",
    "Chapitres consultés, page atteinte, date de lecture, progression enregistrée.",
    "Jusqu'à la suppression du compte",
  ],
  [
    "Commentaires et réactions",
    "Contenu publié, pseudo affiché, likes / dislikes, statut de modération, date.",
    "Jusqu'à leur suppression par leur auteur ou par la modération",
  ],
  [
    "Signalements",
    "Description du contenu signalé, coordonnées laissées par l'émetteur, statut de traitement.",
    "Pendant l'instruction, puis archivage limité pour la traçabilité",
  ],
  [
    "Journal d'audit",
    "Actions sensibles effectuées par l'équipe (modification, publication, retrait), auteur, date, adresses IP.",
    "Conservé pour la sécurité du service ; accès réservé au Gérant",
  ],
  [
    "Données techniques",
    "Adresses IP traitées de façon transitoire pour la limitation de débit et la sécurité ; IP anonymisées (tronquées) pour les statistiques agrégées.",
    "Durée limitée, fixée par l'hébergeur",
  ],
];

const RIGHTS: Array<[string, string]> = [
  ["Accès", "Consulter l'ensemble des données associées à votre compte."],
  ["Rectification", "Corriger votre pseudo, votre bio, votre avatar et vos préférences."],
  ["Export", "Récupérer une copie de vos données (bibliothèque, historique, profil)."],
  ["Suppression", "Supprimer votre compte et les données personnelles associées."],
  ["Opposition / limitation", "Réduire les données traitées ou vous opposer à un usage donné."],
];

export default function ConfidentialitePage() {
  return (
    <div className="container-site py-10">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Vie privée
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
          Politique de confidentialité
        </h1>
        <p className="mt-3 text-sm text-muted">
          Cette page décrit quelles données sont traitées lors de l&apos;utilisation du site « Les
          Poroiniens », pourquoi, pendant combien de temps, et comment exercer vos droits.
        </p>
        <p className="mt-2 text-xs text-muted">Dernière mise à jour : 4 octobre 2026.</p>
      </header>

      <div className="mt-8 max-w-3xl space-y-6">
        <section className="card p-6">
          <h2 className="section-title">1. Responsable du traitement</h2>
          <p className="mt-3 text-sm text-muted">
            Le responsable du traitement est l&apos;éditeur du site, dont l&apos;identité figure
            dans les{" "}
            <a className="link-muted underline" href="/legal/mentions">
              mentions légales
            </a>
            . Pour toute question relative à vos données :
            {contactEmail ? (
              <>
                {" "}
                <a className="link-muted underline" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
                .
              </>
            ) : (
              <>
                {" "}
                utilisez le{" "}
                <a className="link-muted underline" href="/legal/dmca">
                  formulaire de contact
                </a>{" "}
                ou les paramètres de votre compte.
              </>
            )}
          </p>
        </section>

        <section className="card p-6">
          <h2 className="section-title">2. Cookies et stockage local</h2>
          <div className="mt-3 space-y-3 text-sm text-muted">
            <p>
              Le site utilise <strong className="text-fg">uniquement des cookies fonctionnels</strong>{" "}
              strictement nécessaires à son fonctionnement :
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <code className="text-fg">lp_session</code> — cookie de session (30 jours, exclusif
                à votre compte) : maintient votre connexion.{" "}
                <code className="text-fg">HttpOnly</code>.
              </li>
              <li>
                <code className="text-fg">adult_ok</code> — mémorise votre validation de la porte
                +18 (30 jours par défaut).
              </li>
              <li>
                Stockage local du navigateur : thème (clair / sombre), choix de la bannière cookies,
                préférences de lecture.
              </li>
            </ul>
            <p>
              <strong className="text-fg">Aucun traceur publicitaire</strong>, aucun réseau
              publicitaire, aucune régie, aucun outil de mesure d&apos;audience tiers, aucune
              revente ou partage de données à des fins commerciales. Une bannière vous informe du
              fonctionnement de ces cookies à votre première visite.
            </p>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="section-title">3. Données collectées et durées de conservation</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-semibold">Donnée</th>
                  <th className="py-2 pr-4 font-semibold">Détail</th>
                  <th className="py-2 font-semibold">Conservation</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {DATA_ROWS.map(([nom, detail, duree]) => (
                  <tr key={nom} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4 font-medium text-fg">{nom}</td>
                    <td className="py-3 pr-4 text-muted">{detail}</td>
                    <td className="py-3 text-muted">{duree}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Les durées indiquées sont celles appliquées par le site. Les journaux techniques de
            l&apos;hébergeur suivent leurs propres durées, communiquées par le prestataire.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="section-title">4. Finalités et bases de traitement</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
            <li>
              <strong className="text-fg">Fourniture du service</strong> : comptes, bibliothèque,
              historique de lecture, commentaires, notifications internes.
            </li>
            <li>
              <strong className="text-fg">Sécurité</strong> : limitation de débit, prévention des
              abus, journalisation des actions sensibles.
            </li>
            <li>
              <strong className="text-fg">Modération</strong> : traitement des commentaires et des
              signalements.
            </li>
            <li>
              <strong className="text-fg">Statistiques</strong> : mesures agrégées (pages vues,
              popularité des séries) à partir de données anonymisées.
            </li>
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="section-title">5. Destinataires</h2>
          <div className="mt-3 space-y-3 text-sm text-muted">
            <p>
              Les données sont accessibles au personnel habilité du site (modérateurs,
              administrateurs, Gérant) selon leur rôle, ainsi qu&apos;aux prestataires techniques
              strictement nécessaires : hébergeur du site, serveur de base de données, CDN de
              fichiers. Chaque intervenant ne reçoit que l&apos;accès utile à sa fonction.
            </p>
            <p>
              Aucune donnée n&apos;est vendue, louée ni cédée à des tiers à des fins
              publicitaires. En cas d&apos;obligation légale, des données peuvent être communiquées
              aux autorités compétentes.
            </p>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="section-title">6. Vos droits</h2>
          <div className="mt-3 space-y-3 text-sm text-muted">
            <p>Vous disposez des droits suivants : </p>
            <dl className="divide-y divide-line">
              {RIGHTS.map(([titre, texte]) => (
                <div key={titre} className="py-3">
                  <dt className="text-sm font-semibold text-fg">{titre}</dt>
                  <dd className="mt-0.5 text-sm text-muted">{texte}</dd>
                </div>
              ))}
            </dl>
            <p>
              L&apos;accès, l&apos;export et la suppression se font en libre-service depuis votre{" "}
              <a className="link-muted underline" href="/compte">
                espace compte
              </a>{" "}
              (paramètres du compte). Pour une demande qui ne peut pas être faite depuis le site,
              utilisez le contact indiqué en section 1 : les demandes sont traitées manuellement
              par l&apos;équipe, sans réponse automatique.
            </p>
            <p>
              Si vos données sont insuffisantes ou erronées, vous pouvez demander leur rectification
              ou leur effacement ; la suppression d&apos;un compte est irréversible et entraîne la
              perte de la bibliothèque et de l&apos;historique associés.
            </p>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="section-title">7. Sécurité et sous-traitance</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">
            <li>Connexion chiffrée (HTTPS) sur l&apos;ensemble du site.</li>
            <li>
              Cookies de session exclusifs à votre compte, non lisibles par le script
              de la page.
            </li>
            <li>Limitation de débit sur les formulaires et les connexions.</li>
            <li>Vérification des droits côté serveur à chaque requête.</li>
            <li>
              Aucun fournisseur d&apos;envoi d&apos;e-mails n&apos;est actuellement utilisé : le
              site n&apos;envoie aucun message automatique par courrier électronique.
            </li>
            <li>
              Images de scans servies par un CDN dédié, sans transmission de vos identifiants à
              cette source.
            </li>
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="section-title">8. Évolution de cette politique</h2>
          <p className="mt-3 text-sm text-muted">
            Cette politique peut évoluer pour refléter des changements du site ou de la réglementation.
            La date de mise à jour figure en tête de page. En cas de modification importante, une
            information sera affichée sur le site.
          </p>
        </section>
      </div>

      <aside className="mt-8 max-w-3xl rounded-2xl border border-line bg-surface2 p-4">
        <p className="text-sm font-semibold text-fg">À titre d&apos;information</p>
        <p className="mt-1 text-xs text-muted">
          Ce document est rédigé par l&apos;équipe du site à titre informatif : il ne constitue ni
          un conseil juridique, ni une consultation juridique, ni une garantie de conformité. Seul
          un professionnel qualifié peut vous indiquer ce qui s&apos;applique à votre situation.
        </p>
      </aside>
    </div>
  );
}
