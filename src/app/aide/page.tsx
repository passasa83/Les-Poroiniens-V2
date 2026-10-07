import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Keyboard, LayoutTemplate, LifeBuoy, Mail, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Aide et FAQ",
  description:
    "Comment suivre une série, changer le mode de lecture, utiliser les raccourcis du lecteur et signaler un problème.",
};

const SHORTCUTS: Array<[string, string]> = [
  ["← / →", "Page précédente / page suivante (le sens suit votre réglage de lecture)."],
  ["Espace", "Passer à la page suivante ; dans le mode vertical, faire défiler d'un cran."],
  ["Entrée", "Basculer en plein écran quand la touche est proposée par le lecteur."],
  ["F", "Activer ou quitter le plein écran."],
  ["Échap", "Quitter le plein écran ou fermer un panneau ouvert."],
  ["Molette / barre d'espace", "Défilement dans le mode vertical continu."],
];

const FAQ: Array<{ icon: ReactNode; titre: string; contenu: ReactNode }> = [
  {
    icon: <BookOpen className="size-5" aria-hidden />,
    titre: "Suivre une série",
    contenu: (
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Ouvrez la fiche de la série depuis le{" "}
          <Link className="link-muted underline" href="/catalogue">
            catalogue
          </Link>{" "}
          ou la{" "}
          <Link className="link-muted underline" href="/recherche">
            recherche
          </Link>
          .
        </li>
        <li>
          Créez un compte ou connectez-vous : le suivi est réservé aux membres.
        </li>
        <li>
          Cliquez sur « Suivre » / « Ajouter à la bibliothèque », puis choisissez un statut (À
          lire, En cours, Terminé, En pause, Abandonné) et, si vous le souhaitez, un favori.
        </li>
        <li>
          Retrouvez vos séries dans{" "}
          <Link className="link-muted underline" href="/bibliotheque">
            ma bibliothèque
          </Link>{" "}
          et les nouvelles publications dans vos{" "}
          <Link className="link-muted underline" href="/notifications">
            notifications
          </Link>
          .
        </li>
        <li>
          Votre progression est enregistrée automatiquement : la fiche série et le lecteur
          proposent de reprendre là où vous vous êtes arrêté.
        </li>
      </ol>
    ),
  },
  {
    icon: <LayoutTemplate className="size-5" aria-hidden />,
    titre: "Changer le mode de lecture",
    contenu: (
      <>
        <p>Trois modes sont disponibles dans le lecteur :</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-fg">Vertical continu</strong> (style webtoon) : défilement de
            haut en bas.
          </li>
          <li>
            <strong className="text-fg">Page par page</strong> : une page à la fois, avec
            préchargement des pages suivantes.
          </li>
          <li>
            <strong className="text-fg">Double page</strong> : deux pages côte à côte, utile en
            grand écran.
          </li>
        </ul>
        <p className="mt-2">
          Le mode et le sens de lecture (gauche → droite ou droite → gauche) se changent depuis la
          barre d&apos;outils du lecteur. Vous pouvez aussi définir vos valeurs par défaut dans vos{" "}
          <Link className="link-muted underline" href="/compte">
            préférences de compte
          </Link>
          : le choix est mémorisé pour vos prochaines lectures.
        </p>
      </>
    ),
  },
  {
    icon: <Keyboard className="size-5" aria-hidden />,
    titre: "Raccourcis clavier du lecteur",
    contenu: (
      <>
        <dl className="divide-y divide-line">
          {SHORTCUTS.map(([touche, action]) => (
            <div key={touche} className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="font-mono text-xs font-semibold text-fg">{touche}</dt>
              <dd className="text-sm text-muted">{action}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">
          Les raccourcis exacts peuvent varier selon le mode actif et les réglages ; le lecteur
          reste utilisable à la souris, au doigt (swipe) et avec la barre de progression.
        </p>
      </>
    ),
  },
  {
    icon: <TriangleAlert className="size-5" aria-hidden />,
    titre: "Une page manquante ou un scan incorrect",
    contenu: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong className="text-fg">Page 404 :</strong> vérifiez l&apos;adresse (les URLs sont du
          type <code className="text-fg">/serie/…/chapitre-n</code>) ou revenez au{" "}
          <Link className="link-muted underline" href="/catalogue">
            catalogue
          </Link>
          .
        </li>
        <li>
          <strong className="text-fg">Contenu introuvable ou non publié :</strong> il n&apos;est
          peut-être pas encore disponible ; revenez plus tard ou vérifiez la liste publiée sur la
          fiche série.
        </li>
        <li>
          <strong className="text-fg">Page manquante, mauvaise qualité, ordre incorrect :</strong>{" "}
          utilisez le bouton « Signaler un problème » du lecteur : le signalement indique la série,
          l&apos;unité lue et la page concernée.
        </li>
        <li>
          <strong className="text-fg">Droit d&apos;auteur :</strong> suivez la{" "}
          <Link className="link-muted underline" href="/legal/dmca">
            procédure de signalement de contenu
          </Link>
          .
        </li>
        <li>
          <strong className="text-fg">Contenu +18 invisible :</strong> il faut un
          compte, puis valider la porte d&apos;accès +18 (une seule fois, dans
          vos préférences ou à l&apos;ouverture d&apos;un contenu adulte).
        </li>
      </ul>
    ),
  },
  {
    icon: <LifeBuoy className="size-5" aria-hidden />,
    titre: "Contacts et ressources",
    contenu: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Problème de lecture ou de scan : bouton « Signaler un problème » dans le lecteur.
        </li>
        <li>
          Demande relative à un contenu :{" "}
          <Link className="link-muted underline" href="/legal/dmca">
            formulaire de signalement
          </Link>
          .
        </li>
        <li>
          Vos données personnelles : accès, export et suppression depuis{" "}
          <Link className="link-muted underline" href="/compte">
            votre compte
          </Link>
          .
        </li>
        <li>
          Informations du site :{" "}
          <Link className="link-muted underline" href="/legal/mentions">
            mentions légales
          </Link>{" "}
          et{" "}
          <Link className="link-muted underline" href="/legal/confidentialite">
            politique de confidentialité
          </Link>
          .
        </li>
        <li>
          <Mail className="mr-1 inline size-4 align-[-2px]" aria-hidden />
          Aucun fournisseur d&apos;e-mails n&apos;est activé au lancement : l&apos;équipe ne
          répond pas par courrier électronique et les échanges passent par les notifications du
          site.
        </li>
      </ul>
    ),
  },
];

export default function AidePage() {
  return (
    <div className="container-site py-10">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Assistance</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Aide et FAQ</h1>
        <p className="mt-3 text-sm text-muted">
          Les réponses aux questions les plus fréquentes : suivi des séries, réglages du lecteur,
          raccourcis clavier et signalement d&apos;un problème.
        </p>
      </header>

      <div className="mt-8 grid max-w-5xl gap-5">
        {FAQ.map((item) => (
          <section key={item.titre} className="card p-6">
            <h2 className="flex items-center gap-2 section-title">
              <span className="text-primary">{item.icon}</span>
              {item.titre}
            </h2>
            <div className="mt-3 text-sm text-muted">{item.contenu}</div>
          </section>
        ))}
      </div>

      <p className="mt-8 flex flex-wrap items-center gap-3 text-sm text-muted">
        <Mail className="size-4 text-primary" aria-hidden />
        Une question sans réponse ici ? Utilisez l&apos;un des canaux indiqués ci-dessus.
      </p>
    </div>
  );
}
