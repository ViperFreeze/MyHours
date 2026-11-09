# MyHours

MyHours est une appli web installable (PWA) pour suivre vos heures de prédication. Une fois installée, elle s'ouvre depuis l'écran d'accueil et fonctionne sans connexion.

Chaque utilisateur peut se connecter avec son compte Google ou une adresse e-mail. Ses heures sont alors sauvegardées automatiquement et retrouvées sur tous ses appareils. Sans compte, l'appli marche aussi, mais les heures restent seulement sur le téléphone.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | L'interface |
| `app.js` | Le fonctionnement (calculs, stockage, synchronisation, export/import) |
| `firebase-config.js` | La configuration de votre projet Firebase (à remplir une fois, section 2) |
| `firebase.js` | Le SDK Firebase (connexion et base de données), regroupé en un seul fichier pour marcher hors ligne. Ne pas modifier à la main |
| `firestore.rules` | Les règles de sécurité de la base, à copier dans la console Firebase |
| `sw.js` | Le service worker : cache hors ligne et notifications de rappel |
| `manifest.webmanifest` | Nom, couleurs et icônes pour l'installation |
| `icons/` | Le logo MyHours et les icônes d'installation |
| `outils/firebase-entry.js` | La liste des fonctions Firebase incluses dans `firebase.js` (section 7) |

## 1. Mettre l'appli en ligne (une seule fois)

Le téléphone doit télécharger l'appli une première fois depuis une adresse en `https://`. Le plus simple et gratuit : GitHub Pages.

1. Dans le dépôt GitHub : **Add file → Upload files**, puis glissez **tout le contenu** du dossier. Validez avec **Commit changes**.
2. Allez dans **Settings → Pages**. Dans *Build and deployment*, choisissez **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
3. Après une à deux minutes, l'appli est disponible à l'adresse `https://viperfreeze.github.io/myhours/`.

Le dépôt public rend le **code** visible, pas les heures des utilisateurs.

## 2. Activer les comptes et la synchronisation (une seule fois, environ 10 minutes)

Tant que cette étape n'est pas faite, l'appli marche normalement mais sans compte : les heures restent sur chaque téléphone.

### a. Créer le projet

1. Ouvrez [console.firebase.google.com](https://console.firebase.google.com) avec votre compte Google, puis **Créer un projet**. Nom : `myhours`. Google Analytics n'est pas utile : vous pouvez le désactiver.
2. Sur la page du projet, ajoutez une appli **Web** (icône `</>`). Nom : `MyHours`. Ne cochez pas Firebase Hosting.
3. Firebase affiche un bloc `const firebaseConfig = { apiKey: "…", authDomain: "…", … }`. Recopiez chaque valeur dans `firebase-config.js`, à la place des `""`.

Ces valeurs ne sont pas secrètes : elles disent seulement à l'appli quel projet utiliser. Ce sont les règles de sécurité (étape c) qui protègent les données.

### b. Activer la connexion

1. Menu **Authentication → Commencer**, onglet **Méthode de connexion** (Sign-in method).
2. Activez **Google** (choisissez votre e-mail comme adresse d'assistance), puis **Enregistrer**.
3. Activez aussi **Adresse e-mail/Mot de passe**, puis **Enregistrer**. C'est la solution de secours si la fenêtre Google ne s'ouvre pas (certains iPhone, en appli installée).
4. Onglet **Paramètres → Domaines autorisés** : ajoutez `viperfreeze.github.io`.

### c. Créer la base de données

1. Menu **Firestore Database → Créer une base de données**.
2. Emplacement : choisissez une région européenne, par exemple `europe-west9 (Paris)`. Ce choix est définitif.
3. Choisissez le **mode production**.
4. Onglet **Règles** : remplacez tout le contenu par celui du fichier `firestore.rules`, puis **Publier**.

Ces règles donnent à chaque utilisateur un seul document, que lui seul peut lire et modifier. Tout le reste de la base est fermé.

### d. Publier

Renvoyez `firebase-config.js` sur GitHub. Les téléphones qui ont déjà l'appli affichent **« Une nouvelle version est prête »** : touchez **Mettre à jour**.

**Coût** : le plan gratuit de Firebase (Spark) suffit largement, sans carte bancaire. Chaque synchronisation coûte une lecture et au plus une écriture, très loin des limites quotidiennes (50 000 lectures et 20 000 écritures).

## 3. Installer sur le téléphone

Ouvrez l'adresse de l'appli **avec du réseau**, puis :

- **Android (Chrome)** : touchez **Installer** dans le bandeau de l'appli, ou menu ⋮ → **Installer l'application**.
- **iPhone (Safari)** : bouton **Partager** → **Sur l'écran d'accueil**.

Ouvrez l'appli une fois depuis l'icône. Ensuite, elle fonctionne en mode avion.

## 4. Compte et synchronisation

Dans **Réglages → Compte et synchronisation**, touchez **Continuer avec Google**, ou ouvrez **Utiliser une adresse e-mail** pour créer un compte avec un mot de passe.

- **Rien d'autre à faire** : chaque modification part dans le compte quelques secondes plus tard. L'appli récupère aussi ce qui a changé sur les autres appareils, à l'ouverture, au retour dans l'appli et toutes les 2 minutes.
- **Heures déjà saisies** : à la première connexion, les heures déjà sur le téléphone sont ajoutées au compte. Rien n'est écrasé.
- **Hors ligne** : tout continue de marcher, et la synchronisation reprend au retour du réseau. L'état est affiché en bas de l'écran.
- **Plusieurs appareils** : connectez-vous avec le même compte sur chacun. Deux modifications faites en même temps sont fusionnées : aucune ne perd l'autre.
- **Nouveau téléphone** : installez l'appli et connectez-vous, tout est retrouvé.
- **Se déconnecter** : les heures restent dans le compte et sont effacées du téléphone, ce qui est utile s'il est partagé. Si des modifications ne sont pas encore envoyées, l'appli refuse la déconnexion tant que le réseau n'est pas revenu.
- **Mot de passe oublié** : saisissez l'e-mail, puis touchez **Mot de passe oublié**.

**Confidentialité** : chaque utilisateur ne voit que ses propres heures. En tant qu'administrateur du projet Firebase, vous pouvez techniquement voir les données dans la console. Dites-le aux personnes à qui vous partagez l'appli.

### Copie de secours

**Exporter** crée un fichier avec toutes les heures. **Importer** le fusionne avec le carnet : rien n'est écrasé, et les suppressions sont reportées. C'est utile comme sauvegarde personnelle, ou pour passer à MyHours avec un compte depuis un appareil resté sans compte.

## 5. Rappels de validation

Quand une sortie prévue est terminée depuis 30 minutes sans avoir été validée, MyHours envoie une notification. La toucher ouvre l'appli sur les sorties à valider.

Pour les activer : **Réglages → Rappels de validation → Activer les rappels**, puis acceptez les notifications. À faire sur chaque appareil.

Il n'y a pas de serveur de notifications : ce sont des notifications locales, et leur fiabilité dépend du téléphone.

- **Android, appli installée** : elles arrivent aussi appli fermée, mais Chrome choisit le moment de la vérification (en général toutes les quelques heures).
- **iPhone (iOS 16.4 ou plus, appli installée)** : la notification part quand l'appli est ouverte ou en arrière-plan. Appli complètement fermée, le rappel s'affiche à la prochaine ouverture.
- **Aperçu local** (`apercu.bat`) : pas de rappels, testez depuis l'adresse GitHub Pages.

## 6. Modifier l'appli sans la réinstaller

Inutile de désinstaller : l'appli se met à jour toute seule.

1. Modifiez les fichiers et renvoyez-les sur GitHub (**Add file → Upload files** en remplaçant les anciens, ou `git push`).
2. Attendez une à deux minutes que GitHub Pages publie la nouvelle version.
3. Ouvrez MyHours avec du réseau. Elle démarre sur la version en cache, vérifie tous les fichiers en arrière-plan, les remplace ensemble s'il y a du nouveau, puis affiche **« Une nouvelle version est prête »**. Touchez **Mettre à jour**.

Les heures sont conservées : elles ne sont pas stockées dans les fichiers de l'appli.

**Cas de l'icône sur iPhone** : l'icône reste celle de l'installation. Pour la changer, il faut retirer l'appli de l'écran d'accueil et la rajouter. Avec un compte, il suffit de se reconnecter ensuite. Sans compte, **exportez d'abord**, puis importez le fichier.

## 7. Mettre à jour le SDK Firebase (rarement utile)

`firebase.js` contient Firebase 13.2.0 (connexion et Firestore Lite), regroupé avec esbuild. Pour le régénérer avec une version plus récente, avec Node.js installé :

```
npm install firebase esbuild
npx esbuild outils/firebase-entry.js --bundle --minify --format=esm --target=es2020 --legal-comments=eof --outfile=firebase.js
```

## À savoir

- **Sans compte**, désinstaller l'appli ou effacer les données du navigateur supprime les heures du téléphone. Connectez-vous, ou exportez de temps en temps.
- **iPhone** : l'appli installée et Safari ont chacun leur propre stockage. Utilisez toujours l'icône de l'écran d'accueil.
- **Tester sur ordinateur** : double-cliquez sur `apercu.bat` (ou lancez `python -m http.server 8000` dans le dossier), puis ouvrez `http://localhost:8000`. La connexion fonctionne aussi en local, car Firebase autorise `localhost` par défaut.
