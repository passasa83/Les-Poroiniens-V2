# Tuto NAS — récupérer, héberger et servir les images sur OpenMediaVault

> **Objectif** : poser sur **ton** NAS OpenMediaVault les dossiers images du
> site ancien (ceux du proprio, déjà copiés sur ton PC), puis les servir en
> HTTP depuis le NAS. Rien d'autre : le site en prod ne change pas pour
> l'instant (les pages lues restent sur ImgChest, les couvertures sur
> file.garden/ImgChest).
>
> **Durée** : environ 20 minutes, plus le temps de copie (dépend de la taille
> — mesurée à l'étape 0).
>
> Mot `CHEMIN_SOURCE` à remplacer partout par le chemin réel de tes dossiers
> images sur ton PC.

---

## Étape 0 — Vérifier et mesurer (sur ton PC, 5 min)

### 0.1 Structure attendue

Les dossiers doivent avoir cette forme (c'est l'arborescence de l'ancien NAS,
celle que le futur import lira telle quelle) :

```
CHEMIN_SOURCE/
  Fruit of the Underworld/          ← un dossier par SÉRIE (noms avec espaces, normal)
    Vol1.jpg                        ← couverture(s)
    Vol2.jpg
    Chapitre 1/                     ← un dossier par CHAPITRE
      001.png
      002.png
      …
    Chapitre 2/
      …
  One Piece/
    Chapitre 1/
      …
```

- Les **enfants directs** de `CHEMIN_SOURCE` doivent être des séries.
- Si tes dossiers sont enveloppés dans un dossier intermédiaire (ex. :
  `NAS\images\One Piece\…`), c'est `NAS\images` qui sera `CHEMIN_SOURCE`.
- **Ne renomme rien** : les accents, espaces et majuscules doivent rester
  identiques (les anciens JSON du corpus référencent ces chemins exactement).

### 0.2 Mesurer la taille et le nombre de fichiers

PowerShell sur ton PC :

```powershell
$d = "CHEMIN_SOURCE"
$r = Get-ChildItem $d -Recurse -File
"{0} fichiers — {1:N2} Go" -f $r.Count, (($r | Measure-Object Length -Sum).Sum / 1GB)
```

Note les deux chiffres : tu les utiliseras pour vérifier la copie (étape 2.3).

### 0.3 Vérifier l'espace libre sur le NAS

Dans l'interface OMV : **Stockage → Systèmes de fichiers** (ta valeur dans la
colonne « Libre »). Il faut **largeur marge** au-dessus de la taille mesurée.
En SSH :

```bash
df -h /srv
```

---

## Étape 1 — Créer le partage sur OpenMediaVault (10 min)

1. Connecte-toi à l'interface OMV : `http://<IP-du-NAS>:8080` (port d'origine
   OMV ; change-le si tu l'as modifié).
2. **Données → Partages** (*Data → Shared Folders* ; dans certaines versions
   c'est sous *Stockage → Partages*) → **Ajouter** :
   - Nom : `poroiniens-images`
   - Disque : celui de ton choix (celui avec l'espace libre)
   - Chemin : laisse OMV générer (tu obtiendras un chemin du type
     `/srv/dev-disk-by-uuid-xxxx-xxxx/poroiniens-images` — **note-le**, c'est
     lui qu'il faudra à l'étape 3).
3. **Services → SMB/CIFS** :
   - Onglet *Paramètres* : cocher **Activer** → *Appliquer* si demandé.
   - Onglet *Partages* → **Ajouter** : sélectionne le partage
     `poroiniens-images`, autorise l'utilisateur que tu utilises (crée-le via
     **Accès → Utilisateurs** si besoin, avec droits *Lecture/Écriture* sur ce
     partage).
4. **Tester depuis Windows** : dans l'Explorateur de fichiers, barre d'adresse :

   ```
   \\<IP-du-NAS>\poroiniens-images
   ```

   Le dossier doit s'ouvrir (vide pour l'instant).

---

## Étape 2 — Copier les dossiers du PC vers le NAS

### 2.1 Lancer la copie (robocopy)

Ouvre PowerShell sur ton PC et lance (adapte `CHEMIN_SOURCE` et l'IP) :

```powershell
robocopy "CHEMIN_SOURCE" "\\IP-DU-NAS\poroiniens-images" /E /MT:16 /R:3 /W:5 /NP /LOG:"$env:TEMP\copie-images.log"
```

| Drapeau | Rôle |
|---|---|
| `/E` | copie tous les sous-dossiers (même vides) |
| `/MT:16` | 16 fils en parallèle (beaucoup plus rapide pour des milliers de fichiers) |
| `/R:3` `/W:5` | 3 essais par fichier, 5 s d'attente entre essais |
| `/NP` | pas de pourcentage dans le log (sinon le log explose) |
| `/LOG:…` | log complet dans un fichier |

**Robocopy est reprenable** : si la copie s'arrête (coupure, PC en veille),
**relance simplement la même commande** — les fichiers déjà copiés à
l'identique sont ignorés.

### 2.2 Comprendre le code retour

```powershell
echo $LASTEXITCODE
```

- **0 à 7 = OK** (1 = fichiers copiés, c'est le cas nominal).
- **8 et plus = problème** : ouvre `$env:TEMP\copie-images.log`, cherche
  `ERREUR` / `ERROR`.

### 2.3 Vérifier (important — ne supprime pas encore la source)

Comparaison des totaux :

```powershell
# Côté PC (doit donner les mêmes chiffres qu'à l'étape 0.2)
$r = Get-ChildItem "CHEMIN_SOURCE" -Recurse -File
"{0} fichiers — {1:N0} octets" -f $r.Count, ($r | Measure-Object Length -Sum).Sum
```

```bash
# Côté NAS (SSH : ssh <user>@<IP-du-NAS>)
cd /srv/dev-disk-by-uuid-xxxx-xxxx/poroiniens-images
find . -type f | wc -l            # même nombre de fichiers que côté PC
du -sb .                          # même nombre d'octets que côté PC
```

Contrôle visuel : ouvre une image dans l'Explorateur réseau
(`\\<IP>\poroiniens-images\<Série>\<Chapitre 1>\001.png`).

⚠️ **Garde la source sur ton PC** tant que le site n'est pas servi depuis le
NAS (elle te sert de sauvegarde de repli).

---

## Étape 3 — Héberger les images : nginx dans Docker (10 min)

Ton NAS tourne déjà Docker (Appwrite y tourne) : on ajoute un petit conteneur
nginx qui sert le dossier en lecture seule.

### 3.1 Choisir un port libre

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'
```

Repère les ports déjà pris (80/443 sont probablement occupés par
l'inverse-proxy d'Appwrite). L'exemple ci-dessous utilise **8082** — remplace-le
si ce port est pris.

### 3.2 Créer le dossier de la stack

En SSH sur le NAS (ou via le plugin Compose / Portainer que tu utilises déjà) :

```bash
mkdir -p /srv/dev-disk-by-uuid-xxxx-xxxx/appdata/poroiniens-images
cd /srv/dev-disk-by-uuid-xxxx-xxxx/appdata/poroiniens-images
```

### 3.3 Coller le fichier `docker-compose.images.yml`

```yaml
services:
  images:
    image: nginx:alpine
    container_name: poroiniens-images
    restart: unless-stopped
    volumes:
      # ← remplace par TON chemin physique (étape 1.2), en lecture seule
      - /srv/dev-disk-by-uuid-xxxx-xxxx/poroiniens-images:/usr/share/nginx/html:ro
    ports:
      - "8082:80"   # ← port d'écoute LAN ; change le 8082 si pris
```

### 3.4 Démarrer

```bash
docker compose -f docker-compose.images.yml up -d
docker ps --filter name=poroiniens-images     # STATUS = Up
```

(Si tu utilises le plugin Compose d'OMV ou Portainer : crée la stack avec le
même contenu, c'est équivalent.)

### 3.5 Tester

Depuis ton PC, dans le navigateur (remplace les espaces par `%20`) :

```
http://IP-DU-NAS:8082/Fruit%20of%20the%20Underworld/Vol2.jpg
```

→ l'image s'affiche = **c'est en place**. Puis teste depuis ton **téléphone**
(en WiFi, même réseau) pour confirmer l'accès LAN.

Remarque : `http://IP-DU-NAS:8082/` tout seul répond 403 — c'est **normal**
(la liste des dossiers est désactivée volontairement : seuls les fichiers
directs sont servables).

---

## Étape 4 — Sécurité (à ne pas sauter)

- **N'expose pas ce port sur Internet** : pas de *port forwarding* sur ta
  box, et si le pare-feu d'OMV est actif, autorise le port **en LAN
  uniquement**. Les images sont peut-être sensibles (+18) : l'exposition
  publique se fera plus tard, encadrée (reverse proxy + anti-hotlink,
  cahier des charges images §6).
- **Aucun secret dans le compose** : ce stack ne contient que des chemins et
  un port. Les clés (Appwrite, etc.) restent dans les fichiers `.env*` qui
  sont ignorés par git (`.env*` dans `.gitignore`).
- **Lecture seule** : le conteneur est monté `:ro`, il ne peut pas modifier
  tes images.

---

## Étape 5 — Et ensuite ? (rien à faire maintenant)

| Quand | Quoi |
|---|---|
| Maintien = rien | Le site lit ImgChest (pages) et file.garden (couvertures) — il ne dépend pas encore de ton NAS. |
| Phase 2 : « système d'import » | Ton NAS devra exposer un endpoint `GET /list?path=…` (le nginx statique ne le fait pas). Je te fournirai le service + l'écran d'import Gérant ; l'importera les chapitres depuis ton NAS en base. |
| Phase 2 bis | Brancher `IMG_BASE_URL` (dev + Vercel) sur l'URL publique de ton serveur d'images. |
| Plus tard | Rapatriement éventuel des contenus encore chez les autres (ImgChest, file.garden) vers ton NAS — decision prise : « dans un second temps ». |
| Plus tard | Passer derrière Cloudflare (domaine, cache, anti-hotlink) — cahier images §6. |

---

## Annexe A — (Optionnel) Héberger aussi le site DEV sur le NAS

Les fichiers sont déjà dans le dépôt : `Dockerfile.dev`,
`docker-compose.dev.yml`, `.dockerignore`.

1. Clone le dépôt sur le NAS :

   ```bash
   mkdir -p /srv/dev-disk-by-uuid-xxxx-xxxx/appdata/poroiniens-dev
   cd /srv/dev-disk-by-uuid-xxxx-xxxx/appdata/poroiniens-dev
   git clone https://github.com/passasa83/Les-Poroiniens-V2.git
   cd Les-Poroiniens-V2
   ```

2. Crée le fichier d'environnement (**jamais commité**, il est ignoré par git) :

   ```bash
   cp .env.local .env.dev.local
   nano .env.dev.local
   ```

   À adapter : `NEXT_PUBLIC_SITE_URL=http://IP-DU-NAS:3100`, et si tu veux que
   le dev lise tes images : `IMG_BASE_URL=http://IP-DU-NAS:8082`.
   Le reste (Appwrite, etc.) peut rester tel quel.

3. Build + démarrage :

   ```bash
   docker compose -f docker-compose.dev.yml up -d --build
   ```

4. Test : `http://IP-DU-NAS:3100`.

5. (Optionnel) Reverse proxy dans nginx Proxy Manager : Proxy Host →
   `IP-DU-NAS:3100`.

6. Mise à jour du code (quand je push) :

   ```bash
   git pull
   docker compose -f docker-compose.dev.yml up -d --build
   ```

7. Recettes contre le NAS : `BASE=http://IP-DU-NAS:3100 node %TEMP%\opencode\e2e-xxx.mjs`.

---

## Annexe B — Dépannage

| Symptôme | Cause / solution |
|---|---|
| `robocopy` sort 8+ | Ouvre le log (`$env:TEMP\copie-images.log`), cherche `ERROR` : souvent chemin trop long (activer les chemins longs Windows) ou fichier verrouillé. |
| `\\IP\partage` inaccessible | SMB désactivé ou mauvais utilisateur → revoir étape 1.3. |
| Image en 404 sur le serveur | Espace mal encodé dans l'URL (`%20`), ou mauvais chemin de montage dans le compose. |
| Image en 403 | Le conteneur ne monte pas le bon dossier → vérifier la ligne `volumes:` (chemin absolu côté NAS). |
| Port déjà pris | `docker ps` pour repérer, changer le `8082:` dans le compose. |
| `docker: command not found` | Docker n'est pas accessible en SSH → utilise le plugin Compose/Portainer d'OMV. |
| Copie très lente | Normal pour des dizaines de milliers de petits fichiers via SMB ; relance la même commande, elle reprend. |
| Espace insuffisant | Étape 0.3 : libérer ou changer de disque (déplacer le partage OMV). |

---

## Récapitulatif

| Élément | Valeur |
|---|---|
| Partage SMB | `\\<IP>\poroiniens-images` |
| Chemin physique NAS | `/srv/dev-disk-by-uuid-…/poroiniens-images` |
| URL des images | `http://<IP>:8082/<Série>/<Chapitre N>/<page>` |
| Stack images | `…/appdata/poroiniens-images/docker-compose.images.yml` |
| Site dev (optionnel) | `http://<IP>:3100` |
