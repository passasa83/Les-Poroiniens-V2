# Les Poroiniens — plateforme de lecture de scans manga

Site de lecture de scans (MVP / Phase 1) conforme au cahier des charges
[`cahier_des_charges_site_scans.md`](./cahier_des_charges_site_scans.md).

- **Front** : Next.js 16 (App Router, TypeScript, Tailwind CSS v4) déployé sur Vercel.
- **Back** : Appwrite auto-hébergé (authentification, TablesDB, storage) — voir `src/lib/db/`.
- **Scans** : pages servies depuis le NAS via `/api/image` (proxy) ou un CDN (`CDN_BASE_URL`).
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
   (la config tient dans `next.config.ts`, pas de `vercel.json`).
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
5. Recette : accueil, fiche série, lecteur, connexion au compte Gérant (identifiants
   non publiés, voir « Comptes » plus bas), accès `/gerant`.

Notes :

- **Aucun seed à refaire** : Vercel et le serveur de développement partagent la
  même base Appwrite (read-only pour le site, écritures via l'API).
- Cron manuels contre la prod, depuis la machine de dev :
  `NEXT_PUBLIC_SITE_URL=https://<projet>.vercel.app npm run appwrite:seed`
- Le repo étant **public**, aucune secret n'y figure : `.env*` est ignoré et la
  clé API ne vit que dans `.env.local` et les variables Vercel.

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
