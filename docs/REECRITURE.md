# Réécriture — Les Poroiniens V2

Branche : `rewrite`. Stack conservée : Next.js 16 (App Router) + Appwrite (TablesDB)

- Tailwind 4 + ImgChest / NAS. Les données Appwrite (335 séries) et le
  déploiement Vercel restent compatibles : **aucune migration de base**.

Objectifs : réduire la dette (fichiers géants, logique dupliquée) et corriger
les problèmes de performance et de stabilité.

---

## 1. Diagnostic

État de départ : 261 fichiers suivis, ~36 600 lignes dans `src/`, ~80 routes
API, `tsc` et `eslint` propres. Le code est soigné et très commenté, mais :

### 1.1 Composants monolithiques

| Fichier                                                                         | Lignes  | Hooks | Problème                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/reader/reader.tsx`                                                  | 1 674   | ~106  | un seul composant `Reader` de ~1 270 lignes : modes, ajustement, thème, sidebar, navigation clavier/tactile, préchargement, progression, 16 clés `localStorage` |
| `app/gerant/import/_components/import-panel.tsx`                                | 1 933   | ~51   | NAS, ImgChest, upload, batch et prévisualisation dans un même composant                                                                                         |
| `components/series/series-actions.tsx`                                          | 817     | ~32   | formulaire série + archivage + suppression + actions chapitre                                                                                                   |
| `app/compte/compte-client.tsx`                                                  | 760     | 13    | toutes les sections du compte dans un composant                                                                                                                 |
| `components/reader/reader-sidebar.tsx`, `reader-settings.tsx`, `ln-reader*.tsx` | 400–640 | —     | réglages dupliqués entre lecteur scan et lecteur LN                                                                                                             |

Conséquences : chaque correctif du lecteur en provoque un autre (cf. les
5 derniers commits `fix(lecteur)`), re-rendus complets à chaque changement
d'état (scroll, progression), code difficile à tester.

### 1.2 Performance

- **`proxy.ts` interroge la base** (`getSeriesBySlug`, `getChapter`) sur chaque
  requête `/serie/*`, y compris les prefetch de liens — Appwrite étant
  derrière un VPN (~1,3 s par requête, timeouts de 10 s), le proxy bloque la
  navigation. Le cache mémoire par instance est inefficace sur Vercel.
- **`getCurrentUser`** fait `account.get()` + `profiles.get` (2 allers-retours
  Appwrite) à chaque rendu authentifié, sans cache entre requêtes.
- Cache applicatif « maison » (`cached()` en mémoire de process) au lieu du
  cache Next 16 (`"use cache"`, `cacheTag`, `revalidateTag`) : non partagé
  entre instances, invalidation manuelle par préfixe.
- Listes chargées en entier puis filtrées en JS (`limit: 1000`/`5000` sur
  séries, recommandations, classement, pages) ; la recherche multiplie les
  requêtes (une par champ) puis trie/pagine côté serveur.
- Publication des chapitres programmés déclenchée **à la lecture** d'une page
  série (`publishDueChaptersOnDemand`) : écriture pendant un rendu.

### 1.3 Couches transverses dispersées

- Double mode démo/Appwrite dans `auth.ts`, `db/`, `demo-gate.ts` (12 fichiers
  appellent `exclureDemo`/`filtresSansDemo`…) : chaque requête doit penser à
  masquer la démo.
- Accès base non typé : `db.update(TABLES.x, id, {...} as unknown as Record<string, unknown>)`
  répété partout, sérialisation JSON implicite des colonnes `longtext`.
- Contrôles d'accès répétés à la main dans chaque route API
  (`getCurrentUser` → `can()` → `rateLimit` → parse body), validation zod
  inégale.
- Rate limit en mémoire de process (inefficace en serverless).

---

## 2. Architecture cible

```
src/
  app/                    routes (pages minces : chargent les données, composent)
    (public)/ (compte)/ (backoffice)/   groupes de routes + layouts dédiés
    api/                  routes API minces → appellent server/actions
  server/                 « server-only »
    db/                   client Appwrite, repositories typés par table (zod),
                          mapping JSON/longtext centralisé
    auth/                 session, current-user (cache), rôles, garde-fous
    services/             logique métier : series, chapters, library,
                          comments, moderation, publishing, import (nas, imgchest)
    cache.ts              tags `"use cache"` / `revalidateTag` centralisés
    http.ts               `route()` : auth + rôle + rate limit + zod + erreurs
  features/               UI par domaine (client + server components)
    reader/               lecteur découpé (voir §3)
    catalogue/ series/ library/ comments/ account/ import/ admin/
  ui/                     kit de composants génériques (button, modal, field…)
  lib/                    utilitaires purs partagés client/serveur (format, types)
```

Principes :

1. **Pages et routes minces** ; logique dans `server/services`.
2. **Repositories typés** : un schéma zod par table, plus de `as unknown as`.
3. **Cache Next 16** (`"use cache"` + `cacheTag`) à la place de `cached()` ;
   invalidation par tag à chaque écriture et par le cron (implique d'activer
   `cacheComponents` dans `next.config.ts` — voir
   `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`).
4. **Proxy sans base** : contrôle de cookie seulement ; 404 et +18 tranchés dans
   les pages (via `notFound()` / `forbidden()` avant tout streaming, grâce aux
   données mises en cache).
5. **Démo isolée** : un seul point de filtrage dans les repositories.
6. **Aucun composant > ~300 lignes**, aucun hook d'état global dans un
   composant de rendu.

---

## 3. Lecteur (priorité bugs)

```
features/reader/
  state/          store unique (useReducer + context) : mode, fit, thème, sens…
  settings/       persistance des préférences (1 clé localStorage versionnée,
                  migration des 16 clés existantes)
  layout/         ReaderShell, Sidebar, Toolbar, ProgressBar
  modes/          VerticalStrip, SinglePage, DoublePage (spreads)
  input/          clavier, zones tactiles, swipe (hooks isolés)
  images/         ReaderImage (retry), préchargement, chapitre suivant
  progress/       suivi de lecture (débouncé, envoi au serveur)
  ln/             lecteur light novel réutilisant state/settings/layout
```

---

## 4. Plan par étapes

Chaque étape est livrée sur `rewrite`, vérifiée (`typecheck`, `lint`, `build`,
recette manuelle dans le navigateur) et validée avant la suivante. Le site
reste fonctionnel à chaque étape (réécriture progressive, pas de big bang).

| #    | Étape                 | Contenu                                                                                                    | Critère de fin                                                  |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1 ✅ | Socle serveur         | `server/db` (base typée par table), `server/auth`, `server/http` (`route()`)                               | routes API applicatives sur `route()` ; plus de `as unknown as` |
| 2 ✅ | Proxy & cache         | proxy sans base pour prefetch/navigations, `server/cache` (Data Cache + tags), chapitres et pages en cache | prefetch `/serie/*` sans appel Appwrite                         |
| 3 ✅ | Lecteur               | découpage §3, migration des préférences                                                                    | parité fonctionnelle des 3 modes + LN, aucun composant > 300 l. |
| 4 ✅ | Catalogue & séries    | catalogue, recherche, fiche, classement, accueil                                                           | pagination côté base, plus de `limit: 1000`                     |
| 5 ✅ | Compte & bibliothèque | compte, bibliothèque, historique, stats, notifications                                                     | sections séparées                                               |
| 6 ✅ | Back-office           | admin, gérant, import (NAS / ImgChest / batch), modération                                                 | import découpé par source                                       |
| 7 ✅ | Nettoyage             | suppression du code mort, scripts, docs                                                                    | README à jour                                                   |

---

## 5. Avancement

### Étape 1 — Socle serveur (faite)

- `src/server/` regroupe le code serveur : `db/` (ex-`lib/db`), `auth/`,
  `http/`, `appwrite.ts`. Les imports `@/lib/db`, `@/lib/auth`,
  `@/lib/rate-limit` et `@/lib/appwrite` n'existent plus.
- **Base typée** : `TableRows` (`server/db/driver.ts`) associe chaque table à
  son type de ligne. `list`, `get`, `create` et `update` sont typés par table
  (colonnes filtrables, données écrites) : plus aucun `as unknown as` hors des
  deux drivers. Le typage a révélé la colonne `profiles.banni` absente du type
  `Profile` (ajoutée).
- **Auth** découpée : `session.ts` (cookie, `getCurrentUser`), `profile.ts`
  (création/pseudos), `credentials.ts` (connexion, inscription, déconnexion),
  `discord.ts`, `adult.ts`.
- **Bannissement appliqué** : un compte banni est refusé à la connexion
  (« Ce compte a été suspendu. ») et sa session en cours ne vaut plus que
  visiteur. Avant, le flag était enregistré mais jamais vérifié.
- **`route()`** (`server/http/route.ts`) : authentification (`public`,
  `optional`, `user` ou une permission), quota, corps JSON validé par zod et
  conversion des erreurs (`fail(status, message, code)`) en réponses
  `{ error, code }`. Les routes `public` ne lisent plus la session (aucun
  aller-retour Appwrite). Les routes NAS / ImgChest passent par `nasRoute()` /
  `imgchestRoute()`.
- Routes restées hors de `route()`, volontairement : crons (secret
  `CRON_SECRET`), OAuth Discord (redirections), proxys d'images `/api/img*`,
  `/api/image` et `/api/health`.
- Prettier ajouté (`npm run format`, style existant : 100 colonnes).
- Permission `admin_area` ajoutée (lecture du back-office, admin+).

Vérifié : `typecheck`, `lint`, `build`, et recette en mode démo (connexion,
bibliothèque, commentaires, likes, préférences, sessions, export, back-office
admin/Gérant, ban/déban, lecteur).

### Étape 2 — Proxy & cache (faite)

- **`src/server/cache.ts`** remplace le cache de `server/db` : niveau 1 en
  mémoire (inchangé, repli « dernière valeur connue » quand le VPN tombe),
  niveau 2 dans le **Data Cache de Next** (`unstable_cache`), partagé entre
  instances sur Vercel. Chaque préfixe de clé est un tag :
  `invalidate("series:")` vide la famille partout (`revalidateTag`). Le mode
  démo n'utilise que la mémoire.
- **Pourquoi pas `"use cache"` / `cacheComponents`** : l'activer impose de
  restructurer toutes les pages (Suspense autour de chaque accès session) ;
  ce sera fait page par page aux étapes 3 à 6. `cached()` garde la même
  signature, la bascule sera locale.
- **Nouveaux caches** sur les lectures les plus fréquentes, qui n'en avaient
  pas : fiche série par slug / id, liste des chapitres d'une série, index des
  pages d'un chapitre. Le lecteur passe de 5 allers-retours Appwrite en série
  à 1 liste en cache + pages et texte en parallèle. `invalidateChapters()`
  est appelé par toutes les écritures de chapitres et de pages.
- **Proxy** : la base n'est interrogée que pour un chargement de page
  complet (vrai 404, +18 sans session) ; prefetch et navigations client
  (`rsc`, `next-router-prefetch`) passent sans requête. Une seule recherche
  par URL au lieu de deux.
- **Publication programmée** : reste synchrone (un chapitre dû doit être
  publié avant son rendu), mais la prochaine échéance est lue en cache au
  lieu d'une requête à chaque affichage.
- **Compteur de vues** relu en base avant +1 (le chapitre affiché peut venir
  du cache).
- Bug corrigé : en dev, la base de démo et le cache mémoire étaient propres
  à chaque bundle (page ≠ route API) ; ils sont désormais partagés par
  processus (`globalThis`).

Mesures locales (build de prod, base Appwrite proche, donc latence faible ;
sur Vercel via VPN chaque aller-retour évité vaut ~1,3 s) :

| Requête                                | `master`  | `rewrite` |
| -------------------------------------- | --------- | --------- |
| `/serie/…` (2ᵉ affichage)              | 98–109 ms | 34 ms     |
| `/catalogue` (instance froide)         | 239 ms    | 126 ms    |
| `/api/home/releases` (instance froide) | 70 ms     | 14 ms     |

### Étape 3 — Lecteur (faite)

- **`src/features/reader/`** remplace `components/reader/` (le lecteur de
  1 682 lignes) :
  - `reader.tsx` assemble seulement ;
  - `settings/` contient l'état unique des réglages (contexte), le stockage et
    les libellés ;
  - `state/` gère la navigation par planches (`useReaderNavigation`,
    `buildSpreads`) ;
  - `input/` regroupe clavier, molette, swipe et zones tactiles ;
  - `images/` gère la page avec reprises, le préchargement et la télémétrie
    des échecs ;
  - `progress/` gère le suivi au compte, la reprise locale et `?page=N` ;
  - `modes/` contient le webtoon, la page et la double page, plus le calcul de
    l'ajustement ;
  - `layout/` contient sidebar, barres, tiroir, ticks, aide, signalement et
    fin de chapitre ;
  - `ln/` contient le lecteur light novel, qui partage plein écran, immersion
    et reprise.
- **Réglages** : la sidebar et le tiroir lisent le contexte. Ils recevaient
  chacun une trentaine de props.
- **Stockage** : les 16 clés `lp-reader-*` sont rassemblées sous
  `lp-reader-settings`, au format versionné `{ v: 2, global, series }`.
  - Migration automatique, après quoi les anciennes clés sont supprimées.
  - Portée inchangée : mode, ajustement et « première page seule » par série
    avec repli global ; sens par série uniquement.
  - Les valeurs invalides ou corrompues sont ignorées.
  - L'export produit un fichier v2 ; l'import lit v1 et v2.
- **Reprise locale** : avant, une clé par chapitre (`lp-progress:<id>`,
  `lp-ln-progress:<id>`) s'accumulait sans limite. Il reste une clé par type
  de lecteur, limitée aux 300 chapitres les plus récents, et les anciennes
  clés sont migrées.
- **Bugs corrigés** :
  - En webtoon, le suivi du défilement pouvait mesurer « page 1 » avant
    l'application de la reprise et l'écraser ; il démarre désormais après
    hydratation.
  - Des pressions de touches rapprochées partaient d'une page périmée.
  - Les raccourcis se réabonnaient à chaque page tournée.
  - Le préchargement du chapitre suivant était perdu si l'effet était rejoué.
  - Les échecs d'images en attente étaient perdus au changement de chapitre.

Vérifié :

- `typecheck`, `lint` et `build` passent.
- Test de la migration du stockage : 14/14 (v1 → v2, portées, JSON corrompu,
  import v1/v2, reprise locale).
- Recette en mode démo :
  - réglages migrés et appliqués ;
  - clavier, cycle des modes, double page D → G, thème, aide et Échap ;
  - `?page=`, suivi du webtoon, reprise en webtoon et en mode page ;
  - lecteur LN (migration, sauvegarde, tiroir) ;
  - scénario de non-régression de l'étape 2.

Pas encore fait :

- Certains composants dépassent toujours 300 lignes, faute d'avoir été
  redécoupés : `layout/sidebar.tsx` (518), `layout/settings-drawer.tsx`,
  `reader.tsx` (~415, essentiellement le JSX d'assemblage), `ln/ln-reader.tsx`
  et `ln/ln-settings.tsx` (~380-400).
- Le défilement et la reprise du webtoon n'ont été vérifiés que dans un
  onglet masqué, où `requestAnimationFrame` est mis en pause. Un contrôle
  visuel reste à faire.

### Étape 4 — Catalogue & séries (faite)

- **Base** :
  - `ListQuery.select` (projection de colonnes) ;
  - `listAll()` lit par lots de 1000 au lieu d'un `limit: 1000` qui tronquait
    sans prévenir ; un plafond de sécurité est journalisé.
- **Bug de recherche corrigé (Appwrite)** : la recherche fusionne une requête
  par champ, et l'offset était appliqué deux fois (par champ puis après
  fusion). La page 2 d'une recherche était donc vide ou fausse. Chaque champ
  renvoie désormais ses `offset + limit` premières lignes, et l'offset n'est
  appliqué qu'une fois.
- **Index léger des séries** (`seriesIndex`) : colonnes utiles seulement,
  toutes les séries publiques, 5 min de cache vidé par toute écriture
  `series:`. Il remplace `allSeries()` (lignes complètes, synopsis compris)
  sur les pages publiques :
  - facettes du catalogue et de la recherche (`catalogueFacets`) ;
  - repli de recherche tolérant aux fautes : on note l'index, puis on ne
    charge en entier que les séries de la page ;
  - séries similaires ;
  - classement ;
  - sitemap.

  `allSeries()` reste pour le back-office, sans plafond.

- **Classement** :
  - séries, chapitres et lectures de la période sont lus en entier, avec
    projection ; avant, un plafond de 1000 lectures faussait le classement ;
  - seules les séries classées sont chargées en entier ;
  - les séries archivées n'y figurent plus.
- **Recommandations** : on ne lit plus toutes les séries archivées, seulement
  les séries ciblées. Une recommandation vers une série supprimée est
  écartée.
- **Séries populaires** : le filtre +18 est passé dans la requête. Un visiteur
  recevait moins de séries que demandé quand le top comptait des séries
  adultes.
- **Répertoire des séries (admin / gérant)** : un comptage par série affichée,
  au lieu de télécharger jusqu'à 5000 chapitres de tout le catalogue.

Vérifié :

- `typecheck`, `lint` et `build` passent.
- Scénario en mode démo, 19/19 : catalogue (total, facettes, page 2, filtre
  genre), recherche exacte et avec fautes, API de recherche, fiche et séries
  similaires, classement sur les 4 périodes, accueil, nouveautés, sitemap
  (sans +18).
- Répertoire du gérant : les comptes de chapitres sont corrects.
- Lectures seules sur la base Appwrite réelle :
  - la projection fonctionne (346 séries, même total) ;
  - la pagination de recherche est cohérente (« le » : 26 résultats,
    « de » : 53).

Restent hors de cette étape :

- les `limit` élevés du back-office (`admin`, `gerant`, `moderation`) :
  étape 6 ;
- la bibliothèque et l'export de compte : étape 5.

### Étape 5 — Compte & bibliothèque (faite)

Données (`src/lib/data/`), une responsabilité par module :

- `history.ts` : `recentHistory(user, n)` (historique, accueil,
  nouveautés), `allHistory(user, série?)` lu par lots, `getHistoryEntry`
  (un `get` par identifiant), `clearHistory` ;
- `library.ts` : bibliothèque lue par lots, `getLibraryEntry` par
  identifiant (au lieu d'une requête filtrée), `clearLibrary` ;
- `progress.ts` : `recordProgress` en un `upsert` ;
- `stats.ts` : `computeStats` devient un calcul pur, plus `userStats` et
  `readingProfile` (page /statistiques) ;
- `notifications.ts` : notifications sorties de `moderation.ts` ;
- `server/db` gagne `upsert` (Appwrite `upsertRow`, mémoire en démo) et
  `parLots` (écritures 10 par 10 au lieu d'une à la fois) ;
- `chapters.ts` gagne `chaptersParIds` et `publishedChaptersOf` (lectures
  groupées par lots de 50).

Corrections :

- **Fiche série** : elle lisait les 500 dernières lectures de _tout_
  l'historique pour retrouver celles de la série ; un gros lecteur perdait
  ses marques « lu » et son bouton Reprendre. Lecture filtrée sur la série.
- **Lecteur** : la page de reprise est lue par identifiant (une ligne), en
  parallèle des recommandations, au lieu de 500 lectures.
- **Bibliothèque** : 4 lectures groupées au lieu de 2 requêtes par série
  suivie (plus un `get` par chapitre de reprise).
- **Historique** : 2 lectures groupées au lieu de 2 requêtes par ligne
  (jusqu'à 400).
- **Statistiques** : une seule lecture d'historique (au lieu de deux,
  plafonnées à 1000) et une lecture groupée des séries ; la série de
  « jours consécutifs » ne compte que si elle se termine aujourd'hui ou
  hier (avant : la dernière série, même vieille de plusieurs mois).
- **Export RGPD** : historique et commentaires complets (plafond de 1000
  lignes supprimé).
- **Suppression de compte** : toutes les lignes supprimées (avant :
  1000 commentaires, 500 notifications au plus), en parallèle.
- **Notifications** : « tout marquer lu » traite toutes les non-lues,
  pas seulement les 50 affichées.
- `?statut=toString` sur /bibliotheque n'est plus pris pour un statut.

Découpage (« sections séparées ») :

- `/compte` : `compte-client.tsx` (760 l.) remplacé par un en-tête et des
  onglets rendus côté serveur et un composant client par section
  (`_components/*-section.tsx`, 56 à 184 l.) ; les sessions Appwrite ne
  sont lues que sur l'onglet Sessions ;
- `/statistiques` : 580 → 163 l. (`_lib/periodes.ts`, `_components/`
  graphique, régularité, goûts) ;
- `/bibliotheque` : 443 → 161 l. (`_components/carte.tsx`,
  `_lib/onglets.ts`, server action dans `_actions.ts`).

Vérifié en mode démo : progression (création puis mise à jour), reprise
dans le lecteur et sur la fiche, bibliothèque (filtres, tris, vues,
« +22 non lus »), historique, statistiques (3 périodes), 5 onglets du
compte, exports RGPD / JSON / CSV, notifications, effacement de
l'historique, suppression de compte ; scénarios des étapes 2 et 4 sans
régression ; typecheck, lint et build OK. `upsertRow` n'a pas pu être
essayé sur la vraie base (écriture) : à surveiller au premier déploiement.

### Étape 6 — Back-office (faite)

Import découpé par source :

- client (`app/gerant/import/_components/`) : `import-panel.tsx`
  (1 947 l.) devient un assemblage de 95 l. — un onglet par source
  (`lot-tab`, `nas-tab`, `imgchest-tab`, `drive-tab`), des hooks
  (`use-import-target` : série cible partagée, `use-single-import` :
  formulaire « une unité », `use-nas-browser`, `use-batch-import`) et les
  sous-composants existants ; plus aucun fichier au-delà de 245 l. Les
  onglets inactifs sont masqués et non démontés : un lot en cours continue
  quand on change d'onglet ; les champs du formulaire ont des `id`
  préfixés par source (plus de doublons) ;
- serveur : `lib/import/sources.ts` (`indexFromImgchest`, `indexFromNas`,
  `indexDemo`, `SourceError`) ; la route `api/owner/import` ne fait plus
  que valider, créer et publier.

Corrections :

- **Tableau de bord admin** (`lib/data/dashboard.ts`) : 4 tables lues en
  entier (`limit: 5000`, faux au-delà — la base compte déjà 3 945
  chapitres) remplacées par des comptages (`total`, une ligne lue),
  l'activité des 30 derniers jours réduite à la colonne de date, top et
  vues sur l'index léger ; les dernières publications d'une série archivée
  n'affichent plus « Série supprimée ».
- **Gérant** : contenus en attente / publiés comptés en base (avant : 5000
  chapitres complets).
- **Modération** : seules les lignes visées par les signalements sont lues
  (avant : 5000 commentaires, 5000 chapitres, 500 profils, tout le
  catalogue).
- **Utilisateurs** : tous les profils (avant : 500) ; compteur de
  commentaires sur la seule colonne auteur.
- **Suppression de chapitre / série** : `deleteChapterCascade` supprime
  toutes les pages (avant : 5000 au plus, une par une — pages orphelines
  et délai de fonction dépassé), 10 par 10 ; série : chapitres 3 par 3.
- **Import** : job de lot lu par identifiant (avant : cherché parmi les 500
  derniers, un lot ancien était refusé) ; pages créées 10 par 10 ; un
  chapitre à moitié indexé est retiré en cas d'échec (avant : le nouvel
  essai butait sur « numéro déjà existant »).
- **Lot** : les erreurs de validation (série manquante, numéro invalide)
  s'affichent dans l'onglet (avant : invisibles, le message n'était rendu
  que dans les autres onglets).
- **Commentaires** : les likes du membre sont lus pour les commentaires
  affichés (avant : ses 500 derniers likes, au-delà les cœurs
  disparaissaient).
- **Recommandations, paramètres, erreurs d'images, scan NAS** : `limit`
  remplacés par `listAll` (+ `select`).
- `server/db` : `listParValeurs(table, valeurs, champ, requête)` — lecture
  groupée par lots de 50 valeurs.

Vérifié en mode démo (33 contrôles : commentaire, like, signalements,
tableau de bord, utilisateurs, modération, recommandations, accueil
gérant, import démo de 30 pages, doublon 409, album invalide 400, lot
avec job étranger refusé, suppression de chapitre et de série en cascade)
et dans le navigateur (onglets, série partagée, validation, pas d'`id` en
double, console propre) ; scénarios des étapes 2, 4 et 5 sans
régression ; lectures seules sur la vraie base (comptages, `in` sur
`user_id` / `target_id`) ; typecheck, lint et build OK.

Restent au-delà de 300 lignes, à reprendre à l'étape 7 :
`recommendations-panel.tsx` (460), `settings-form.tsx` (429),
`admin/page.tsx` (365), `gerant/page.tsx` (309), `api/owner/import/route.ts` (336), et côté
lecteur ceux listés à l'étape 3.

### Étape 7 — Nettoyage (faite)

Code mort : aucun fichier orphelin (analyse des imports de `src/` et
`scripts/`) ; 13 exports jamais appelés supprimés — `ButtonLink`,
`Spinner`, `recentChapters`, `verifySignature`, `imageEnvStatus`,
`imgchestEnvStatus`, `cloudflareConfigured`, `nasFileExists`, `anonClient`,
`demoIds`, `buildDemoData` et deux types.

Découpages complémentaires :

| Avant (lignes)                                    | Après                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `components/series/series-actions` (815)          | `components/series/actions/` : formulaire, saisie à capsules, archivage, suppression, chapitre |
| `components/comments/comments-section` (648)      | section (239) + hook `use-comments` + `comment-item`, `report-dialog`, `types`                 |
| lecteur `layout/sidebar` (518)                    | sidebar (302) + `sidebar-blocks` + `sidebar-preferences`                                       |
| lecteur `layout/settings-drawer` (416)            | tiroir (299) + `settings-controls`                                                             |
| lecteur `reader.tsx` (412)                        | 359 + `reader-props.ts` + `progress/use-resume.ts`                                             |
| lecteur LN `ln-settings` (377), `ln-reader` (397) | `ln-storage.ts` (stockage) + UI (273) ; `ln-pager.tsx`, lecteur (348)                          |
| `admin/recommandations` panneau (460)             | panneau (304) + `series-selector` + `reco-utils`                                               |
| `gerant/parametres` formulaire (429)              | formulaire (253) + `secrets-card` + `password-reset-card`                                      |
| `admin/page.tsx` (365)                            | 307 + `_components/dashboard-parts`                                                            |

Scripts : tous compilent avec la nouvelle arborescence (`import-ancien`
importe `src/server/db/ids`) ; les migrations restent en dry-run par défaut
et sont conservées pour l'historique. README : structure, vérifications et
règle « mode démo pour les tests » à jour.

Vérifié : typecheck, lint, build ; scénarios démo des étapes 2, 4, 5 et 6 ;
navigateur — lecteur scans (sidebar, changement de mode, préférences
enregistrées), lecteur LN (texte, pager, réglages), fil de commentaires
(publication, like, actions), formulaire de série du gérant.

Restent au-delà de 300 lignes, sans urgence (pages serveur surtout faites de
JSX, modules de données, données de démo) : `server/db/seed.ts`,
`lib/data/chapters.ts`, `lib/data/series.ts`, `serie/[slug]/page.tsx`,
`serie/[slug]/[n]/page.tsx`, `app/page.tsx`, `lib/nas.ts`,
`inscription-form.tsx`, `ln-content.tsx`, `api/owner/import/route.ts`,
`lib/types.ts`, `actions/series-form.tsx`, `ln-format.tsx`,
`layout/chrome.tsx`, `catalogue-controls.tsx`, `gerant/page.tsx`,
`lib/imgchest.ts`, `settings/storage.ts`, `server/db/appwrite.ts`.

## 6. Décisions à trancher

Laissées en l'état à la demande (rien n'a été retiré) :

- **Mode démo en mémoire** (sans `APPWRITE_API_KEY`) : le garder pour le dev
  local, ou le supprimer (dev toujours branché sur Appwrite) ?
- **Jeu de démo dans la base partagée** (`demo-gate.ts`) : le garder masqué en
  prod, ou le supprimer de la base et retirer le masquage ?
- **Sources d'images** : garder ImgChest **et** NAS, ou une seule ?
- **Google Drive** (`/api/owner/drive/sync`) : utilisé ou à retirer ?
