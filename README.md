# Les Poroiniens — plateforme de lecture de scans manga

Site de lecture de scans (MVP / Phase 1) conforme au cahier des charges
[`cahier_des_charges_site_scans.md`](./cahier_des_charges_site_scans.md).

- **Front** : Next.js 16 (App Router, TypeScript, Tailwind CSS v4) déployé sur Vercel.
- **Back** : Appwrite auto-hébergé (authentification, TablesDB, storage) — voir `src/lib/db/`.
- **Scans** : pages servies par le CDN `img.` depuis le NAS (voir « Système
  d'images » plus bas) ; repli sur le proxy `/api/image` si aucun CDN.
- **Aucune publicité, aucun traceur publicitaire.** Interface entièrement en français.

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis compléter
npm run dev                  # http://localhost:3000
```

Scripts disponibles :

| Commande                | Rôle                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `npm run dev`           | serveur de développement                                     |
| `npm run build`         | build de production                                          |
| `npm run typecheck`     | `tsc --noEmit`                                               |
| `npm run lint`          | ESLint                                                       |
| `npm run appwrite:setup`| crée les tables, index, bucket avatars et le profil « owner » |
| `npm run appwrite:seed` | copie les données de démonstration vers Appwrite             |

## Bascule démonstration → Appwrite

Tant que `APPWRITE_API_KEY` est vide, le site tourne sur un **jeu de données de
démonstration en mémoire** (10 séries, chapitres, commentaires, comptes).

Pour brancher Appwrite :

1. Dashboard Appwrite → **Settings → API keys → Create key**, puis cocher dans
   *Scopes* : `rows.read`, `rows.write`, `documents.read`, `documents.write`,
   `tables.read`, `tables.write`, `collections.read`, `collections.write`,
   `databases.read`, `databases.write`, `users.read`, `users.write`,
   `buckets.read`, `buckets.write`, `files.read`, `files.write`
   (Appwrite 2.x stocke les données via TablesDB : sans `tables.*` ni
   `collections.*`, toute création de table renvoie `401 missing scopes` ; sans
   `rows.*` + `documents.*`, lecture/écriture de lignes en est refusée ;
   inutiles : `tokens.*` — pas d'URLs signées — et `account.*` — la connexion
   passe par un client anonyme puis la session utilisateur).
2. Coller la clé dans `.env.local` : `APPWRITE_API_KEY=...`
3. `npm run appwrite:setup` (provisioning : 15 tables + index + bucket `avatars`
   + profil Gérant pour `APPWRITE_OWNER_EMAIL`).
4. `npm run appwrite:seed` (données de démonstration, facultatif).

## Déploiement Vercel

1. **Importer** le repo GitHub sur <https://vercel.com/new> : preset
   **Next.js**, branche `master`, aucune commande de build personnalisée
   (la config tient dans `next.config.ts` ; `vercel.json` ne déclare que les
   crons).
2. **Avant le 1er build** : *Project → Settings → Environment Variables* →
   coller le bloc du fichier local `.env.vercel` (généré à partir de
   `.env.local`, non versionné). Les variables vides (`NAS_*`, `GOOGLE_DRIVE_*`,
   `CDN_BASE_URL`) sont facultatives.
   ⚠ `NEXT_PUBLIC_SITE_URL` doit valoir l'URL réelle du site
   (`https://<nom-du-projet>.vercel.app`) : c'est elle qui porte les URL
   canoniques et le sitemap.
3. **Deploy** : `next build` puis hébergement des fonctions — 0 réglage
   supplémentaire.
4. Après le 1er déploiement, corriger `NEXT_PUBLIC_SITE_URL` si l'URL diffère,
   puis **Redeploy**.
5. Recette : accueil, nouveautés, fiche série, lecteur, connexion au compte Gérant
   (identifiants non publiés, voir « Comptes » plus bas), accès `/gerant`.

Notes :

- **Crons** : `vercel.json` déclenche `/api/cron/revalidate` (tous les jours à
  04:20 UTC — revalide l'ISR **et publie les chapitres programmés**) et
  `/api/cron/health` (tous les jours à 05:50 UTC — supervision NAS + erreurs
  d'images). **Le plan Hobby de Vercel n'autorise qu'une exécution par jour et
  par cron** (une fréquence plus élevée fait échouer le déploiement) : c'est
  pourquoi la publication des chapitres échus est aussi déclenchée **à la
  demande** quand un lecteur ouvre une fiche série ou un chapitre (`/serie/…`).
  Vercel ajoute automatiquement `Authorization: Bearer ${CRON_SECRET}` ; sans
  `CRON_SECRET` défini, les crons répondent 401 et ne font rien.
- **Aucun seed à refaire** : Vercel et le serveur de développement partagent la
  même base Appwrite (read-only pour le site, écritures via l'API).
- Cron manuels contre la prod, depuis la machine de dev :
  `NEXT_PUBLIC_SITE_URL=https://<projet>.vercel.app npm run appwrite:seed`
- Le repo étant **public**, aucune secret n'y figure : `.env*` est ignoré et la
  clé API ne vit que dans `.env.local` et les variables Vercel.

## Système d'images

Deux sources d'images coexistent, avec le même modèle (index des pages en base,
octets jamais transmis par Vercel) :

- **ImgChest** — *source active* : un album par chapitre, images servies
  directement par le CDN d'ImgChest (`cdn.imgchest.com`) ;
  voir « Source d'images ImgChest » plus bas.
- **NAS → Cloudflare** — parcours nominal du cahier des charges : **NAS**
  (`/content/{staging,public}/…`) → **API de listing** (`api-img.`) pour l'import,
  **CDN** (`img.`) pour la lecture → navigateur.

Dans les deux cas, le serveur ne fait que construire des URLs et indexer un index.

### Variables d'environnement (§7.4)

| Variable                    | Exemple                          | Rôle                                                        |
| --------------------------- | -------------------------------- | ----------------------------------------------------------- |
| `IMG_BASE_URL`              | `https://img.lesporoiniens.org`  | domaine qui sert les fichiers ; `${IMG_BASE_URL}/${chemin}`  |
| `NAS_API_BASE`              | `https://api-img.lesporoiniens.org` | appel **serveur** à l'API de listing (`/list`, `/tree`, `/health`, `/move`) |
| `NAS_API_CLIENT_ID`         | *(secret)*                       | service token Cloudflare Access — `CF-Access-Client-Id`      |
| `NAS_API_CLIENT_SECRET`     | *(secret)*                       | service token Cloudflare Access — `CF-Access-Client-Secret`  |
| `NAS_API_KEY`               | *(secret)*                       | `X-Api-Key` + `Authorization: Bearer` (alternative à Access) |
| `IMG_SIGNING_SECRET`        | *(secret)*                       | HMAC des URLs à 10 min (chapitres non publiés / aperçus)     |
| `CF_API_TOKEN` + `CF_ZONE_ID` | *(secret)*                     | purge ciblée du cache à la publication (best effort)         |
| `IMG_CDN_BLUR`              | `1`                              | **opt-in** : flou serveur `/cdn-cgi/image/blur=60,width=600/` des couvertures +18 (sinon flou CSS) |
| `IMAGE_ERROR_ALERT`         | `20`                             | seuil d'alerte du cron santé sur les erreurs d'images / 48 h |
| `CDN_BASE_URL`              | —                                | alias hérité de `IMG_BASE_URL`                               |

`NAS_API_URL` / `NAS_PAGE_BASE_URL` restent lus par compatibilité mais sont
suppléés par les variables ci-dessus.

### Contrat de l'API du NAS (§4)

| Route              | Usage                                                             |
| ------------------ | ----------------------------------------------------------------- |
| `GET /list?path=`  | pages d'un dossier : `{ name, path, width, height, bytes, hash }`  |
| `GET /tree?path=`  | arborescence pour l'écran d'import                                 |
| `GET /health`      | `{ status, disk_free_pct }` (404 toléré : considéré comme OK)      |
| `POST /move`       | `{ from, to }` — `staging/` → `public/` à la publication           |

Toutes les routes sont appelées depuis le serveur (`src/lib/nas.ts`) avec
`CF-Access-Client-Id/Secret` et/ou `X-Api-Key`, un délai de 15 s, et un chemin
validé contre le path traversal. Conventions de nommage (§3.2) :
`{slug}/chapitres/{numero sur 4 chiffres}/` + pages numérotées `001.webp`,
`002.webp`… en tri naturel.

### Ce que fait le site

- **Import** (`POST /api/owner/import`) : si `chemin` est fourni, listing serveur,
  stockage des dimensions/poids/hash en base, statut choisi (brouillon /
  programmé / publié). `GET /api/owner/nas/preview?path=` affiche l'aperçu avant
  indexation (trous de numérotation, doublons de hash, pages inhabituelles).
- **Publication** (`PATCH /api/admin/chapters/{id}` ou cron) : déplacement
  `staging/` → `public/` via `POST /move`, réécriture des chemins en base, purge
  Cloudflare (≤ 30 URLs), entrée au journal d'audit. Échec possible sans bloquer
  : l'erreur est renvoyée au panneau d'import.
- **Lecture** : URLs `${IMG_BASE_URL}/${chemin}?v=${hash[0..8]}` (versionnées, donc
  cache long et invalidation automatique), index lu en base, dimensions connues
  avant chargement, 2 reprises puis page de remplacement + signalement.
- **Supervision** : `/api/owner/nas/health` (espace Gérant) et
  `/api/cron/health` (cron quotidien) remontent disponibilité du NAS, espace disque
  et erreurs d'images remontées par le lecteur (`POST /api/telemetry/images`).

### Réglages Cloudflare à faire de leur côté (§6)

- `img.` : cache long, `s-maxage` élevé ; règle WAF / limitation de débit par IP
  (compter 20 à 80 pages par chapitre) ; tunnel uniquement sur `/content/public/*`.
- `api-img.` : protégé par Cloudflare Access (service token) ou clé, tunnel
  uniquement sur l'API — jamais exposé au navigateur.
- Optionnel : activer `IMG_CDN_BLUR=1` **uniquement** si `/cdn-cgi/image/`
  fonctionne sur `img.` (sinon les couvertures concernées renverraient 404).

## Source d'images ImgChest (active)

Un album ImgChest = un chapitre. C'est la source utilisée en production :
les pages sont servies par le CDN tiers, aucun stockage ni transfet par Vercel.

| Variable           | Exemple           | Rôle                                                             |
| ------------------ | ----------------- | ---------------------------------------------------------------- |
| `IMG_CHEST_USERNAME` | `Big_herooooo`   | compte du Gérant : liste ses albums (`GET /api/owner/imgchest/posts`) |
| `IMG_CHEST_API_KEY`  | *(secret)*       | envoyée en `Authorization: Bearer` + `X-Api-Key` si elle est fournie |
| `IMG_CHEST_API_BASE` | *(facultatif)*   | surcharge du domaine (`https://imgchest.com`)                     |

- **Import** : onglet « Depuis ImgChest » de l'espace Gérant → liste des albums
  récents (24 par page) ou saisie directe d'un identifiant
  (`GET /api/owner/imgchest/post?id=`) qui affiche titre, nombre de pages et
  poids avant indexation. `POST /api/owner/import` accepte alors
  `source: "imgchest"` + `imgchest_post`.
- **Lecture** : les URLs CDN étant complètes, `pageUrl()` les sert telles quelles
  avec `?v=<id du fichier>` (version courte à durée de vie du fichier) — aucune
  requête vers ImgChest pendant la lecture, dimensions connues à l'avance.
- **Publication** : aucun déplacement de fichier (`transitionChapterFiles`
  renvoie `none` pour les URLs externes) ; la purge Cloudflare est sans objet.
- **Cache** : résolution serveur de l'album (30 jours) et liste des albums
  (1 heure), en mémoire par instance.
- **Cloisonnement** : les routes `/api/owner/imgchest/*` exigent la session du
  Gérant ; le navigateur ne dispose jamais des identifiants du compte.
- La CSP du site autorise déjà `img-src https:` : les images `cdn.imgchest.com`
  s'affichent sans réglage supplémentaire.

## Contenu

**Le site en production est volontairement vide** (remise à zéro du
05/10/2026) : 0 série, 0 chapitre, 0 commentaire, seul le compte Gérant
subsiste. Les tables Appwrite sont conservées (structure prête à l'emploi).

Pour (re)remplir le site :

- **Espace Gérant → Import** : crée la fiche série (back-office `/admin/series`)
  puis importe un chapitre, **depuis un album ImgChest** (source active : liste
  des albums du compte ou identifiant collé), depuis un dossier du NAS (listing
  serveur, largeurs/hauteurs/poids/hash lus sur place), ou en indexant des noms
  de fichiers. Tant que `NAS_API_BASE` est absent et qu'aucun album n'est choisi,
  les pages importées sont des **images de démonstration** — le site est alors
  remplissable et testable de bout en bout.
- **`npm run appwrite:seed`** : recopie le jeu de démonstration (10 séries) —
  à éviter si l'on veut garder un site vide.
  L'insertion prend environ cinq minutes : le client HTTP expire au bout de
  300 s (`UND_ERR_HEADERS_TIMEOUT`) alors que le serveur continue d'écrire.
  **Relancer alors la commande** jusqu'à ce que le récapitulatif s'affiche :
  elle est idempotente, les lignes déjà présentes sont simplement ignorées.

## Comptes

**Aucun mot de passe n'est publié dans ce dépôt** (il est public).

- En mode **Appwrite** (celui du site en ligne), seul le compte **Gérant** existe réellement.
  Il est créé au provisioning par `npm run appwrite:setup` avec `APPWRITE_OWNER_PASSWORD`
  (défini dans `.env.local`, jamais versionné) : c'est là qu'il faut le définir/changer.
- En mode **démonstration hors ligne** (`DEMO_MODE`), des comptes fictifs servent aux tests :

| Rôle    | E-mail               |
| ------- | -------------------- |
| Gérant  | gerant@poroiniens.fr |
| Admin   | admin@poroiniens.fr  |
| Modo    | modo@poroiniens.fr   |
| Membre  | membre@poroiniens.fr |

Leur mot de passe n'est pas documenté : définissez-le via `DEMO_PASSWORD` dans `.env.local`
si vous avez besoin de vous connecter en démo.

Le **Gérant** est seul habilité aux imports, à la publication, au Drive, aux
secrets et à l'audit (matrice des droits : `src/lib/roles.ts`). Les Admins sont
explicitement exclus de `/gerant`.

## Structure

```
src/
  app/          routes App Router (catalogue, lecteur, espace membre, back-office)
  components/   UI (kit, layout, lecteur, commentaires, adult gate)
  lib/          auth, rôles, données (data/*), db/ (drivers Appwrite + démo)
  proxy.ts      redirections d'auth (Next 16 — remplace middleware)
scripts/        provisioning Appwrite (appwrite-setup.mts)
```

## Notes d'implémentation

- **Identifiants de lignes Appwrite** : 36 caractères maximum. Tous les ids
  composites passent par `rowId()` (`src/lib/db/ids.ts`) : ils sont conservés
  s'ils tiennent dans la limite, sinon remplacés par un hash déterministe de
  32 caractères. Sans cette règle, bibliothèque, historique, likes et imports
  échouaient en 500 pour tout vrai compte (id de 20 caractères).

- **URL canonique des chapitres** : `/serie/{slug}/chapitre-{n}`. L'App Router
  n'accepte que des segments dynamiques entiers, l'URL publique est donc
  réécrite vers la route interne `/serie/{slug}/{n}` (`rewrites()` dans
  `next.config.ts`).
- **404 streamés** : `notFound()` est renvoyé en HTTP 200 lorsque la page est
  streamée (comportement documenté de Next) ; la balise `noindex` est injectée
  automatiquement pour empêcher l'indexation de ces URL.
- **Images** : jamais `next/image` sur `/api/img/...` (services workers) :
  balises `<img>` standard.
- **Pas de fournisseur de mails** : la réinitialisation de mot de passe est
  manuelle, côté Gérant (interface abstraite `mailer`).
