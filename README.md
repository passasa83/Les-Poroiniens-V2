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
   *Scopes* : `databases.read`, `databases.write`, `users.read`, `users.write`,
   `buckets.read`, `buckets.write`, `files.read`, `files.write`
   (inutiles : `tokens.*` — pas d'URLs signées — et `account.*` — la connexion
   passe par un client anonyme puis la session utilisateur).
2. Coller la clé dans `.env.local` : `APPWRITE_API_KEY=...`
3. `npm run appwrite:setup` (provisioning : 15 tables + index + bucket `avatars`
   + profil Gérant pour `APPWRITE_OWNER_EMAIL`).
4. `npm run appwrite:seed` (données de démonstration, facultatif).

## Comptes de démonstration

Mot de passe commun : `demo1234`

| Rôle    | E-mail               |
| ------- | -------------------- |
| Gérant  | gerant@poroiniens.fr |
| Admin   | admin@poroiniens.fr  |
| Modo    | modo@poroiniens.fr   |
| Membre  | membre@poroiniens.fr |

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
