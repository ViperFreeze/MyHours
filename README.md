# MyHours — version hors ligne

MyHours est une appli web installable (PWA) pour suivre vos heures de prédication. Une fois installée, elle s'ouvre depuis l'écran d'accueil et fonctionne sans connexion. Vos données restent sur l'appareil.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'interface |
| `app.js` | Le fonctionnement (calculs, stockage, envoi vers Google Agenda) |
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

## 3. Saisir ses heures

- **Calendrier** : l'onglet **Saisir** affiche le mois. Plus une case est bleue, plus vous avez fait d'heures ce jour-là ; les jours prévus sont en orange, et un point rouge marque aujourd'hui. Changez de mois avec les flèches ou en glissant le doigt.
- **Ajouter des heures** : touchez un jour, choisissez le type, puis **+1 h**, **+1 h 30** ou **+2 h**. Un jour passé ou aujourd'hui compte en heures réalisées ; un jour à venir crée une prévision. « Autre durée ou heure » permet une durée précise ou une heure de début.
- **Type d'activité** : chaque saisie ou séance est une **Prédic** (par défaut), une **Étude** ou un **Présentoir**. Le type choisi reste sélectionné pour les fois suivantes.
- **Remettre à zéro** : bouton **Réglages** → *Remettre les heures à zéro*. Choisissez **Toutes les heures** ou un mois précis, puis touchez deux fois pour confirmer. Les séances planifiées et l'objectif ne changent pas. Un bouton **Annuler** apparaît quelques secondes en cas d'erreur.

## 4. Envoyer vers Google Agenda

Le bouton **Envoyer vers Google Agenda** (en haut) ajoute toutes les séances à venir dans votre agenda Google. Renvoyer met à jour les séances déjà envoyées sans créer de doublon, et retire de l'agenda celles annulées entre-temps.

Une seule fois avant : créez un ID client OAuth Google (projet Google Cloud, API Google Calendar activée, type « Application Web », origines `https://viperfreeze.github.io` et `http://localhost:8000`), puis collez-le dans **Réglages → ID client Google**. L'ID est gardé sur chaque appareil : à saisir une fois par appareil.

**Sauvegarde** : à chaque envoi, une copie de toutes les données est aussi gardée dans un dossier caché de votre Google Drive (activez aussi **Google Drive API** dans le projet Google Cloud). **Réglages → Restaurer depuis Google Drive** remet cette copie sur l'appareil (nouveau téléphone, réinstallation). **Sauvegarder maintenant** fait une copie sans passer par l'agenda.

## 5. Modifier l'appli sans la réinstaller

Inutile de désinstaller : l'appli se met à jour toute seule.

1. Modifiez les fichiers et renvoyez-les sur GitHub (**Add file → Upload files** en remplaçant les anciens, ou `git push`).
2. Attendez une à deux minutes que GitHub Pages publie la nouvelle version.
3. Ouvrez MyHours avec du réseau. Elle démarre d'abord sur la version en cache, vérifie les fichiers en arrière-plan, puis affiche **« Une nouvelle version est prête »**. Touchez **Mettre à jour**.

Vos heures sont conservées : elles ne sont pas stockées dans les fichiers de l'appli. Si la bannière n'apparaît pas tout de suite, fermez l'appli et rouvrez-la (GitHub Pages peut garder l'ancienne version en cache une dizaine de minutes).

**Cas de l'icône** : Android met à jour l'icône de l'écran d'accueil de lui-même, parfois avec un délai. Sur iPhone, l'icône reste celle de l'installation. Pour la changer, il faut retirer l'appli de l'écran d'accueil et la rajouter, ce qui efface ses données (heures réalisées comprises).

## À savoir

- **Sauvegarde** : les heures sont stockées sur l'appareil. Désinstaller l'appli ou effacer les données du navigateur les supprime : seule la dernière sauvegarde Google Drive permet de les récupérer.
- **iPhone** : l'appli installée et Safari ont chacun leur propre stockage. Utilisez toujours l'icône de l'écran d'accueil.
- **Tester sur ordinateur** : double-cliquez sur `apercu.bat`, l'appli s'ouvre sur `http://localhost:8000`. Après une modification, appuyez sur F5. En aperçu local, le mode hors ligne est désactivé pour toujours voir la dernière version.
