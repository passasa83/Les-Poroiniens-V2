# Cahier des charges : exploitation du système d'images (NAS + Cloudflare) sur le nouveau site

**Version :** 1.0
**Date :** 4 octobre 2026
**Site cible :** https://les-poroiniens-v2.vercel.app/ (Next.js sur Vercel, Appwrite auto-hébergé)
**Document lié :** `cahier_des_charges_site_scans.md` (sections 5.3, 6.4, 10 et 14.7)

---

## 1. Objet

Décrire comment reprendre sur le nouveau site le système d'images de l'ancien : **NAS → API de listing → Cloudflare → navigateur**, en gardant ce qui fonctionnait (CDN devant le NAS, domaines `img.` et `api-img.`) et en corrigeant ses limites (liste d'URLs recalculée à chaque lecture, chargement bloquant, aucune protection d'accès, aucune dimension connue à l'avance).

### 1.1 État observé du nouveau site (4 octobre 2026)
- Pages en ligne : accueil, catalogue (filtres genre, statut, type, année, tris, bouton « Afficher le contenu +18 »), recherche, bibliothèque, connexion / inscription, mentions légales, confidentialité, page DMCA.
- Le catalogue est **vide** (« Aucune série ne correspond ») et les blocs « Dernières sorties » et « Séries populaires » de l'accueil n'affichent rien : **aucun contenu n'est encore branché**.
- Le texte du site annonce : aucune publicité, bouton « Signaler un problème » dans le lecteur.
- Je n'ai pas pu vérifier le lecteur, l'espace Gérant ni l'API : ce cahier décrit donc la cible, pas l'état du code.

### 1.2 Objectifs
1. Afficher un chapitre en moins de 1,5 s après le clic (première page visible).
2. Ne jamais solliciter le NAS pour une lecture normale : tout vient du cache Cloudflare.
3. Connaître les dimensions de chaque page avant de la charger (pas de saut de mise en page, calcul des doubles pages immédiat).
4. Protéger les chapitres non publiés (cloisonnement Gérant) et limiter la récupération massive.
5. Permettre au Gérant d'importer un chapitre depuis le NAS en quelques clics.

---

## 2. Architecture cible

```
                       ┌─────────────────────────────────────────┐
  Import (Gérant)      │  NAS                                    │
  ───────────────────► │  /content/<serie>/<chapitre>/001.webp … │
  /api/owner/import    │  API locale : /list /tree /health       │
        │              └───────────────▲──────────────▲──────────┘
        │                              │ tunnel       │ tunnel
        ▼                              │              │
  Next.js (Vercel) ──► api-img.<domaine> (Cloudflare Access, privé)
        │  écrit l'index                              
        ▼                                             
  Appwrite : chapters / pages (URL relative, largeur, hauteur, hash)
        ▲
        │ GET /api/chapters/:id/pages  (contrôle d'accès + index)
        │
  Navigateur (lecteur) ──► img.<domaine>/… ──► Cloudflare (cache) ──► NAS (cache miss uniquement)
```

### 2.1 Les deux domaines (hérités de l'ancien site)
| Domaine | Rôle | Accès |
|---|---|---|
| `img.lesporoiniens.org` | Sert les fichiers (pages de chapitres, couvertures, bannières) | **Public** via Cloudflare, protégé (section 6) |
| `api-img.lesporoiniens.org` | API de listing et d'administration du NAS | **Privé** : appelée uniquement par le serveur du site (Cloudflare Access ou clé secrète) |

### 2.2 Ce qui change par rapport à l'ancien site
| Ancien | Nouveau |
|---|---|
| Liste des pages demandée au NAS à chaque première lecture (cache KV 30 j) | Liste récupérée **une seule fois à l'import**, stockée dans Appwrite |
| Dimensions des pages inconnues avant chargement | Largeur / hauteur **stockées en base** |
| Le lecteur attend que **toutes** les images soient chargées | Première page affichée tout de suite, le reste en chargement différé |
| `api-img` accessible sans authentification (CORS `*`) | `api-img` privée, appelée côté serveur uniquement |
| URLs de fichiers prévisibles et publiques, sans version | URLs versionnées (`?v=hash`) + protection anti-hotlink + URLs signées pour le non publié |
| Cache 30 jours sans invalidation | Invalidation à l'import (purge ciblée Cloudflare + hash dans l'URL) |
| ImgChest en source de secours (scraping) | Supprimé |

---

## 3. Organisation du NAS

> Convention déduite des anciennes URLs (`<Série>/<Chapitre N>`). À valider avec la structure réelle du NAS.

### 3.1 Arborescence recommandée
```
/content/
  public/                         ← servi par img.<domaine>
    <slug-serie>/
      cover.webp
      banner.webp
      chapitres/
        0001/001.webp 002.webp …
        0002/…
  staging/                        ← NON servi publiquement (brouillons, chapitres programmés)
    <slug-serie>/chapitres/0003/…
```

### 3.2 Règles de nommage
- Dossiers de série : **slug** stable (minuscules, tirets), identique au slug en base. Le titre d'affichage reste en base, pas dans le chemin.
- Chapitres : numéro **sur 4 chiffres avec zéros** (`0012`), décimaux avec suffixe (`0012.5` → `0012-5`).
- Pages : numérotation sur 3 chiffres minimum (`001.webp`), pour que le tri alphabétique corresponde à l'ordre de lecture.
- Aucun espace ni caractère spécial dans les chemins (l'ancien site utilisait des titres avec espaces, deux-points et apostrophes, ce qui complique l'encodage des URLs).

### 3.3 Formats
- WebP (ou AVIF) pour les pages, largeur maximale 1600 px, qualité ajustée par l'import.
- Couvertures : 600×900 et 300×450. Bannières : 1600×500.
- Les JPEG / PNG déposés sont convertis à l'import ; l'original est conservé hors de `public/`.

### 3.4 Passage de `staging/` à `public/`
La publication d'un chapitre **déplace** (ou lie) le dossier de `staging/` vers `public/` et passe le chapitre à `published` en base. Tant qu'il est dans `staging/`, aucune URL publique n'existe.

---

## 4. API du NAS (contrat)

L'API existante expose au minimum `GET /list?path=…`. Le contrat ci-dessous indique ce qui est à **conserver**, **ajouter** ou **vérifier**.

### 4.1 Endpoints
| Endpoint | Statut | Description |
|---|---|---|
| `GET /list?path=<chemin>` | Existant | Liste des pages d'un dossier de chapitre |
| `GET /tree?path=<chemin>` | À ajouter | Liste séries / chapitres d'un dossier (pour l'écran d'import) |
| `GET /health` | À ajouter | État du NAS : disponibilité, espace disque libre, temps de réponse |
| `POST /move` | À ajouter | Déplace `staging/` → `public/` (publication) |
| `POST /purge-hint` | Optionnel | Renvoie la liste des chemins modifiés pour la purge Cloudflare |

### 4.2 Réponse de `/list` (format cible)
```json
{
  "path": "public/one-piece/chapitres/0012",
  "count": 3,
  "pages": [
    { "name": "001.webp", "path": "public/one-piece/chapitres/0012/001.webp",
      "width": 1200, "height": 1800, "bytes": 184320, "hash": "a1b2c3d4e5f6", "mtime": 1759500000 }
  ]
}
```
- L'ancienne réponse (liste simple d'URLs) reste disponible avec `?format=urls` pour la compatibilité.
- Tri naturel garanti côté API (`2` avant `10`).
- `width` / `height` / `hash` sont **nouveaux** : calculés à l'import et mis en cache sur le NAS (pas à chaque appel).

### 4.3 Sécurité de l'API
- Protégée par **Cloudflare Access (service token)** ou clé `X-Api-Key` ; jamais appelée depuis le navigateur.
- Paramètre `path` : normalisé, interdit les `..`, limité à `/content/`.
- CORS fermé (aucun `*`), pas de messages d'erreur techniques renvoyés au client.
- Limite de débit (ex. 30 requêtes / minute) et journalisation des appels.

---

## 5. Import et publication (espace Gérant)

### 5.1 Flux
1. Le Gérant ouvre l'écran d'import et choisit une série (liste fournie par `/tree`).
2. Le serveur appelle `/list` pour chaque chapitre sélectionné et affiche un **aperçu** : nombre de pages, pages manquantes dans la numérotation, doublons de hash, pages inhabituelles (taille, ratio).
3. Validation : le serveur écrit l'index dans Appwrite (`chapters`, `pages`, `sources_nas`).
4. Choix du statut : brouillon, programmé (date / heure) ou publié.
5. À la publication : `POST /move` (staging → public), puis purge ciblée du cache Cloudflare si une page a été remplacée.

### 5.2 Données stockées par page
| Champ | Exemple |
|---|---|
| `chapter_id` | `ch_9f2c…` |
| `index` | `1` |
| `path` | `public/one-piece/chapitres/0012/001.webp` (relatif, sans domaine) |
| `width` / `height` | `1200` / `1800` |
| `bytes` | `184320` |
| `hash` | `a1b2c3d4e5f6` |

L'URL finale est construite à la volée : `${IMG_BASE_URL}/${path}?v=${hash.slice(0,8)}`. Changer de domaine ou de CDN ne demande aucune migration de données.

### 5.3 Cas particuliers
- **Remplacement d'une page** : nouveau fichier, nouveau hash, nouvelle URL (le cache navigateur et Cloudflare ne servent pas l'ancienne version).
- **Réordonnancement** : modification de `index` en base uniquement, aucun fichier déplacé.
- **Suppression d'une page** : retrait de l'index, fichier conservé 30 jours dans une corbeille NAS.
- **NAS indisponible à l'import** : message clair, aucune écriture partielle (import transactionnel par chapitre).
- **Reprise** : un import interrompu peut être relancé sans doublons (clé unique `chapter_id + index`).

---

## 6. Distribution par Cloudflare

### 6.1 Cache
- Règle de cache sur `img.<domaine>/public/*` : **mettre en cache tout**, TTL de bord long (1 an), `Cache-Control: public, max-age=31536000, immutable` (possible car l'URL change avec le hash).
- Tiered Cache activé pour réduire les requêtes vers le NAS.
- Objectif : **taux de cache hit supérieur à 95 %** après la première semaine de lecture d'un chapitre.

### 6.2 Protection anti-hotlink
- Règle (Hotlink Protection ou règle WAF) : refuser les requêtes dont le `Referer` n'est ni vide ni issu des domaines du site.
- **Attention :** l'ancien site utilisait `referrerpolicy="no-referrer"` sur les images, ce qui supprime le Referer et rendrait cette règle inopérante. Le nouveau site doit conserver la politique par défaut (`strict-origin-when-cross-origin`).
- Ce contrôle limite les liens directs depuis d'autres sites ; il n'empêche pas un moissonnage automatisé (voir 6.4).

### 6.3 Chapitres non publiés et accès restreint
- Le dossier `staging/` n'est **pas exposé** par le tunnel.
- Pour prévisualiser un brouillon (Gérant), un **Worker Cloudflare** vérifie une URL signée (HMAC + expiration de 5 à 15 minutes) avant de servir le fichier depuis une route dédiée.
- La même mécanique peut protéger des chapitres à accès restreint (rôle minimal) si le niveau d'accès du chapitre l'exige : l'API Next.js renvoie alors des URLs signées plutôt que des URLs publiques.

### 6.4 Limitation du moissonnage
- Règle de limitation de débit par IP sur `img.` (seuil à calibrer sur le trafic réel : un lecteur normal charge 20 à 80 pages par chapitre).
- Règles WAF / Bot Fight sur les agents suspects ; liste noire d'IP en cas d'abus.
- Les URLs ne sont fournies qu'à travers `/api/chapters/:id/pages` (contrôle d'accès + limite de débit côté site).

### 6.5 Liaison NAS ↔ Cloudflare
- Utiliser **Cloudflare Tunnel** (aucun port ouvert sur le réseau local, aucune IP publique exposée).
- Le tunnel n'expose que les chemins prévus : `/content/public/*` pour `img.`, l'API pour `api-img.`.
- Connexion de repli : si le tunnel tombe, `img.` répond une erreur propre (page 503 courte), jamais une page d'erreur détaillée.

### 6.6 À vérifier selon le plan Cloudflare utilisé
Le nombre de règles WAF, de règles de limitation de débit, la validation de signatures HMAC dans les règles et les quotas Workers dépendent du plan. À confirmer avant l'implémentation ; si une fonction manque, utiliser un Worker.

---

## 7. Intégration sur le site Next.js

### 7.1 Route de lecture
`GET /api/chapters/:id/pages`
1. Vérifie la session et le niveau d'accès du chapitre.
2. Lit l'index des pages dans Appwrite.
3. Renvoie `{ pages: [{ url, width, height }], prev, next }`.
4. Cache serveur court (60 s) pour les chapitres publiés et publics ; aucun cache partagé pour les contenus à accès restreint.

### 7.2 Lecteur
- Utiliser des balises `<img>` simples avec **`width` et `height` renseignés** (aucun décalage de mise en page) ; ne pas passer par l'optimisation d'images de Next.js / Vercel (coût et inutile : les fichiers sont déjà optimisés).
- **Première page** : `fetchpriority="high"`, `loading="eager"`.
- **Pages suivantes** : `loading="lazy"` et `decoding="async"` ; en mode page par page, **préchargement des 2 à 3 pages suivantes**.
- **Mode webtoon** : conteneurs aux proportions connues (ratio `width/height`) pour un défilement stable ; chargement par fenêtre glissante.
- **Mode double page** : disposition calculée à partir des dimensions stockées, sans attendre les téléchargements (une page est paysage si `width > height`).
- **Erreur de chargement** : 2 nouvelles tentatives avec délai croissant, puis affichage d'une page de remplacement avec bouton « Signaler un problème » (déjà annoncé sur le site).
- **Progression de lecture** : enregistrée par lots (voir `systeme_appel_api.md`).
- **Fin de chapitre** : préchargement de la première page du chapitre suivant.

### 7.3 Couvertures et bannières
- Même domaine `img.`, chemins `…/cover.webp` et `…/banner.webp`, versionnés par hash.
- Deux tailles (liste et fiche) via des suffixes de nom (`cover-300.webp`, `cover-600.webp`) et `srcset`.
- Placeholder flou ou couleur dominante stockée en base pour éviter les cases vides pendant le chargement.
- Les couvertures de contenu +18 sont floutées tant que le gate n'est pas validé : **le flou est appliqué côté serveur** (variante floue dédiée) et non uniquement par CSS.

### 7.4 Variables d'environnement
| Variable | Exemple | Usage |
|---|---|---|
| `IMG_BASE_URL` | `https://img.lesporoiniens.org` | Construction des URLs publiques |
| `NAS_API_BASE` | `https://api-img.lesporoiniens.org` | Appels serveur à l'API du NAS |
| `NAS_API_CLIENT_ID` / `NAS_API_CLIENT_SECRET` | *(secret)* | Service token Cloudflare Access |
| `IMG_SIGNING_SECRET` | *(secret)* | Signature des URLs temporaires |
| `CF_API_TOKEN` / `CF_ZONE_ID` | *(secret)* | Purge ciblée du cache |

Tous les secrets sont des variables d'environnement Vercel, jamais dans le dépôt.

---

## 8. Migration depuis l'ancien site

1. **Correspondance des chemins** : l'ancien format `/proxy/api/les_poro_img/<Série>/<Chapitre N>` pointe vers un dossier du NAS. Un script lit les anciens JSON de séries, déduit pour chaque chapitre le dossier correspondant et appelle `/list`.
2. **Renommage** : si la structure du NAS est conservée telle quelle (titres avec espaces), le script crée la table de correspondance `ancien chemin → slug / numéro` ; le renommage physique est facultatif et peut se faire plus tard grâce à `path` stocké en base.
3. **Chapitres ImgChest** (379 dans l'ancien site) : sources externes non maîtrisées. Décision à prendre : réimporter sur le NAS, ou ne pas migrer ces chapitres.
4. **Couvertures** : 254 sont déjà sur `img.lesporoiniens.org` (reprise directe) ; 81 sont sur `file.garden` et doivent être copiées sur le NAS.
5. **Redirections** : les anciennes URLs de lecteur redirigent en 301 vers les nouvelles.
6. **Périmètre migré** : seules les séries qui passent l'audit de conformité du cahier principal (section 16) sont importées.
7. **Migration progressive** : séries par lots, chaque lot validé (lecture complète d'un chapitre par série) avant le suivant.

---

## 9. Supervision et exploitation

### 9.1 Indicateurs
- Taux de cache hit Cloudflare, bande passante par jour, erreurs 4xx / 5xx sur `img.`.
- Disponibilité et temps de réponse de l'API du NAS, espace disque libre.
- Taux d'erreur de chargement d'images remonté par le lecteur (événement envoyé par lots).
- Nombre de signalements « problème de scan » par chapitre.

### 9.2 Alertes (e-mail, Discord ou autre canal)
- NAS ou tunnel injoignable pendant plus de 2 minutes.
- Espace disque libre sous 15 %.
- Taux d'erreur images supérieur à 2 % sur 10 minutes.
- Pic de requêtes anormal sur `img.` (suspicion de moissonnage).

### 9.3 Sauvegardes
- Sauvegarde 3-2-1 du dossier `content/` : copie locale (second disque), copie externe chiffrée (hors site), vérification de restauration mensuelle.
- L'index Appwrite est sauvegardé séparément (voir cahier principal, section 5.5) ; la perte du NAS ne doit pas empêcher de reconstruire l'index à partir d'une copie.

### 9.4 Plan de repli
- NAS en panne : page de maintenance par chapitre, lecture des chapitres déjà en cache Cloudflare toujours possible.
- Cloudflare en panne : possibilité de basculer le domaine `img.` vers une autre source (second NAS ou stockage objet) car les chemins sont relatifs en base.

---

## 10. Critères de recette

| # | Critère | Mesure |
|---|---|---|
| 1 | Première page visible | < 1,5 s en 4G pour un chapitre en cache |
| 2 | Pas de décalage de mise en page | CLS < 0,05 dans le lecteur |
| 3 | Cache | Taux de hit > 95 % après 7 jours |
| 4 | Sollicitation du NAS | Aucune requête NAS pour une lecture d'un chapitre déjà vu |
| 5 | Brouillon inaccessible | URL directe d'un chapitre en `staging/` : refus (403 / 404) |
| 6 | Aperçu Gérant | URL signée valide jusqu'à expiration, refusée ensuite |
| 7 | Hotlink | Image appelée depuis un autre domaine : refusée |
| 8 | Import | Chapitre de 40 pages importé et publié en moins de 2 minutes |
| 9 | Reprise d'import | Import interrompu puis relancé : aucun doublon |
| 10 | Remplacement de page | Nouvelle version visible immédiatement chez les lecteurs |
| 11 | Panne NAS | Chapitres en cache toujours lisibles, alerte reçue < 2 min |
| 12 | API NAS | Appel depuis un navigateur sans jeton : refusé |

---

## 11. Planning

| Étape | Contenu | Durée indicative |
|---|---|---|
| 1 | Audit du NAS (arborescence, formats, API existante), choix des règles de nommage | 2 à 3 jours |
| 2 | Évolutions de l'API NAS (`/tree`, dimensions et hash dans `/list`, `/health`) | 3 à 5 jours |
| 3 | Règles Cloudflare (cache, hotlink, limitation, Access sur `api-img`) | 2 jours |
| 4 | Collections Appwrite et import Gérant (aperçu, écriture de l'index) | 5 à 7 jours |
| 5 | Lecteur : chargement différé, dimensions, préchargement, reprise sur erreur | 5 à 7 jours |
| 6 | Staging / publication, URLs signées, Worker de prévisualisation | 3 à 5 jours |
| 7 | Premier chapitre lisible de bout en bout (jalon) puis migration par lots | 1 à 2 semaines |
| 8 | Supervision, alertes, tests de recette | 3 à 4 jours |

**Jalon 1 :** un chapitre importé depuis le NAS s'affiche dans le lecteur du site `les-poroiniens-v2.vercel.app`, avec les dimensions lues en base et les images servies par `img.`.

---

## 12. Risques

| Risque | Impact | Parade |
|---|---|---|
| Le NAS est un point unique de défaillance | Chapitres non mis en cache indisponibles | Sauvegarde 3-2-1, alertes, second site de repli |
| Débit montant domestique limité | Lenteur sur les chapitres non mis en cache | Cache Cloudflare agressif, préchauffage du cache à la publication |
| Conditions d'utilisation de Cloudflare et de l'hébergeur | Suspension possible en cas de signalement ou de volume élevé | Lire les conditions du plan utilisé, traiter les demandes DMCA rapidement (page dédiée déjà en ligne), prévoir une alternative de stockage |
| Moissonnage des images | Bande passante, copie du contenu | Limitation de débit, WAF, URLs signées pour le non public |
| Divergence entre l'arborescence du NAS et la base | Chapitres introuvables | Chemins relatifs en base, vérification périodique (tâche de contrôle) |
| Domaine `img.` public et prévisible | Découverte des chapitres non annoncés | Staging séparé et non exposé |

---

## 13. Points à confirmer

1. **Structure réelle du NAS** : arborescence exacte et formats de fichiers actuels.
2. **API existante** : technologie (Node, Python, Nginx autoindex ?), présence ou non de dimensions et de hash, authentification actuelle.
3. **Liaison Cloudflare** : tunnel ou DNS proxifié vers une IP publique ?
4. **Protection actuelle de `img.`** : hotlink, limitation, restrictions déjà en place ?
5. **Plan Cloudflare** utilisé (gratuit ou payant) : détermine les règles disponibles.
6. **Débit montant** de la connexion du NAS et présence d'un onduleur.
7. **Chapitres ImgChest** (379) : réimport sur le NAS ou abandon ?
8. **Couvertures `file.garden`** (81) : copie sur le NAS acceptée ?
9. **Prévisualisation Gérant** : suffisante via URL signée ou besoin d'un environnement de préproduction ?
