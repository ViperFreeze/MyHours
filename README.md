# MyHours — version hors ligne

MyHours est une appli web installable (PWA) pour suivre vos heures de bénévolat. Une fois installée, elle s'ouvre depuis l'écran d'accueil et fonctionne sans connexion. Vos données restent sur l'appareil.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'interface |
| `app.js` | Le fonctionnement (calculs, stockage, export/import) |
| `sw.js` | Le service worker qui met l'appli en cache pour le hors ligne |
| `manifest.webmanifest` | Nom, couleurs et icônes pour l'installation |
| `icons/` | Le logo MyHours (`logo-mark.png`, plus `logo-full.png` comme image source) et les icônes d'installation générées à partir de lui |

## 1. Mettre l'appli en ligne (une seule fois)

Le téléphone doit télécharger l'appli une première fois depuis une adresse en `https://`. Le plus simple et gratuit : GitHub Pages.

1. Connectez-vous sur github.com (ou créez un compte gratuit).
2. Créez un nouveau dépôt, par exemple `myhours`, en **Public**.
3. Dans le dépôt : **Add file → Upload files**, puis glissez **tout le contenu** du dossier (les fichiers et le dossier `icons`). Validez avec **Commit changes**.
4. Allez dans **Settings → Pages**. Dans *Build and deployment*, choisissez **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
5. Après une à deux minutes, l'appli est disponible à l'adresse `https://viperfreeze.github.io/myhours/`.

Le dépôt public rend le **code** visible, pas vos heures : elles ne quittent jamais votre téléphone.

## 2. Installer sur le téléphone

Ouvrez l'adresse ci-dessus **avec du réseau**, puis :

- **Android (Chrome)** : touchez **Installer** dans le bandeau de l'appli, ou menu ⋮ → **Installer l'application**.
- **iPhone (Safari)** : bouton **Partager** → **Sur l'écran d'accueil**.

Ouvrez l'appli une fois depuis l'icône. Ensuite, elle fonctionne en mode avion.

## 3. Synchroniser entre appareils

Il n'y a pas de serveur : la synchronisation se fait à la main avec le bouton **Synchroniser**.

1. Sur l'appareil A : **Exporter**, puis envoyez-vous le fichier (Drive, mail, messagerie…).
2. Sur l'appareil B : **Importer** ce fichier.
3. Les deux carnets sont fusionnés. Rien n'est écrasé, et les suppressions sont reportées. Si l'appareil B avait aussi des nouveautés, l'appli vous propose de refaire l'opération dans l'autre sens.

Une séance planifiée validée sur deux appareils n'est comptée qu'une fois après la fusion.

Le point orange sur **Synchroniser** signale des modifications pas encore exportées.

## 4. Sauvegarde automatique

Une fois activée, chaque modification est copiée quelques secondes plus tard dans un **Gist privé** de votre compte GitHub. GitHub garde l'historique de toutes les versions.

1. Dans MyHours : **Réglages → Sauvegarde automatique → Créez-le sur GitHub**. La page de création du jeton s'ouvre avec la case **gist** déjà cochée.
2. Choisissez **No expiration**, validez, copiez le jeton (`ghp_…`).
3. Collez-le dans MyHours et touchez **Activer**.

Le jeton reste sur le téléphone : il n'est jamais dans la sauvegarde ni dans un export. Il ne donne accès qu'à vos gists.

- **Hors ligne**, la copie part dès le retour du réseau. L'état est affiché en bas de l'écran.
- **Le lien « Sauvegarder »** en bas de l'écran force une sauvegarde immédiate. Sans sauvegarde automatique, il crée un fichier à la place.
- **Nouveau téléphone ou réinstallation** : collez le même jeton, la sauvegarde est retrouvée et fusionnée avec ce qui est sur l'appareil. Rien n'est écrasé.
- **Retrouver une ancienne version** : sur gist.github.com, ouvrez le Gist « MyHours – sauvegarde automatique », onglet **Revisions**.

## 5. Modifier l'appli sans la réinstaller

Inutile de désinstaller : l'appli se met à jour toute seule.

1. Modifiez les fichiers et renvoyez-les sur GitHub (**Add file → Upload files** en remplaçant les anciens, ou `git push`).
2. Attendez une à deux minutes que GitHub Pages publie la nouvelle version.
3. Ouvrez MyHours avec du réseau. Elle démarre d'abord sur la version en cache, vérifie tous les fichiers en arrière-plan, les remplace ensemble s'il y a du nouveau, puis affiche **« Une nouvelle version est prête »**. Touchez **Mettre à jour**.

Vos heures sont conservées : elles ne sont pas stockées dans les fichiers de l'appli. Si la bannière n'apparaît pas tout de suite, fermez l'appli et rouvrez-la (GitHub Pages peut garder l'ancienne version en cache une dizaine de minutes).

**Cas de l'icône** : Android met à jour l'icône de l'écran d'accueil de lui-même, parfois avec un délai. Sur iPhone, l'icône reste celle de l'installation. Pour la changer, il faut retirer l'appli de l'écran d'accueil et la rajouter, ce qui efface ses données : **exportez d'abord**, réinstallez, puis importez le fichier.

## À savoir

- **Sauvegarde** : désinstaller l'appli ou effacer les données du navigateur supprime le carnet du téléphone. Activez la sauvegarde automatique (section 4), ou exportez de temps en temps : le fichier sert aussi de sauvegarde.
- **iPhone** : l'appli installée et Safari ont chacun leur propre stockage. Utilisez toujours l'icône de l'écran d'accueil.
- **Tester sur ordinateur** : dans le dossier, lancez `python -m http.server 8000` puis ouvrez `http://localhost:8000`. En ouvrant `index.html` directement par double-clic, l'appli fonctionne mais le mode hors ligne n'est pas actif.
