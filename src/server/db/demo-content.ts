/**
 * Contenus texte de démonstration (séries light novel de la graine).
 *
 * `contenu_chemin` de démo est un chemin local (`/api/img/ln/…`) servi ici
 * sans HTTP ni dépendance réseau — même esprit que les pages de scan
 * générées par `/api/img/page/…`. En production, seuls les chemins relatifs
 * du NAS sont servis (via `IMG_BASE_URL`).
 */

const CHEMIN = /^\/api\/img\/ln\/([a-z0-9-]+)\/(\d+)$/;

/** Paragraphes réutilisés, assemblés de façon déterministe par chapitre. */
const BLOC: string[] = [
  "La lampe de cuivre oscillait au-dessus de la table de travail, projetant des ombres qui semblaient suivre le mouvement de la plume. Dehors, la pluie fine tapotait la verrière de l'observatoire, et chaque goutte emportait avec elle un peu de la chaleur du salon.",
  "— Tu relis encore la même page, dit Towa en posant deux tasses fumantes au bord des cartes. Depuis trois nuits. Si l'étoile que tu cherches existait, elle se serait montrée.",
  "Elle ne releva pas les yeux. Sur le parchemin, les constellations de l'ancien monde étaient tracées à l'encre grise, avec des noms que plus personne n'utilisait. Son grand-père les avait appris à voix basse, comme on apprend des prières qu'on ne croit plus tout à fait.",
  "Le silence qui suivit ne fut pas un silence de gêne : c'était celui d'une pièce qui écoute. Le vieux baromètre de la cheminée tressaillit, l'aiguille traçant un arc lent vers l'est, là où la montagne cache la mer.",
  "Elle referma enfin le registre. Dehors, la pluie avait cessé ; une seule lueur, basse à l'horizon, déplaçait l'ombre des sapins. Elle sut, avant même de monter à la tour, que ce n'était ni une voiture ni un orage.",
  "— Reste ici, prévint-elle, et ce fut Towa qui rit, parce qu'on ne reste jamais où on le lui demande dans cette maison.",
  "L'escalier en colimaçon grincent à la onzième marche, puis douze, puis onze encore : personne n'avait jamais réussi à les compter deux fois de la même façon. En haut, la coupole était restée entrouverte, et l'air qui entrait sentait la pierre mouillée et le sel.",
  "Elle plaça la lunette sur son support de laiton, tourna la vis de rappel, et chercha d'abord les repères connus. L'étoile polaire répondit la première, fidèle et un peu lasse. Puis vint la constellation qu'on avait effacée des cartes il y a deux cents ans.",
  "Ce qui brillait là-bas ne ressemblait à aucune étoile : trop bas, trop lente, trop patiente. Elle nota l'heure, l'azimut, la hauteur, et le mot que son grand-père écrivait toujours en marge, au crayon, pour ne pas effrayer ses enfants : « encore ».",
  "Quand elle redescendit, Towa dormait sur les cartes, la joue contre une côte de l'Astre du Nord. Elle ne le réveilla pas. Elle écrivit plutôt une ligne dans le journal de bord, d'une écriture encore incertaine : « Cette nuit, quelqu'un a répondu. »",
];

/** Contenu déterministe : ni hasard ni re-render mouvant. */
export function demoLnContent(chemin: string): string[] | null {
  const match = chemin.match(CHEMIN);
  if (!match) return null;
  const numero = Number(match[2]);
  const debut = (numero * 3) % BLOC.length;
  const longueur = 6 + (numero % 3); // 6 à 8 paragraphes : défilement réel
  const paragraphes: string[] = [
    `Chapitre ${numero} — les étoiles répondent à heure fixe, mais jamais deux fois de la même voix.`,
  ];
  for (let i = 0; i < longueur; i++) paragraphes.push(BLOC[(debut + i) % BLOC.length]);
  paragraphes.push("Fin du chapitre de démonstration.");
  return paragraphes;
}
