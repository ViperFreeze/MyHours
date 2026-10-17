# MyHours — version hors ligne

MyHours est une appli web installable (PWA) pour suivre vos heures de prédication. Une fois installée, elle s'ouvre depuis l'écran d'accueil et fonctionne sans connexion. Vos données restent sur l'appareil.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'interface |
| `app.js` | Le fonctionnement (calculs, stockage, Google Agenda, sauvegardes) |
| `sw.js` | Le service worker qui met l'appli en cache pour le hors ligne |
| `manifest.webmanifest` | Nom, couleurs et icônes pour l'installation |
| `icons/` | Le logo MyHours et les icônes d'installation |
| `apercu.bat` | Aperçu de l'appli sur ordinateur (Windows) |

## 1. Mettre l'appli en ligne

L'appli est publiée avec GitHub Pages à l'adresse `https://viperfreeze.github.io/myhours/`.

Pour la mettre à jour : sur GitHub, **Add file → Upload files**, glissez le **contenu** du dossier (pas le dossier lui-même), puis **Commit changes**. Après une à deux minutes, ouvrez MyHours avec du réseau : elle affiche **« Une nouvelle version est prête »**. Touchez **Mettre à jour**. Vos heures sont conservées.

## 2. Installer sur le téléphone

Ouvrez l'adresse **avec du réseau**, puis :

- **Android (Chrome)** : touchez **Installer** dans le bandeau, ou menu ⋮ → **Installer l'application**.
- **iPhone (Safari)** : bouton **Partager** → **Sur l'écran d'accueil**.

## 3. Saisir ses heures

- **Objectif mensuel** : le grand compteur montre les heures du mois en cours. Il repart à zéro le 1er ; l'historique est conservé.
- **Calendrier** (onglet **Saisir**) : plus une case est bleue, plus vous avez fait d'heures ce jour-là. Les jours prévus sont en orange, un point rouge marque aujourd'hui. Changez de mois avec les flèches ou en glissant le doigt.
- **Ajouter des heures** : touchez un jour, choisissez le type, puis un bouton de durée, et touchez une deuxième fois pour confirmer. Un jour passé ou aujourd'hui compte en heures réalisées ; un jour à venir crée une sortie prévue. « Autre durée ou heure » permet une durée précise ou une heure de début.
- **Type d'activité** : **Prédic** (par défaut), **Étude** ou **Présentoir**. Le dernier type choisi reste sélectionné.
- **Sorties passées à valider** : une sortie prévue dont la date est passée apparaît en haut de **Saisir**. Validez-la (en corrigeant les heures si besoin) ou touchez **Pas faite**.
- **Planifier** : pour une sortie qui revient chaque semaine (jusqu'à 12 semaines). La liste **Sorties à venir** affiche le total d'heures prévues sur le mois en cours.

## 4. Google Agenda

- **Sans configuration** : chaque sortie prévue a un bouton **Agenda** qui ouvre Google Agenda avec l'événement pré-rempli, à confirmer.
- **Avec un ID client Google** : le bouton agenda en haut envoie toutes les sorties à venir d'un coup. Renvoyer met à jour sans doublon, et retire de l'agenda les sorties annulées entre-temps.

Pour l'ID client (une seule fois) : projet Google Cloud, activez **Google Calendar API** et **Google Drive API**, créez un ID client OAuth de type « Application Web » avec les origines `https://viperfreeze.github.io` et `http://localhost:8000`, puis collez-le dans **Réglages → ID client Google** (à faire sur chaque appareil).

## 5. Sauvegarder et synchroniser

Tout est dans **Réglages** :

- **Sauvegarde Google Drive** : une copie est faite à chaque envoi vers Google Agenda, ou avec **Sauvegarder maintenant**. **Restaurer depuis Google Drive** remet cette copie sur l'appareil (nouveau téléphone, réinstallation).
- **Fichier de sauvegarde** (sans compte Google) : **Exporter** crée un fichier à vous envoyer. **Importer** le fusionne sur l'autre appareil : rien n'est écrasé, les suppressions sont reportées.
- **Remettre les heures à zéro** : toutes, ou celles d'un mois. Deux appuis pour confirmer, puis **Annuler** reste disponible quelques secondes.

## 6. Autres réglages

- **Thème** : le premier bouton en haut passe de automatique (suit le téléphone) à clair, puis sombre. Le choix est gardé sur l'appareil.
- **Durée par défaut** des boutons rapides et **heures visées par mois** : dans **Réglages**, avec un aperçu du rythme à tenir avant d'enregistrer.

## À savoir

- Désinstaller l'appli ou effacer les données du navigateur supprime les heures de l'appareil : gardez une sauvegarde Drive ou un fichier exporté.
- **iPhone** : l'appli installée et Safari ont chacun leur stockage. Utilisez toujours l'icône de l'écran d'accueil. L'icône de l'écran d'accueil ne se met pas à jour sans réinstallation (sauvegardez d'abord).
- **Tester sur ordinateur** : double-cliquez sur `apercu.bat`, l'appli s'ouvre sur `http://localhost:8000`. En aperçu local, le mode hors ligne est désactivé pour toujours voir la dernière version.
