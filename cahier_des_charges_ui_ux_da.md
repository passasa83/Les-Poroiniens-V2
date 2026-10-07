# Cahier des charges : affichage, UI/UX et direction artistique

**Version :** 1.1 (intègre les 3 captures d'écran de MANGA Plus fournies le 4 octobre 2026)
**Date :** 4 octobre 2026
**Site cible :** https://les-poroiniens-v2.vercel.app/ (Next.js, Vercel)
**Documents liés :** `cahier_des_charges_site_scans.md` (fonctionnel), `cahier_des_charges_images_nas_cloudflare.md` (images), `systeme_appel_api.md` (appels API)

---

## 1. Objet et sources

Définir l'affichage du site (structure des pages, composants, comportements) et sa direction artistique globale (DA), à partir de trois références :

| Référence | Rôle dans ce cahier |
|---|---|
| **mangas-origines.fr** | Modèle pour l'**affichage** : accueil, blocs de contenu, navigation, comptes |
| **poseidon-scans.net** | Modèle pour l'**affichage** : sorties récentes, populaires du jour, annonces, hero |
| **MANGA Plus** (`/updates`) | Modèle pour la **DA globale** : sobriété, contenu d'abord, page « Updates » |

### 1.1 Ce qui a été observé
- **Mangas Origines et Poseidon Scans** : pages d'accueil lues en entier (structure, blocs, libellés, comportements annoncés).
- **MANGA Plus** : la page est une application qui exige JavaScript et n'était pas lisible par mes outils. Ce cahier s'appuie donc sur **3 captures d'écran fournies par toi** : (1) haut de la page *Updates* en anglais, (2) suite de la page *Updates* avec la fin de la grille et le classement, (3) page *Liste des Mangas* en français.
- Les **couleurs et dimensions** données plus bas sont **estimées à l'œil** depuis les captures : elles doivent être mesurées (pipette, outils de développement) avant l'intégration.
- **Non visibles sur les captures** : le lecteur, la fiche série, la version mobile, les états de survol et les animations. Ces parties restent spécifiées à partir du cahier principal et des autres références.

### 1.2 Règle d'inspiration
Reprendre les **principes de structure et d'ergonomie**, jamais les logos, illustrations, textes ni feuilles de style. Le site garde sa propre identité (nom, logo, palette dérivée, textes).

---

## 2. Analyse comparative

### 2.1 Mangas Origines (affichage)
| Élément observé | À reprendre | À éviter |
|---|---|---|
| Barre de navigation : Catalogue, Quoi de neuf ?, Random, Classement, + liens Discord et version 18+ | Menu court, bouton **Aléatoire**, **Classement** | Boutique et renvoi vers un site 18+ séparé (hors périmètre ici) |
| Carrousel « À la une » : 6 séries (titre, note, genres, type) | Hero éditorial à 5-6 slides piloté depuis l'admin | Slides sans synopsis ni appel à l'action |
| Blocs : Recommandations pour vous, Tendances (classées 1 à 10), Ajouts récents, Sorties récentes | Ordre des blocs et **numéros de rang** sur les tendances | Trop de blocs similaires qui allongent l'accueil |
| « Sorties récentes » : onglets Tout / Manhwa / Manhua / Manga ; chaque carte montre la couverture, la note, le type, les **2 derniers chapitres** avec « il y a 6 heures » et une date | Cartes à deux chapitres, **temps relatif**, onglets par type, bouton « Voir plus » | Cartes denses difficiles à lire sur petit écran |
| Pastilles sur couverture : type (Manhwa…) et note | Badges type + note, lisibles sans masquer l'image | Pastilles trop nombreuses |
| Connexion en fenêtre : identifiant ou email, « Se souvenir de moi », mot de passe oublié ; inscription avec **pseudo de 6 à 20 caractères** sans email public | Parcours en **modale** sans quitter la page, règle de pseudo claire | — |
| Barre d'onglets mobile : Accueil, Catalogue, Recherche, Classement, Favoris | Barre inférieure sur mobile | — |
| « Installer l'application » (PWA), page « Adresse de secours » | PWA + page d'adresse de secours | — |
| Points gagnés à la lecture, dépensés en décorations de profil | Option future (V2) | À ne pas mettre en V1 |

### 2.2 Poseidon Scans (affichage)
| Élément observé | À reprendre | À éviter |
|---|---|---|
| Hero avec visuel de personnage, synopsis, bouton « Lire le manga », carrousel numéroté (01 à 05) | Hero avec **synopsis court et bouton Lire** | Visuels de personnages sans licence |
| « Populaire aujourd'hui » : 6 séries avec un compteur | Bloc **Populaire aujourd'hui** (classement du jour) | Compteur sans libellé clair |
| « Dernières sorties » : une carte par série avec 2 derniers chapitres, étiquette **« Cette semaine »**, bouton **« Charger plus (24/190) »** avec compteur | Étiquette de fraîcheur, **compteur de progression** du chargement | — |
| Bloc « Annonces » : actualités de l'équipe, avec date et lien | Bloc **Annonces de l'équipe** | — |
| Connexion via Discord ou Google | OAuth Discord et Google | — |
| URLs `/serie/<slug>` et `/serie/<slug>/chapter/<n>` | Schéma d'URL simple et lisible | — |
| Bandeau d'information en tête (statut du service) | **Bandeau d'annonce global** piloté depuis l'admin | Bandeaux envahissants |

### 2.3 MANGA Plus (DA et mise en page, d'après les captures)
| Observé | Traduction pour le site |
|---|---|
| **Barre supérieure** gris anthracite, logo à gauche, 7 liens (Updates, Featured, Ranking, Manga List, Creators, Favorite, About Us), champ de recherche « titre ou auteur » avec loupe, sélecteur de langue à contour fin | Barre unique : Nouveautés, En vedette, Classement, Catalogue, Favoris, À propos ; recherche par titre ou auteur ; bouton compte à la place du sélecteur de langue (site en français) |
| **Fil d'Ariane** discret (« home > updates ») sous la barre, lien souligné | Fil d'Ariane sur les pages de liste |
| **Fond d'ambiance** : sur la page Updates, un collage de planches en niveaux de gris, assombri, derrière le haut de page ; plus bas, fond uni sombre | Fond d'ambiance = **couverture mise en avant, floutée et assombrie** (visuel du site), uni plus bas ; aucune planche tierce reprise |
| **Carte héros** très arrondie : moitié gauche = panneau sombre avec étiquette rouge « Latest 24hours », titre en gras, auteur en gris, numéro de chapitre + nombre de vues ; moitié droite = visuel paysage | Même structure pour le héros de la page Nouveautés |
| **Rangée de 5 cartes** portrait : étiquette rouge avec horloge en haut à gauche de la couverture ; sous l'image : titre, **numéro de chapitre en gras**, nombre de vues en gris | Carte standard « sortie récente » |
| **Colonne latérale** (~320 px) : carte « Official SNS Accounts » (5 icônes rondes) ; bloc **« Hottest »** avec « View All » ; lignes avec **miniature, rang en gris, titre, auteur, vues** | Colonne « Communauté » (Discord) + **« Les plus lus »** |
| **Bannières promotionnelles** internes en bas de page (rouge, cyan) | Bannières d'annonce **internes** (événements, annonces), jamais de publicité |
| **Liste des mangas** : onglets centrés *Ongoing / Completed / One-shot* (actif souligné), menus déroulants à contour fin **« A to Z »** et **« Filter »** à droite, grille de **8 colonnes** ; carte = couverture, titre, auteur, pastilles | Catalogue avec onglets par statut, tri et filtre en menus déroulants |
| Titres **tronqués sur une ligne** (points de suspension), espacement généreux entre les cartes | Règle de troncature, grille aérée |
| Interface **neutre** (gris anthracite, texte blanc, gris secondaire) pour que les couvertures colorées dominent ; **un seul accent rouge corail** réservé à la fraîcheur (« dernières 24 h ») | Cœur de la DA (section 3) |
| Police sans empattement **géométrique arrondie** (type Poppins), titres en gras | Typographie (3.3) |

---

## 3. Direction artistique globale

### 3.1 Principes
1. **Le contenu d'abord** : les couvertures et les pages de scans sont les éléments les plus visibles ; l'interface s'efface.
2. **Sombre par défaut** : lecture confortable, thème clair disponible dans les préférences.
3. **Un seul accent** : une couleur d'action (rouge sombre), utilisée avec parcimonie (boutons principaux, états actifs, badges « Nouveau »).
4. **Densité maîtrisée** : grilles régulières, peu de bordures, espaces généreux.
5. **Lisibilité avant tout** : contrastes élevés, textes courts, hiérarchie nette.
6. **Sans publicité ni traceur publicitaire** (promesse déjà affichée sur le site) : aucun emplacement réservé aux annonces.

### 3.2 Palette (valeurs estimées depuis les captures, à mesurer)
Le site v2 utilise aujourd'hui un fond bleu-noir (`#0A0B11`). MANGA Plus est plutôt **gris anthracite neutre** : c'est cette direction qui est retenue, pour laisser les couvertures colorées ressortir. Mettre aussi à jour la couleur de thème des métadonnées (`theme-color`).

| Jeton | Valeur estimée | Usage |
|---|---|---|
| `--bg` | `#1D1D1F` | Fond de page |
| `--header` | `#232325` | Barre supérieure |
| `--surface` | `#2B2B2E` | Cartes, panneaux, colonne latérale |
| `--surface-2` | `#353539` | Survol, champs, menus déroulants |
| `--border` | `#3C3C41` | Contours fins (menus, champs) |
| `--text` | `#FFFFFF` | Titres et texte principal |
| `--muted` | `#9B9BA1` | Auteur, vues, rangs, texte secondaire |
| `--accent` | `#E8404A` | Étiquette « Dernières 24 h », boutons principaux, états actifs |
| `--accent-deep` | `#8E1B22` | Fonds d'accent, hover de l'accent |
| `--success` / `--warning` / `--danger` | `#2FBF71` / `#F2A93B` / `#E5484D` | États |

- L'accent rouge reste **rare** : il signale la fraîcheur et l'action principale, pas la décoration.
- Thème clair (optionnel) : `--bg #F5F5F7`, `--surface #FFFFFF`, `--text #1A1A1C`, même accent.
- Contrastes texte / fond ≥ **4,5:1** (WCAG AA) à vérifier pour chaque paire, notamment `--muted` sur `--surface`.

### 3.3 Typographie
- Police principale : sans empattement géométrique arrondie de type **Poppins** (licence libre, chargée avec `next/font`), graisses 400, 500, 600, 700, pile de secours système.
- Titres de cartes : 16 px, graisse 600, blanc, **une ligne avec points de suspension** ; auteur et métadonnées : 13-14 px, graisse 400, `--muted`.
- Numéro de chapitre : graisse 700 (« Ch. 277 »), nombre de vues en `--muted`.
- Titre du héros : 32 à 40 px, graisse 700.
- Interligne 1,4 à 1,6 ; longueur de ligne ≤ 70 caractères pour les synopsis.
- Prévoir accents et apostrophes français, ainsi que les caractères japonais, coréens ou chinois des titres originaux (police de secours adaptée).
- Format des nombres : « 259,4 k » (virgule française, `k` pour milliers, `M` pour millions).

### 3.4 Forme et mouvement
- Rayons : 8 px (cartes, champs), 999 px (badges, chips). Ombres légères, surtout en thème clair.
- Couvertures au ratio **2:3** (aucune déformation, `object-fit: cover`), coins arrondis de 8 px.
- Transitions de 150 à 250 ms (survol, ouverture de panneaux) ; pas d'animation décorative continue.
- `prefers-reduced-motion` respecté : suppression des défilements automatiques et des transitions longues.
- Icônes : jeu unique (Lucide), trait de 1,5 px.

### 3.5 Images et états de chargement
- Squelettes de la forme exacte des cartes pendant le chargement.
- Couleur dominante ou flou miniature stocké en base pour éviter les cases vides.
- Image de remplacement uniforme si une couverture est absente ou en erreur.
- Couvertures du contenu +18 : version floutée côté serveur tant que le gate n'est pas validé (voir cahier images, 7.3).

---

## 4. Grille, points de rupture et structure globale

| Appareil | Largeur | Colonnes (catalogue) | Colonnes (Nouveautés, colonne principale) | Navigation |
|---|---|---|---|---|
| Mobile | < 640 px | 2 | 2 | Barre d'onglets en bas |
| Mobile large / tablette | 640 – 1023 px | 3 à 4 | 3 | Barre d'onglets en bas |
| Desktop | 1024 – 1439 px | 5 à 6 | 4 + colonne latérale | Barre supérieure |
| Grand écran | ≥ 1440 px | **8** (comme MANGA Plus) | **5** + colonne latérale de ~320 px | Barre supérieure |

- Conteneur centré, largeur maximale **1280 px** (1440 px sur grand écran pour permettre 8 colonnes), hors lecteur.
- Marges latérales : 16 px (mobile), 24 px (tablette), 32 px (desktop).
- Espacement sur grille de **4 px**.

---

## 5. Navigation

### 5.1 Desktop : barre supérieure
Fond `--header`, hauteur 72 px, `Logo` à gauche, puis les liens : **Nouveautés** · **En vedette** · **Classement** · **Catalogue** · **Favoris** · **À propos** (+ **Aléatoire**). À droite : champ de recherche « Rechercher par titre ou auteur » (loupe, fond `--surface-2`, raccourci `/`) et bouton **Connexion** ou **avatar** (menu : profil, bibliothèque, paramètres, déconnexion).
Lien actif : texte blanc souligné ; liens inactifs : blanc atténué. Barre fixe, masquée au défilement vers le bas puis réaffichée au défilement vers le haut. Sous la barre, **fil d'Ariane** discret sur les pages de liste (« Accueil > Nouveautés »).

### 5.2 Mobile : barre d'onglets inférieure
`Accueil` · `Catalogue` · `Recherche` · `Bibliothèque` · `Compte`. Zones tactiles ≥ 44 px, onglet actif en couleur d'accent, respect de la zone de sécurité (encoche et barre système).

### 5.3 Pied de page
Navigation, légal (mentions, confidentialité, DMCA), contact (« Signaler un problème »), mention « Aucune publicité », lien vers l'**adresse de secours**, mention contenu +18.

### 5.4 Autres éléments
- **Bandeau d'annonce global** (maintenance, incident) piloté depuis l'admin, fermable.
- **Installation PWA** : invitation discrète, jamais bloquante.
- **Page « Adresse de secours »** : domaines alternatifs, mise à jour depuis l'admin.

---

## 6. Pages

### 6.1 Accueil

```
┌──────────────────────────────────────────────────────────┐
│ HERO « À la une » : visuel, titre, genres, synopsis court │
│ [ Lire le chapitre 1 ]  [ + Suivre ]            ● ○ ○ ○ ○ │
├──────────────────────────────────────────────────────────┤
│ Continuer la lecture (membres) →→→ cartes avec progression │
├──────────────────────────────────────────────────────────┤
│ Dernières sorties   [Tout][Manga][Manhwa][Manhua]          │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐  carte = couverture + 2 chapitres│
│ └────┘ └────┘ └────┘ └────┘  + « il y a 6 h »                │
│                 [ Charger plus (24 / 190) ]                │
├──────────────────────────────────────────────────────────┤
│ Populaire aujourd'hui (rang 1 à 10)  │ Annonces de l'équipe │
├──────────────────────────────────────────────────────────┤
│ Ajouts récents →→→     Recommandations pour vous →→→      │
├──────────────────────────────────────────────────────────┤
│ Bandeau « Créez votre compte » (visiteurs uniquement)      │
└──────────────────────────────────────────────────────────┘
```

| Bloc | Contenu | Source de données |
|---|---|---|
| Hero | 5 slides maximum, défilement toutes les 7 s, pause au survol et au toucher, points de navigation, **bouton Lire** + **Suivre** | Sélection admin |
| Continuer la lecture | Dernière série lue, chapitre et page, barre de progression | Historique (membres) |
| Dernières sorties | Onglets par type ; carte avec couverture, badge type, 2 derniers chapitres, temps relatif, étiquette **« Nouveau »** (moins de 48 h) ; **« Charger plus (n / total) »** | Chapitres publiés |
| Populaire aujourd'hui | Classement 1 à 10 avec numéro de rang, couverture, titre, genre | Lectures du jour |
| Annonces | 3 dernières annonces (titre, date, extrait) | Admin |
| Ajouts récents | Séries nouvellement ajoutées | Catalogue |
| Recommandations | Éditoriales, personnalisées pour les membres | Admin + algorithme |
| Bandeau d'inscription | Bénéfices (bibliothèque, historique, commentaires, stats), sans publicité | Statique |

États vides : un bloc sans donnée **disparaît** (pas de titre orphelin). Cas actuel du site v2 (blocs vides) : afficher un état d'attente cohérent plutôt que des sections sans contenu.

### 6.2 Nouveautés (inspirée de la page Updates de MANGA Plus)
Objectif : voir **ce qui vient de sortir**, avec une mise en avant forte des dernières 24 heures.

```
Accueil > Nouveautés
┌──────────────────────────────────────────┐  ┌──────────────────┐
│ [🕒 Dernières 24 h]                       │  │ Communauté        │
│ Titre de la série         │ visuel paysage│  │ ○ ○ ○ ○ ○ (Discord…)│
│ Auteur                    │               │  ├──────────────────┤
│ Ch. 215 · 24,4 k vues     │               │  │ Les plus lus  Voir tout│
└──────────────────────────────────────────┘  │ [img] 1  Titre        │
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │       Auteur · 312 k │
│🕒24h│ │🕒24h│ │🕒24h│ │🕒24h│ │🕒24h│       │ [img] 2  Titre        │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘       │ …                     │
Titre    Titre   …                            └──────────────────┘
Ch. 277 · 259 k
 (la grille continue sur 5 colonnes)
[ Bannières d'annonce internes ]
```

**Colonne principale**
- **Carte héros** (coins très arrondis, contour fin) : moitié gauche = panneau `--surface` avec étiquette « Dernières 24 h » en haut à gauche, titre, auteur, numéro de chapitre et vues ; moitié droite = visuel paysage de la série. Choix de la série : sélection admin, à défaut le chapitre le plus récent (règle à confirmer).
- **Grille de cartes** « dernières 24 h » : couverture portrait 2:3, **étiquette rouge avec icône d'horloge** collée en haut à gauche de la couverture (coin arrondi identique à celui de l'image), puis sous l'image : titre (une ligne tronquée), **numéro de chapitre en gras** et vues en gris. Sur la première rangée des captures, les cartes sont classées par nombre de vues décroissant (ordre par défaut à confirmer).
- **Jours précédents** : sous la grille, sections « Hier », « Il y a 2 jours » jusqu'à 7 jours, avec le même format de carte sans l'étiquette rouge. *Ce découpage n'est pas visible sur les captures (qui montrent seulement les dernières 24 h) : à valider.*
- Filtres : onglets ou menu par type (manga, manhwa, manhua) et **Mes séries suivies** (membres) ; indicateur « lu » grisé sur les chapitres déjà lus.
- Clic sur la carte : ouvre le dernier chapitre (ou la fiche série, choix à confirmer) ; clic sur le titre : fiche série.

**Colonne latérale (~320 px, sous la grille sur mobile)**
- Carte **Communauté** (`--surface`, coins arrondis) : titre centré, icônes rondes (Discord et autres réseaux du site).
- Bloc **Les plus lus** avec lien « Voir tout » : lignes de **miniature** (60 px, coins de 4 px), **rang** en grand et en gris, **titre** en gras, **auteur** en gris, **nombre de vues** avec petite icône. Jusqu'à 17 lignes sur les captures ; le site en affiche 10 par défaut.
- Bannières d'annonce internes (événements, annonces de l'équipe), jamais de publicité.

**Fond :** couverture du héros floutée et assombrie en haut de page, fond uni `--bg` plus bas.

### 6.3 Catalogue (inspiré de la page Liste des Mangas)

```
Catalogue   Accueil > Catalogue
          En cours   Terminés   One-shot                [ A → Z ▾ ] [ Filtrer ▾ ]
┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐
│     ││     ││     ││     ││     ││     ││     ││     │
└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘
Titre   Titre   …   (titre tronqué sur 1 ligne)
AUTEUR  Auteur       (gris, petit)
[Manhwa] [Manga]     (pastilles)
```
- **Titre de page** à gauche avec fil d'Ariane ; **onglets centrés par statut** (En cours, Terminés, One-shot), onglet actif en blanc avec **soulignement**, inactifs en gris.
- À droite : deux **menus déroulants à contour fin** : **Tri** (A → Z, popularité, nouveautés, note, mise à jour) et **Filtrer** (genre multiple, type, année, statut Hiatus ou Abandonné, contenu +18).
- Grille : 2 colonnes sur mobile, jusqu'à **8 sur grand écran**, espacement généreux. Carte : couverture 2:3 aux coins arrondis, titre une ligne tronquée, auteur en gris, pastilles (type, et tag « +18 » le cas échéant).
- Filtres actifs sous forme de **chips supprimables** avec bouton Réinitialiser ; filtres et onglet **dans l'URL**.
- Mobile : onglets défilables horizontalement, **Filtrer** ouvre un tiroir plein écran avec compteur de résultats.
- Chargement : « Charger plus (n / total) » ou pagination (à confirmer).
- Bouton **Afficher le contenu +18** (voir section 10).
- État vide : « Aucune série ne correspond », suggestion d'élargir, bouton de réinitialisation.

### 6.4 Recherche
- Champ avec résultats instantanés (couverture miniature, titre, type, statut), tolérance aux fautes, recherche sur titres alternatifs et auteurs.
- Historique des 10 dernières recherches (stocké localement) et suggestions populaires.
- Page de résultats dédiée avec les mêmes filtres que le catalogue.

### 6.5 Fiche série
```
┌─────────────────────────────────────────────┐
│ Bannière floutée (fond)                      │
│ [Couverture]  Titre · titres alternatifs     │
│               Type · Statut · Année · ★ 4,5  │
│               Genres (chips)                 │
│  [ ▶ Reprendre ch. 120 ] [ + Bibliothèque ▾ ]│
├─────────────────────────────────────────────┤
│ Synopsis (3 lignes + « Lire la suite »)      │
├──[ Chapitres ]──[ Commentaires ]──[ Infos ]──┤
│ Tri ↑↓   Rechercher un chapitre   Premier·Dernier│
│ Ch. 215 · il y a 6 h        ♥ 120  💬 14   ○ │
│ Ch. 214 · 27 sept.          ♥  98  💬  9   ● │
└─────────────────────────────────────────────┘
```
- Bouton principal : **Lire le chapitre 1** (visiteur) ou **Reprendre au chapitre X, page Y** (membre).
- Chapitres : numéro, titre éventuel, date (relative sous 7 jours), likes, commentaires, **état lu / non lu**, case pour marquer lu. Scroll interne ou pagination au-delà de 100.
- Menu bibliothèque : En cours, À lire, Terminé, En pause, Abandonné, Favori.
- Note : étoiles interactives pour les membres.
- Onglet Infos : auteurs, éditeur, année, genres, tags, titres alternatifs.
- Séries similaires en bas de page.
- Données structurées (SEO) et image de partage générée par série.

### 6.6 Lecteur
Principe : **plein écran immersif**, interface qui disparaît.

| Zone | Comportement |
|---|---|
| Barre supérieure | Retour à la série, titre + chapitre (sélecteur), réglages, signalement ; **masquée** en lecture, visible au toucher, au mouvement de souris ou au retour de défilement |
| Barre inférieure | Numéro de page (« 12 / 19 »), barre de progression cliquable, chapitre précédent / suivant |
| Réglages (tiroir) | Mode, sens, ajustement, thème, luminosité |
| Zone de lecture | Pages centrées, fond neutre ou noir |

- **Modes** : webtoon (défilement vertical continu), page par page, double page (avec option « première page seule »).
- **Sens** : gauche → droite, droite → gauche (mémorisé par série).
- **Ajustement** : largeur, hauteur, auto, personnalisé (largeur maximale).
- **Entrées** : zones tactiles (gauche / centre / droite), balayage, clavier (flèches, espace, `F` plein écran, `M` menu, `D` changement de mode, `Échap`), molette.
- **Chargement** : première page immédiate, suivantes différées avec préchargement de 2 à 3 pages, repli propre en cas d'erreur (voir cahier images, 7.2). Aucun écran « chargement de toutes les pages » bloquant.
- **Fin de chapitre** : écran dédié avec bouton **Chapitre suivant** en évidence, like, commentaires du chapitre, séries recommandées, bouton **Signaler un problème**.
- **Progression** enregistrée automatiquement (page et chapitre), reprise à la page exacte.
- **Réglages mémorisés** par compte (ou en local pour les visiteurs).
- Accessibilité : tous les contrôles accessibles au clavier, libellés explicites, focus visible.

### 6.7 Bibliothèque (membres)
- Onglets : Tout, En cours, À lire, Terminé, En pause, Abandonné, Favoris.
- Carte avec **barre de progression**, dernier chapitre lu, **badge « +N non lus »** et bouton **Reprendre**.
- Tri : dernière lecture, nouveautés, titre, note. Vue grille ou liste.
- Import / export de la bibliothèque.

### 6.8 Profil et statistiques
- En-tête : avatar, pseudo, date d'inscription, bio.
- Statistiques : chapitres et pages lus, temps estimé, séries terminées, genres préférés, régularité, graphiques semaine / mois / année.
- Réglages : confidentialité, préférences de lecture, tags masqués, affichage +18, notifications, sessions, suppression du compte.

### 6.9 Classement
- Onglets **Jour**, **Semaine**, **Mois**, **Tout temps**, filtre par type.
- Liste numérotée (rang, évolution ▲▼, couverture, titre, genres, note).

### 6.10 Connexion et inscription
- **Modale** depuis n'importe quelle page (connexion, inscription, mot de passe oublié) et pages dédiées `/connexion` et `/inscription`.
- Connexion : identifiant ou email, mot de passe, **Se souvenir de moi**, **Discord**, **Google**.
- Inscription : pseudo (6 à 20 caractères, sans espace ni symbole, affiché publiquement), email, mot de passe, captcha ; message clair indiquant que l'email n'est jamais montré.
- Messages d'erreur précis sur les champs, sans révéler l'existence d'un compte.
- Parcours sans email au lancement (voir cahier principal, 14.3) : le mot de passe oublié renvoie vers le support tant que les mails ne sont pas actifs.

### 6.11 Annonces
- Liste datée et page de détail ; dernière annonce affichée sur l'accueil et, si l'admin le décide, en bandeau.

### 6.12 Pages d'erreur et d'état
- 404 (retour accueil, recherche), 403 (accès refusé), 500, **maintenance** (message, lien annonces).
- Chapitre indisponible : message précis (« Les pages de ce chapitre ne se chargent pas »), bouton **Réessayer** et **Signaler**.

### 6.13 Pages légales
Mentions légales, confidentialité, **signalement de contenu (DMCA)** : mise en page lisible, sommaire, formulaire de signalement avec accusé de réception.

---

## 7. Composants du système de design

| Composant | Variantes et états |
|---|---|
| **Bouton** | Principal (accent), secondaire, fantôme, danger ; tailles S / M / L ; états survol, focus, désactivé, chargement |
| **Carte série** | Vertical (couverture 2:3 + titre + genre), avec 2 chapitres (sorties récentes), avec rang (classement), avec progression (bibliothèque) |
| **Ligne de chapitre** | Normale, lue, nouvelle, verrouillée |
| **Ligne de nouveauté** | Miniature, titre, chapitre, temps, badges |
| **Badges** | Type (Manga, Manhwa, Manhua), statut, « Nouveau », « +18 », note |
| **Étiquette de fraîcheur** | « Dernières 24 h » (rouge, icône horloge), collée en haut à gauche de la couverture ou du héros, coin arrondi aligné sur l'image ; variante « Nouveau » |
| **Carte héros** | Panneau texte + visuel paysage, coins très arrondis ; version mobile empilée |
| **Ligne « Les plus lus »** | Miniature, rang, titre, auteur, vues |
| **Carte latérale** | Fond `--surface`, titre, contenu (icônes de réseaux, annonces) |
| **Menu déroulant** | Contour fin, libellé + flèche, panneau aligné à droite ; états ouvert, survol, focus |
| **Fil d'Ariane** | Liens soulignés discrets, séparateur `>` |
| **Onglets / chips** | Sélection simple ou multiple, défilement horizontal sur mobile |
| **Modale / tiroir** | Connexion, filtres, réglages du lecteur ; fermeture par `Échap` et clic extérieur ; focus piégé |
| **Champs** | Texte, mot de passe (afficher / masquer), sélection, recherche ; erreur, aide |
| **Étoiles de notation** | Lecture seule, interactif |
| **Barre de progression** | Série, lecteur |
| **Squelettes** | Carte, ligne, hero |
| **Toasts** | Succès, erreur, information ; fermeture automatique en 4 s |
| **Avatar** | Image, initiales, tailles XS à L |
| **Commentaire** | Normal, répondu, masqué par spoiler, signalé |

Chaque composant est documenté (propriétés, états, exemples) et testé en thème sombre et clair.

---

## 8. Accessibilité, performance et qualité

### 8.1 Accessibilité
- WCAG 2.1 AA pour l'interface (hors images de scans).
- Navigation clavier complète, ordre de tabulation logique, **focus visible** (anneau d'accent de 2 px).
- Textes alternatifs sur couvertures (titre de la série), `aria-label` sur les boutons-icônes.
- Zones tactiles ≥ 44 × 44 px.
- Respect de `prefers-color-scheme` (thème par défaut) et `prefers-reduced-motion`.
- Zoom du texte jusqu'à 200 % sans perte de fonctionnalité.

### 8.2 Performance
| Indicateur | Objectif |
|---|---|
| LCP (accueil, 4G) | < 2,5 s |
| CLS | < 0,05 (dimensions des images toujours renseignées) |
| INP | < 200 ms |
| Lighthouse (hors lecteur) | ≥ 90 |
- `srcset` / tailles adaptées pour les couvertures (300 et 600 px), `loading="lazy"` sous la ligne de flottaison, première image du hero prioritaire.
- Polices : sous-ensemble, `font-display: swap`.
- Carrousel et graphiques chargés à la demande.

### 8.3 Compatibilité
Deux dernières versions de Chrome, Firefox, Safari, Edge ; iOS Safari et Chrome Android ; PWA installable.

---

## 9. Mise en œuvre technique recommandée

| Sujet | Choix |
|---|---|
| Framework | Next.js (App Router), composants serveur par défaut |
| Style | Tailwind CSS avec **jetons** (variables CSS) pour thèmes sombre et clair |
| Composants | shadcn/ui (Radix) pour modales, onglets, menus accessibles |
| Icônes | lucide-react |
| Polices | `next/font` |
| Animations | CSS en priorité ; bibliothèque d'animation seulement pour le carrousel si nécessaire |
| Images | `<img>` avec dimensions connues pour les pages de scans ; pas d'optimisation Vercel pour ces fichiers (voir cahier images) |
| Documentation | Storybook (ou page de démonstration interne) des composants |
| Internationalisation | Textes dans des fichiers de langue dès le départ (français d'abord) |

---

## 10. Contenu +18 dans l'interface
- Contenu +18 **masqué** par défaut dans catalogue, nouveautés, recherche, classement et recommandations.
- Bouton **Afficher le contenu +18** (catalogue) et préférence de compte ; clic → **fenêtre de validation** : « J'ai 18 ans ou plus » / « Quitter » (déclaration simple, sans vérification d'identité).
- Badge **+18** sur les cartes concernées ; couverture floutée tant que le gate n'est pas validé (flou appliqué côté serveur).
- Aucun contenu +18 dans les images de partage, les notifications ni les extraits visibles sans validation.
- Pages +18 en `noindex`.

---

## 11. Livrables et phases

| Phase | Contenu | Durée indicative |
|---|---|---|
| 1. Fondations DA | Jetons (couleurs, typo, espacements), thèmes sombre / clair, composants de base (bouton, carte, badge, champs) | 1 semaine |
| 2. Maquettes | Accueil, Nouveautés, Catalogue, Fiche série, Lecteur, Bibliothèque, Connexion (mobile et desktop) | 1 à 2 semaines |
| 3. Intégration pages publiques | Accueil, Nouveautés, Catalogue, Recherche, Fiche série | 2 semaines |
| 4. Lecteur | Trois modes, réglages, raccourcis, fin de chapitre | 2 semaines |
| 5. Espace membre | Bibliothèque, profil, statistiques, modales de compte | 1 à 2 semaines |
| 6. Finitions | Accessibilité, performance, états vides et erreurs, PWA | 1 semaine |

**Livrables :** maquettes, bibliothèque de composants documentée, pages intégrées, rapport d'accessibilité et de performance.

### 11.1 Critères de recette
1. Toutes les pages sont utilisables au clavier et au doigt, sur mobile et desktop.
2. Contrastes AA validés en thèmes sombre et clair.
3. Aucun saut de mise en page visible au chargement des couvertures et des pages (CLS < 0,05).
4. L'accueil se charge en moins de 2,5 s (LCP) en 4G.
5. La page Nouveautés regroupe correctement les chapitres des 7 derniers jours, par jour.
6. Le lecteur masque et réaffiche ses barres, mémorise ses réglages et reprend à la bonne page.
7. Les blocs d'accueil vides disparaissent proprement.
8. Le contenu +18 reste masqué et flouté tant que le gate n'est pas validé.

---

## 12. Points à confirmer
1. **Mesure des couleurs** : valider ou corriger les valeurs estimées (section 3.2) avec une pipette sur les captures ou le site de référence.
2. **Identité** : nom, logo et accent définitifs (rouge corail proposé, proche de l'étiquette « Dernières 24 h »).
3. **Vues affichées publiquement** : le compteur de vues par chapitre (« 259,4 k ») doit-il être visible partout (cartes, classement) ?
4. **Héros de la page Nouveautés** : choix éditorial ou automatique (dernier chapitre, plus lu des 24 h) ?
5. **Jours précédents** : découpage « Hier, il y a 2 jours… » à valider (non visible sur les captures).
6. **Clic sur une carte** : ouvrir le dernier chapitre ou la fiche série ?
7. **Thème** : sombre uniquement au lancement, ou sombre + clair ?
8. **Catalogue** : pagination classique ou « Charger plus » avec compteur ?
9. **Classement** : jour, semaine, mois, tout temps dès la V1 ?
10. **Gamification** (points, décorations de profil à la manière de Mangas Origines) : prévue en V2 ?
11. **Langues** : français uniquement ? (les pastilles de langues de MANGA Plus ne sont pas reprises).
12. **Captures supplémentaires** : lecteur, fiche série et version mobile de MANGA Plus pour compléter les sections 6.5 et 6.6.
