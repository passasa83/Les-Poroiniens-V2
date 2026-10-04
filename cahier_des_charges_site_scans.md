# Cahier des charges : Site de lecture de scans manga

**Version :** 1.2
**Date :** 4 octobre 2026
**Statut :** Brouillon à valider

---

## 1. Contexte et objectifs

### 1.1 Contexte
Refonte / création d'une plateforme de lecture de scans manga. Un site existant sert de référence : **15 350 visiteurs uniques sur la période du 2 septembre au 2 octobre 2026**, avec en moyenne **une dizaine de chapitres ajoutés par semaine**.

### 1.2 Objectifs
- Offrir une lecture fluide, rapide et agréable sur mobile et desktop.
- Proposer un système de compte complet (suivi, commentaires, statistiques personnelles).
- Fournir un back-office complet pour gérer le catalogue, les imports et les recommandations.
- Garantir un cloisonnement strict des droits : certaines actions sont réservées au **Gérant** (propriétaire), pas même aux administrateurs.
- Isoler le contenu **+18** derrière une déclaration d'âge (sans vérification d'identité).

### 1.3 Contraintes imposées
| Élément | Choix |
|---|---|
| Hébergement front / API | **Vercel** |
| Base de données / Auth / Storage | **Appwrite auto-hébergé** |
| Fichiers des scans (pages de chapitres) | **NAS personnel avec accès API** |
| Google Drive | Ressources liées aux **séries** uniquement (pas les pages de scans) |
| Monétisation | **Aucune publicité** |
| Langue de l'interface | Français (i18n prévue pour d'autres langues) |

---

## 2. Périmètre

### 2.1 Inclus
- Site public (catalogue, fiches séries, lecteur).
- Comptes utilisateurs, bibliothèque, historique, commentaires, stats.
- Back-office admin et espace Gérant.
- Import de contenu (upload direct et via Google Drive).
- Gestion des recommandations.
- Gate +18.

### 2.2 Exclu (version 1)
- Application mobile native.
- Paiement / abonnement premium.
- Vérification d'identité ou d'âge.
- Traduction automatique des pages.

---

## 3. Dimensionnement

### 3.1 Base de départ (site actuel)
- 15 350 visiteurs uniques / mois, soit **~510 / jour** en moyenne.
- ~10 chapitres / semaine, soit **~40 à 45 chapitres / mois**.

### 3.2 Hypothèses de charge (à affiner avec les analytics actuels)
| Indicateur | Hypothèse | Résultat estimé |
|---|---|---|
| Pages vues lecteur par visiteur / mois | 150 à 400 pages | 2,3 M à 6 M de pages vues d'images / mois |
| Poids moyen d'une page (WebP optimisé) | 150 à 300 Ko | 0,4 à 1,8 To / mois de bande passante |
| Pic de trafic | x5 à x10 à la sortie d'un chapitre populaire | ~50 à 100 lecteurs simultanés |
| Croissance prévue | +50 % sur 12 mois | Prévoir marge x2 |

> **Point d'attention :** la bande passante des images est le principal poste de coût et de risque (voir section 5.3).

---

## 4. Rôles et permissions

### 4.1 Rôles
| Rôle | Description |
|---|---|
| **Visiteur** | Non connecté. Lecture du contenu tout public. |
| **Membre** | Compte créé. Bibliothèque, suivi, commentaires, stats. |
| **Modérateur** | Modère les commentaires et les signalements. |
| **Administrateur** | Gère le catalogue (séries, fiches, tags), les recommandations, les utilisateurs. |
| **Gérant (Owner)** | Super-rôle unique (ou très limité en nombre). Contrôle exclusif des imports, de la publication et de la configuration sensible. |

### 4.2 Cloisonnement du contenu (exigence clé)
> Les chapitres ajoutés chaque semaine sont **cloisonnés au Gérant**. Même les administrateurs n'y ont pas accès.

**Interprétation retenue (à confirmer, voir section 18) :**
- Seul le Gérant peut : importer des chapitres, connecter les sources Google Drive, planifier / publier / dépublier / supprimer un chapitre, accéder aux fichiers sources.
- Les administrateurs voient le catalogue (fiches séries) mais **pas** les fichiers de chapitres ni les liens Drive, et ne peuvent pas déclencher d'import.
- Les secrets (clés API Google, clés Appwrite) ne sont accessibles qu'au Gérant.

### 4.3 Matrice des droits
| Action | Visiteur | Membre | Modo | Admin | Gérant |
|---|:-:|:-:|:-:|:-:|:-:|
| Lire contenu tout public | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lire contenu +18 (après gate) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bibliothèque / suivi / historique | ❌ | ✅ | ✅ | ✅ | ✅ |
| Commenter | ❌ | ✅ | ✅ | ✅ | ✅ |
| Modérer commentaires | ❌ | ❌ | ✅ | ✅ | ✅ |
| Créer / éditer fiche série (métadonnées) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Gérer recommandations | ❌ | ❌ | ❌ | ✅ | ✅ |
| Gérer utilisateurs (ban, rôles ≤ Modo) | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Importer des chapitres** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Publier / dépublier / supprimer un chapitre** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Connecter / configurer Google Drive** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Nommer / retirer un Admin** | ❌ | ❌ | ❌ | ❌ | ✅ |
| Voir journal d'audit complet | ❌ | ❌ | ❌ | Partiel | ✅ |
| Configuration site / secrets | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 5. Architecture technique

### 5.1 Stack recommandée
| Couche | Technologie |
|---|---|
| Front + API | **Next.js (App Router, TypeScript)** sur Vercel |
| UI | Tailwind CSS + composants accessibles (shadcn/ui ou équivalent) |
| Auth | **Appwrite Auth** (email/mot de passe, OAuth Google/Discord) |
| Base de données | **Appwrite Databases** (auto-hébergé) |
| Fichiers | **NAS (API)** pour les pages de scans ; Appwrite Storage pour avatars et petits assets ; Google Drive pour les ressources de séries |
| Mails transactionnels | **Aucun fournisseur au départ** (couche `mailer` abstraite, voir 14.3) |
| Tâches asynchrones | Appwrite Functions + Vercel Cron |
| Cache | CDN Vercel + cache HTTP agressif (+ Redis optionnel sur le serveur Appwrite) |
| Monitoring | Sentry + Vercel Analytics + analytics respectueux de la vie privée (Plausible / Umami) |

### 5.2 Schéma logique
```
Navigateur ──► Vercel (Next.js : pages, API routes, middleware)
                  │
                  ├──► Appwrite (auto-hébergé) : Auth, DB, Storage, Functions
                  │
                  ├──► Google Drive API (côté serveur uniquement) : ressources de séries
                  │
                  └──► Génération d'URLs signées ──► CDN (cache) ──► NAS (API)
                                                          └──► Navigateur
```

### 5.3 Gestion des images (point critique)
Les pages de scans sont stockées sur un **NAS exposé via une API**. Le NAS est la source de vérité, mais il ne doit jamais recevoir directement le trafic des lecteurs.

**Exigences :**
- **Un CDN devant le NAS** (ex. Cloudflare) : chaque page est servie depuis le cache après la première lecture, avec `Cache-Control` long + `immutable`. Le NAS ne répond qu'aux requêtes « cache miss ».
- **Aucun octet d'image ne transite par les fonctions Vercel** (coût et limites de bande passante). Vercel génère uniquement des **URLs signées à durée courte** (ou des tokens) pointant vers le CDN.
- Le NAS n'est **jamais exposé directement** : accès uniquement depuis le CDN / reverse proxy (tunnel Cloudflare ou liste d'IP), HTTPS, authentification de l'API par clé, rate limiting.
- **Conversion en WebP/AVIF** et génération de versions mobiles à l'import (ou à la volée avec cache).
- Index des pages d'un chapitre (nom de fichier, taille, ordre) **stocké dans Appwrite** : le lecteur n'interroge jamais le NAS pour lister les fichiers.
- **Disponibilité du NAS** : onduleur, connexion avec upload suffisant, supervision (alerte si l'API ne répond plus), **sauvegarde externe** (3-2-1) car le NAS est un point unique de défaillance.
- Alerte au Gérant si le taux d'erreur de la source dépasse un seuil.

**Rôle de Google Drive :** il n'héberge pas les pages de scans. Il sert uniquement aux **séries** (voir section 6.5).

### 5.4 Points d'attention Vercel
- **Pas de publicité** : le projet reste sans revenus. Vérifier les conditions du plan Hobby au moment du déploiement (usage non commercial) ; passer au plan Pro si la situation évolue (dons, sponsoring, publicité).
- Les images ne passant pas par Vercel, la consommation se limite aux pages HTML, aux appels API et aux fonctions. **Vérifier les quotas actuels** (bande passante, invocations, durée des fonctions) par rapport aux ~15 000 visiteurs uniques / mois.
- Utiliser ISR / cache pour limiter le nombre d'invocations.

### 5.5 Points d'attention Appwrite auto-hébergé
- Sauvegardes automatiques quotidiennes (DB + volumes Storage), test de restauration mensuel.
- Reverse proxy (Traefik/Nginx) avec HTTPS, rate limiting, fail2ban.
- Mises à jour planifiées, environnement de staging séparé.
- Machine dimensionnée pour la charge (min. 4 vCPU / 8 Go RAM conseillé).
- Domaine dédié type `api.votresite.tld`, CORS strictement limité au domaine du site.

---

## 6. Fonctionnalités publiques

### 6.1 Page d'accueil
- Dernières sorties (chapitres récents), séries populaires, recommandations de la rédaction.
- Pour un membre : bloc « Continuer la lecture » et nouveautés des séries suivies.
- Bannière / carrousel géré depuis l'admin.

### 6.2 Catalogue et recherche
- Liste paginée avec filtres : genre, tags, statut (en cours, terminé, hiatus), type (manga, manhwa, manhua), année, langue, note.
- Tris : popularité, nouveautés, ordre alphabétique, note, dernière mise à jour.
- Recherche texte avec tolérance aux fautes, recherche par titres alternatifs et auteurs.
- Le contenu +18 est masqué par défaut dans les listes (voir section 11).

### 6.3 Fiche série
- Couverture, titres (principal + alternatifs), synopsis, auteur / artiste, genres, tags, statut, année.
- Liste des chapitres (tri croissant/décroissant, indicateur lu / non lu pour les membres).
- Bouton Suivre / Ajouter à la bibliothèque, note, partage.
- Séries similaires, commentaires de la série.

### 6.4 Lecteur de scans
- Modes : **vertical continu (webtoon)**, **page par page**, **double page**.
- Sens de lecture : gauche → droite ou droite → gauche.
- Ajustement : largeur, hauteur, plein écran, zoom.
- Navigation : clavier, swipe, zones tactiles, barre de progression, sélecteur de chapitre.
- Préchargement des 2 à 3 pages suivantes, chargement différé (lazy loading) des autres.
- Sauvegarde automatique de la progression (page + chapitre).
- Raccourcis, thème clair / sombre, mémorisation des préférences (compte ou localStorage).
- Bouton « Signaler un problème » (page manquante, mauvaise qualité, mauvais ordre).
- Chapitre précédent / suivant en fin de lecture, avec commentaires du chapitre.

### 6.5 Séries hébergées sur Google Drive
- Google Drive sert **uniquement pour les séries** (dossiers de séries : couvertures, bannières, métadonnées, fichiers annexes). Les **pages de scans des chapitres** sont lues depuis le **NAS** (section 5.3).
- Le serveur lit le Drive via un compte de service (accès en lecture seule, côté serveur uniquement).
- Les ressources utiles sont synchronisées vers la base / le stockage du site pour ne pas dépendre du Drive à chaque affichage.
- Aucun lien Drive n'est visible côté client ; la configuration est réservée au Gérant.
- Gestion des erreurs : dossier déplacé, quota dépassé, fichier manquant (alerte au Gérant, le site continue avec la dernière version synchronisée).

---

## 7. Comptes utilisateurs

### 7.1 Inscription et connexion
- Email + mot de passe, OAuth (Google, Discord).
- Vérification de l'email : **désactivée au lancement** (aucun fournisseur de mails), activable plus tard (voir 14.3). Compensation : captcha + limitation d'inscriptions par IP.
- Réinitialisation du mot de passe : **manuelle par un Admin / le Gérant au lancement**, automatique par lien une fois les mails activés. Changement d'email : via demande au support au lancement. Suppression du compte en libre-service.
- Protection anti-bot (hCaptcha / Turnstile) à l'inscription.
- Sessions multi-appareils avec liste et révocation.
- 2FA (TOTP) optionnel, **obligatoire pour Admin et Gérant**.

### 7.2 Profil
- Pseudo unique, avatar, bio courte, date d'inscription.
- Options de confidentialité : bibliothèque et stats publiques / privées.
- Préférences : langue, thème, sens et mode de lecture par défaut, affichage du contenu +18.

### 7.3 Bibliothèque et suivi
- Statuts par série : *En cours, À lire, Terminé, En pause, Abandonné*.
- Favoris, listes personnalisées (ex. « Mes coups de cœur »).
- Suivi automatique : dernier chapitre lu, chapitres lus, retard par rapport à la dernière sortie.
- Marquer un chapitre lu / non lu manuellement.
- Notifications de nouveau chapitre sur les séries suivies : **in-app uniquement au lancement** ; email (digest quotidien ou hebdomadaire) en phase ultérieure.
- Notation des séries (1 à 10).
- Historique de lecture consultable, supprimable.
- Import / export de la bibliothèque (JSON/CSV).

### 7.4 Statistiques utilisateur
- Chapitres lus, pages lues, temps de lecture estimé, séries terminées.
- Genres préférés, série la plus lue, régularité (série de jours consécutifs).
- Graphiques par semaine / mois / année.
- Badges et paliers (optionnel, V2).

---

## 8. Commentaires

- Commentaires sur **séries** et sur **chapitres**, réponses imbriquées (2 niveaux).
- Édition (fenêtre de 15 min), suppression par l'auteur.
- Likes / dislikes, tri par récents ou populaires.
- Balise **spoiler** masquant le texte jusqu'au clic.
- Signalement par les membres, file de modération avec raison.
- Anti-spam : limite de fréquence, filtre de mots, blocage des liens pour les nouveaux comptes, détection de doublons.
- Mentions `@pseudo` avec notification.
- Sanctions : avertissement, mute temporaire, bannissement (avec motif et journal).
- Commentaires des contenus +18 visibles seulement après validation du gate.

---

## 9. Back-office (Admin et Gérant)

### 9.1 Tableau de bord
- Visiteurs, pages vues, chapitres lus, inscriptions, commentaires (jour / semaine / mois).
- Top séries, top chapitres, taux d'erreur de chargement des images.
- Santé système : état Appwrite, quota Drive, espace disque, dernier backup.
- Alertes : signalements en attente, imports échoués, erreurs en hausse.

### 9.2 Gestion du catalogue (Admin + Gérant)
- CRUD des séries : titres, synopsis, couverture, bannière, genres, tags, auteurs, statut, classification (tout public / +18).
- Gestion des taxonomies : genres, tags, auteurs, éditeurs.
- Fusion de doublons, redirections d'anciennes URLs.
- Mise en avant (home, bannières).

### 9.3 Gestion des utilisateurs (Admin + Gérant)
- Recherche, fiche utilisateur (activité, commentaires, signalements).
- Ban / unban, suppression, mute.
- Attribution du rôle Modérateur. Les rôles Admin et Gérant sont gérés par le Gérant uniquement.

### 9.4 Modération (Modérateur et plus)
- File de signalements (commentaires, problèmes de chapitres).
- Actions en lot, historique des décisions.

### 9.5 Journal d'audit
- Trace de toutes les actions sensibles : qui, quoi, quand, IP, valeur avant / après.
- Non modifiable. Visibilité complète réservée au Gérant.

### 9.6 Paramètres du site (Gérant)
- Nom, logo, SEO par défaut, pages légales, liens réseaux sociaux.
- Gestion des clés et connexions (Google Drive, SMTP, captcha).
- Mode maintenance, bannière d'annonce globale.

---

## 10. Import de contenu (espace Gérant exclusif)

### 10.1 Méthodes d'import
1. **Upload direct** : glisser-déposer d'images, d'un dossier ou d'archives (ZIP / CBZ / RAR) avec tri naturel automatique.
2. **Import depuis le NAS** : sélection d'un dossier du NAS via l'API, détection automatique des chapitres et des pages, aperçu avant publication. Le contenu reste sur le NAS ; seul l'index est enregistré en base.
3. **Synchronisation Google Drive (séries)** : import des couvertures, bannières et métadonnées d'une série depuis son dossier Drive.
4. **Import par lot** : plusieurs chapitres à la fois, avec règles de nommage (`Chapitre 12`, `Ch.12.5`, `Vol.2 Ch.15`).

### 10.2 Pipeline de traitement
1. Validation (types autorisés, taille max, détection de pages corrompues, vérification de l'accessibilité via l'API du NAS).
2. Tri naturel et détection des pages manquantes / doublons.
3. Conversion en WebP/AVIF, génération de miniatures et de versions mobiles.
4. Écriture sur le NAS (upload direct) ou indexation des fichiers déjà présents, puis enregistrement de l'index en base.
5. Aperçu du chapitre dans le lecteur avant publication.

### 10.3 Publication
- Brouillon → Programmé → Publié.
- **Publication planifiée** (date et heure), publication immédiate, dépublication.
- Cadence prévue : environ 10 chapitres / semaine, avec calendrier éditorial visuel.
- Réorganisation des pages par glisser-déposer, remplacement ou suppression d'une page.
- Historique des versions d'un chapitre, restauration possible.
- Option « notifier les abonnés » à la publication.
- Suivi des tâches d'import en temps réel (file d'attente, progression, erreurs, relance).

---

## 11. Contenu +18

### 11.1 Principe
Une partie du catalogue est classée **+18**. L'accès est conditionné à une **déclaration d'âge simple** (« J'ai 18 ans ou plus »). **Aucune vérification d'identité ou d'âge n'est réalisée.**

### 11.2 Exigences
- Fenêtre de validation (modale) au premier accès à un contenu +18 : bouton « J'ai 18 ans ou plus » / « Quitter ».
- Mémorisation du choix : cookie (visiteur) et préférence du compte (membre), durée configurable (ex. 30 jours pour visiteur).
- Contenu +18 **masqué par défaut** : absent des listes, de la recherche, de la home et des recommandations tant que le gate n'est pas validé (option dans le profil pour l'activer définitivement).
- Couvertures floutées tant que le gate n'est pas validé.
- Pages +18 marquées `noindex` et en-tête `rating: adult` (balise `<meta name="rating" content="adult">`).
- Aucune image +18 dans les aperçus de partage (Open Graph) ni dans les notifications.
- Le classement +18 se définit par série et peut être surchargé par chapitre.
- Journal d'acceptation (horodatage anonymisé) conservé pour traçabilité.

---

## 12. Recommandations

### 12.1 Gestion éditoriale (Admin + Gérant)
- Sélections manuelles : « Coup de cœur de la rédaction », « À découvrir », collections thématiques.
- Placement : home, fiche série, fin de chapitre.
- Ordre, dates de début / fin, activation / désactivation.

### 12.2 Recommandations automatiques
- « Séries similaires » basées sur genres / tags en commun.
- « Les lecteurs de X ont aussi lu » basé sur les bibliothèques.
- Recommandations personnalisées pour les membres selon l'historique et les notes.
- Possibilité de masquer une recommandation (« pas intéressé »).
- Les recommandations respectent le gate +18.

---

## 13. Modèle de données (Appwrite)

| Collection | Champs principaux |
|---|---|
| `series` | id, slug, titre, titres_alt[], synopsis, couverture, bannière, statut, type, année, classification (`all`/`adult`), genres[], tags[], auteurs[], note_moy, nb_votes, vues, created_at, updated_at |
| `chapters` | id, series_id, numéro, volume, titre, statut (`draft`/`scheduled`/`published`), publish_at, source (`nas`), nb_pages, classification, vues, created_by |
| `pages` | id, chapter_id, index, chemin_nas, largeur, hauteur |
| `sources_drive` | id, series_id, drive_folder_id, config, last_sync *(séries uniquement, accès Gérant)* |
| `sources_nas` | id, chapter_id, chemin_nas, hash, taille, last_check *(accès Gérant uniquement)* |
| `import_jobs` | id, type, statut, progression, erreurs[], created_by, created_at |
| `profiles` | user_id, pseudo, avatar, bio, préférences, confidentialité, adult_ok, adult_ok_at |
| `library` | user_id, series_id, statut, favori, note, last_chapter_id, updated_at |
| `reading_history` | user_id, chapter_id, page, completed, read_at |
| `reading_stats` | user_id, période, pages, chapitres, minutes |
| `comments` | id, target_type, target_id, parent_id, user_id, contenu, spoiler, likes, statut, created_at |
| `reports` | id, type, target_id, reporter_id, raison, statut, handled_by |
| `recommendations` | id, placement, series_id, ordre, début, fin, actif |
| `notifications` | user_id, type, payload, lu, created_at |
| `audit_log` | id, actor_id, action, cible, avant, après, ip, created_at |
| `site_settings` | clé, valeur *(accès Gérant uniquement)* |

### Permissions Appwrite
- Utilisation des **Teams / Labels** Appwrite pour les rôles (`modo`, `admin`, `owner`).
- Permissions au niveau document : un membre ne lit / écrit que ses propres données (`library`, `reading_history`, `profiles`).
- Collections `sources_drive`, `sources_nas`, `import_jobs`, `site_settings` : **accessibles uniquement au label `owner`**.
- Les actions sensibles passent par des Functions / API routes qui vérifient le rôle côté serveur (jamais de confiance au client).
- Index sur : `series.slug`, `chapters.series_id + numéro`, `library.user_id`, `comments.target_id`.

---

## 14. Spécification des systèmes API

Cette section reprend les mécanismes utiles de l'ancien site (Cloudflare Functions + D1 + KV + R2), adaptés à Next.js (routes API / Server Actions) et Appwrite.

### 14.1 Règles communes à toutes les routes
- Toute **écriture est authentifiée** ; l'identité vient de la session serveur, **jamais** d'un `user_id` envoyé par le client.
- Validation des entrées par schéma (Zod) : types, longueurs, listes plafonnées.
- Limitation de débit par IP et par utilisateur (inscription, connexion, commentaires, likes, upload).
- CORS limité au domaine du site ; aucun `*`.
- Erreurs uniformes (`{ error, code }`), sans détails internes ; échappement HTML de tout contenu affiché.
- Secrets uniquement en variables d'environnement (Vercel / serveur Appwrite), jamais dans le dépôt.

### 14.2 Authentification, sessions et rôles
- **Appwrite Auth** remplace l'auth maison (hash, sessions, tokens). Sessions en cookie `HttpOnly; Secure; SameSite=Lax`, durée 30 jours.
- Helper serveur `getCurrentUser()` (profil + rôle), appelé **une seule fois par requête** (plus d'appel HTTP interne à `/me`). Le rôle vient des **labels** Appwrite : `modo`, `admin`, `owner`.
- Message d'erreur unique à la connexion (pas de distinction email / mot de passe).
- 2FA obligatoire pour Admin et Gérant.

### 14.3 Mails : aucun fournisseur au lancement
Aucun service d'envoi (Resend ou autre) n'est utilisé au départ. Conséquences et prévisions :
- Une interface `mailer.send({ to, subject, html })` est prévue dans le code avec une implémentation « désactivée » (journalise sans envoyer). Brancher plus tard Resend ou un SMTP ne demande pas de refonte.
- **Au lancement :** pas de vérification d'email, pas de reset automatique (reset manuel depuis le back-office), pas de notifications par email.
- **Plus tard :** vérification d'email, lien de réinitialisation à usage unique (30 min), changement d'email par confirmation, digest de nouveaux chapitres.
- Tant que les mails sont désactivés, protéger l'inscription autrement : captcha, limitation par IP, liste de domaines jetables bloqués (optionnel).

### 14.4 Préférences utilisateur
- Objet `preferences` JSON extensible dans `profiles` : thème, sens et mode de lecture, langue, affichage +18, notifications, **liste de tags masqués**.
- Validation de la liste de tags masqués : tableau de chaînes, `trim`, dédoublonnage insensible à la casse, **80 éléments maximum**.
- Seuls les champs connus sont fusionnés ; les autres sont ignorés.
- Permission : lecture / écriture réservées au propriétaire.

### 14.5 Avatars
- Compression et redimensionnement **côté client** en WebP 256×256, **800 Ko maximum**.
- Côté serveur : vérification du type réel (octets d'en-tête) et de la taille, stockage dans un bucket Appwrite dédié, nom `avatars/{userId}.webp`.
- URL stable avec paramètre de version (`?v=`) pour invalider le cache après changement ; `Cache-Control` long via le CDN.

### 14.6 Contrôle d'accès
- Rangs : visiteur < membre < modo < admin < gérant. Champ `access_level` (rang minimal) sur les séries et chapitres.
- Vérification **côté serveur à chaque requête** : pages (`middleware.ts`), données (permissions Appwrite) et index de pages d'un chapitre.
- Les tags masqués par l'utilisateur et le gate +18 sont aussi appliqués côté serveur, y compris pour l'accès direct par URL.
- Page 403 dédiée.

### 14.7 Pages d'un chapitre depuis le NAS
- Le **listing des fichiers est fait une fois à l'import** (`GET {NAS_API}/list?path=`) puis stocké dans la collection `pages`. Le lecteur n'appelle jamais le NAS pour lister.
- L'appel au NAS est authentifié par clé secrète, limité aux IP / au tunnel autorisés ; le paramètre `path` est validé et normalisé (anti path traversal) ; l'URL de base est en variable d'environnement.
- Lecture : `GET /api/chapters/:id/pages` vérifie l'accès, puis renvoie des **URLs signées à durée courte** vers le CDN (voir 5.3).
- Réponses avec en-tête `X-Cache: HIT/MISS` pour faciliter le diagnostic.

### 14.8 Likes, commentaires et statistiques
- Collections dédiées : `comments`, `comment_likes`, `chapter_likes`, avec **contrainte d'unicité** `(user_id, target_id)` pour interdire les likes multiples.
- Le client envoie ses actions **par lots** (anti-rafale) à une route authentifiée ; le serveur vérifie, applique et met à jour les compteurs.
- L'identifiant d'un commentaire est généré côté serveur. Longueur maximale, filtre anti-spam, échappement, limitation de débit.
- Statistiques publiques par série : `GET /api/series/:slug/stats`, mises en cache 60 s (`revalidate`).
- Si une agrégation différée reste utile, elle est lancée par une **Vercel Cron protégée par secret**, jamais par une route ouverte.

### 14.9 SEO, slugs et images de partage
- Slugs stables stockés en base ; table de redirections **301** des anciennes URLs publiques de l'ancien site.
- Métadonnées par `generateMetadata()` (valeurs échappées) ; images Open Graph générées par série avec `next/og`.
- Recherche : index et recherche texte Appwrite (plus de gros fichier JSON chargé par le client).

### 14.10 Routes principales
| Route | Méthode | Accès |
|---|---|---|
| `/api/me` | GET | Membre |
| `/api/account/profile` | PATCH | Membre (propriétaire) |
| `/api/account/preferences` | PATCH | Membre (propriétaire) |
| `/api/account/avatar` | POST | Membre (propriétaire) |
| `/api/chapters/:id/pages` | GET | Selon `access_level` |
| `/api/reading/progress` | POST (lots) | Membre |
| `/api/chapters/:id/like` | POST / DELETE | Membre |
| `/api/comments` | POST | Membre |
| `/api/comments/:id` | PATCH / DELETE | Auteur ou modo+ |
| `/api/comments/:id/like` | POST / DELETE | Membre |
| `/api/reports` | POST | Membre |
| `/api/series/:slug/stats` | GET | Public (cache 60 s) |
| `/api/owner/import` | POST | **Gérant uniquement** |
| `/api/cron/*` | GET | Secret de cron |

### 14.11 Failles de l'ancien code à ne pas reproduire
1. Likes et commentaires sans authentification ni limite de débit.
2. Traitement des logs déclenchable par n'importe qui.
3. CORS `*` sur plusieurs endpoints.
4. Réponse « aucun compte » au reset de mot de passe (énumération d'emails).
5. Pas de captcha ni de limitation à l'inscription.
6. Appel HTTP interne à `/me` à chaque requête.
7. Balises Open Graph injectées sans échappement.
8. Appel au NAS sans clé d'authentification et chemin non validé.
9. Identifiants de commentaires générés par le client.
10. Secrets d'administration prévus dans le fichier de configuration du dépôt.

---

## 15. Exigences non fonctionnelles

### 14.1 Performance
- LCP < 2,5 s sur 4G, première page d'un chapitre affichée en < 1,5 s.
- Pages de catalogue en ISR / SSG avec revalidation à la publication d'un chapitre.
- Score Lighthouse ≥ 90 (hors lecteur).

### 14.2 Sécurité
- HTTPS partout, HSTS, CSP stricte, protection CSRF.
- Rate limiting sur login, commentaires, inscriptions, proxy d'images.
- Protection anti-scraping basique (limitation par IP, URLs d'images signées à durée courte, règles du CDN).
- Clés d'accès à l'API du NAS stockées uniquement côté serveur, rotation régulière.
- Secrets uniquement en variables d'environnement Vercel / serveur Appwrite.
- Validation et sanitization de toutes les entrées (commentaires, uploads).
- 2FA obligatoire pour les rôles Admin et Gérant.
- Sauvegardes chiffrées, plan de reprise documenté.

### 14.3 SEO
- URLs propres : `/serie/{slug}`, `/serie/{slug}/chapitre-{n}`.
- Métadonnées dynamiques, sitemap automatique, données structurées.
- Contenu +18 en `noindex`.

### 14.4 Accessibilité et compatibilité
- Responsive mobile-first, WCAG 2.1 AA pour l'interface (hors images de scans).
- Navigateurs : 2 dernières versions de Chrome, Firefox, Safari, Edge.

### 14.5 Données personnelles (RGPD)
- Bannière de consentement cookies, politique de confidentialité.
- Droit d'accès, d'export et de suppression depuis le profil.
- Minimisation : pas de données inutiles, IP anonymisées dans les stats.
- Mentions légales avec identité de l'éditeur et de l'hébergeur.

---

## 16. Conformité légale et risques

> Cette section n'est pas un avis juridique. Le Gérant est responsable de la conformité du site.

- **Droits d'auteur :** la diffusion de scans de séries protégées sans autorisation des ayants droit expose à des demandes de retrait, à des suspensions d'hébergement et à une responsabilité juridique. Il est vivement recommandé de ne diffuser que du contenu dont les droits sont détenus ou autorisés.
- **Procédure de retrait :** mettre en place une page de signalement (notice and takedown) avec adresse de contact dédiée et un processus de dépublication rapide depuis l'espace Gérant.
- **Conditions des fournisseurs :** Vercel, Google Drive et l'hébergeur du serveur Appwrite ont leurs propres conditions d'utilisation. Un contenu signalé peut entraîner la suppression de fichiers ou la suspension de comptes. Prévoir une sauvegarde indépendante des contenus et une solution de repli.
- **Contenu +18 :** une simple déclaration d'âge peut ne pas suffire selon la nature du contenu et la législation applicable (en France, les contenus pornographiques sont soumis à des obligations de vérification d'âge encadrées par l'Arcom). Le type de contenu +18 hébergé doit être évalué avec un conseil juridique.
- **Commentaires :** responsabilité d'hébergeur, mécanisme de signalement obligatoire, conservation des logs selon la réglementation.

---

## 17. Livrables et planning indicatif

### Phase 1 : MVP (6 à 8 semaines)
- Auth et profils (sans mails, voir 14.3), catalogue, fiche série, lecteur (3 modes), gate +18.
- Socle API : règles communes (14.1), contrôle d'accès (14.6), pages via NAS (14.7).
- Back-office : séries, chapitres, rôles, **import Gérant** (upload + Google Drive).
- Proxy d'images + cache.

### Phase 2 : Communauté (4 à 5 semaines)
- Bibliothèque et suivi, historique, notifications in-app.
- Commentaires, signalements, modération.
- Statistiques utilisateur.

### Phase 3 : Optimisation (3 à 4 semaines)
- Recommandations (manuelles + automatiques).
- Activation des mails (fournisseur à choisir : vérification d'email, reset automatique, digest).
- Dashboard admin avancé, journal d'audit, publication planifiée avancée.
- Optimisations de performance, SEO, 2FA, durcissement sécurité.

### Livrables
- Code source versionné (Git), documentation d'installation Appwrite et d'exploitation.
- Scripts de migration depuis le site actuel (comptes, bibliothèques, commentaires si applicable).
- Environnements : local, staging, production.
- Documentation utilisateur du back-office.

---

## 18. Points à confirmer

Validé : cloisonnement Gérant / Admin, scans sur NAS avec API, Drive limité aux séries, pas de publicité.

1. **Rôle exact de Google Drive :** j'ai compris qu'il héberge les ressources des séries (couvertures, métadonnées, fichiers annexes) et non les pages de scans. Confirmes-tu ?
2. **NAS :** modèle / marque, type d'API (REST maison, WebDAV, S3 compatible ?), débit montant de la connexion, et existence d'une sauvegarde externe.
3. **CDN :** accord pour placer un CDN (ex. Cloudflare) devant le NAS ? C'est fortement recommandé vu le volume estimé.
4. **Fournisseur de mails (plus tard) :** Resend, SMTP existant ou autre ? À quel moment l'activer ?
5. **Nombre de Gérants :** un seul compte ou plusieurs ?
6. **Migration :** faut-il migrer les comptes et données du site actuel ?
7. **Langues :** uniquement le français ou multilingue dès la V1 ?
8. **Nature du contenu +18 :** niveau de contenu concerné (impact légal sur le gate).
9. **Budget infrastructure mensuel** visé (Vercel, serveur Appwrite, CDN).
