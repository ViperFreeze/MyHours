# MyHours — version hors ligne

MyHours est une appli web installable (PWA) pour suivre vos heures de bénévolat. Une fois installée, elle s'ouvre depuis l'écran d'accueil et fonctionne sans connexion. Vos données restent sur l'appareil.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'interface |
| `app.js` | Le fonctionnement (calculs, stockage, export/import) |
| `sw.js` | Le service worker qui met l'appli en cache pour le hors ligne |
| `manifest.webmanifest` | Nom, couleurs et icônes pour l'installation |
| `icons/` | Les icônes de l'appli |

## 1. Mettre l'appli en ligne (une seule fois)

Le téléphone doit télécharger l'appli une première fois depuis une adresse en `https://`. Le plus simple et gratuit : GitHub Pages.

1. Connectez-vous sur github.com (ou créez un compte gratuit).
2. Créez un nouveau dépôt, par exemple `myhours`, en **Public**.
3. Dans le dépôt : **Add file → Upload files**, puis glissez **tout le contenu** du dossier (les 4 fichiers et le dossier `icons`). Validez avec **Commit changes**.
4. Allez dans **Settings → Pages**. Dans *Build and deployment*, choisissez **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
5. Après une à deux minutes, l'appli est disponible à l'adresse `https://viperfreeze.github.io/myhours/`.

Le dépôt public rend le **code** visible, pas vos heures : elles ne quittent jamais votre téléphone.

## 2. Installer sur le téléphone

Ouvrez l'adresse ci-dessus **avec du réseau**, puis :

- **Android (Chrome)** : touchez **Installer** dans le bandeau de l'appli, ou menu ⋮ → **Installer l'application**.
- **iPhone (Safari)** : bouton **Partager** → **Sur l'écran d'accueil**.

Ouvrez l'appli une fois depuis l'icône. Ensuite, elle fonctionne en mode avion.

## 3. Prévoir une sortie

Dans **Saisir → Autre durée ou autre date**, choisissez une date à venir : la sortie est enregistrée en prévision et apparaît dans **Sorties à venir**, avec un bouton **Agenda** pour l'ajouter à Google Agenda. En haut de ce bloc, le total des heures prévues sur les 30 prochains jours se met à jour à chaque ajout ou annulation. Une fois la date passée, elle remonte dans **Sorties passées à valider**.

## 4. Synchroniser entre appareils

Il n'y a pas de serveur : la synchronisation se fait à la main avec le bouton **Synchro**.

1. Sur l'appareil A : **Exporter**, puis envoyez-vous le fichier (Drive, mail, messagerie…).
2. Sur l'appareil B : **Importer** ce fichier.
3. Les deux carnets sont fusionnés. Rien n'est écrasé, et les suppressions sont reportées. Si l'appareil B avait aussi des nouveautés, l'appli vous propose de refaire l'opération dans l'autre sens.

Le point orange sur **Synchro** signale des modifications pas encore exportées.

## 5. Modifier l'appli sans la réinstaller

Inutile de désinstaller : l'appli se met à jour toute seule.

1. Modifiez les fichiers et renvoyez-les sur GitHub (**Add file → Upload files** en remplaçant les anciens, ou `git push`).
2. Attendez une à deux minutes que GitHub Pages publie la nouvelle version.
3. Ouvrez MyHours avec du réseau. Elle démarre d'abord sur la version en cache, vérifie les fichiers en arrière-plan, puis affiche **« Une nouvelle version est prête »**. Touchez **Mettre à jour**.

Vos heures sont conservées : elles ne sont pas stockées dans les fichiers de l'appli. Si la bannière n'apparaît pas tout de suite, fermez l'appli et rouvrez-la (GitHub Pages peut garder l'ancienne version en cache une dizaine de minutes).

**Cas de l'icône** : Android met à jour l'icône de l'écran d'accueil de lui-même, parfois avec un délai. Sur iPhone, l'icône reste celle de l'installation. Pour la changer, il faut retirer l'appli de l'écran d'accueil et la rajouter, ce qui efface ses données : **exportez d'abord**, réinstallez, puis importez le fichier.

## À savoir

- **Sauvegarde** : désinstaller l'appli ou effacer les données du navigateur supprime le carnet. Exportez de temps en temps : le fichier sert aussi de sauvegarde.
- **iPhone** : l'appli installée et Safari ont chacun leur propre stockage. Utilisez toujours l'icône de l'écran d'accueil.
- **Google Agenda** : le bouton **Agenda** d'une sortie ouvre Google Agenda avec l'événement pré-rempli, à confirmer. Il faut du réseau à ce moment-là. Si vous annulez une sortie, retirez-la aussi de l'agenda vous-même.
- **Tester sur ordinateur** : dans le dossier, lancez `python -m http.server 8000` puis ouvrez `http://localhost:8000`. En ouvrant `index.html` directement par double-clic, l'appli fonctionne mais le mode hors ligne n'est pas actif.
