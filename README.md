# HMM · Humans Making Music

Code de la maquette HMM : sessions live, ateliers Ableton Live et performance électronique, Ottawa.

Cette version reprend la maquette fournie le 9 novembre 2026. Elle est autonome : HTML, CSS et JavaScript, sans framework, sans téléchargement de polices, sans dépendances et sans compte requis. Tous les titres et blocs sont du vrai HTML modifiable.

## Ouvrir la maquette

Décompresser le ZIP et ouvrir **index.html** dans un navigateur récent. Cela fonctionne sans installer Node.js.

Pour développer avec un serveur local, installer Node.js 18 ou plus récent, ouvrir un terminal dans ce dossier, puis :

```sh
npm run dev
```

Ouvrir http://localhost:4173. Aucune commande `npm install` n'est nécessaire. Le serveur fourni sert uniquement au développement local.

## Fichiers à modifier

| Fichier | Contenu |
| --- | --- |
| `index.html` | Textes, sections, informations des ateliers et fenêtres de détails |
| `workshops.html` | Page ateliers : liste des articles et fenêtres de lecture |
| `styles.css` | Mise en page ordinateur/mobile, typographie, couleurs |
| `config.js` | Titre/artistes de la session, vidéo, affiche, email et réseaux HMM |
| `app.js` | Interactions, fenêtres accessibles, lecture vidéo et liens |
| `assets/` | Logos SVG et image de référence |
| `scripts/serve.mjs` | Petit serveur de développement sans dépendances |
| `scripts/build.mjs` | Copie des fichiers du site dans `dist/` |

## Ajouter les contenus réels

Dans `config.js`, remplacer les valeurs `null` seulement quand les liens sont connus :

- `session.videoUrl` : URL HTTPS de la session (YouTube, Vimeo, etc.). Un clic sur la couverture intègre le lecteur YouTube au démarrage indiqué par `t`, ou ouvre le fournisseur dans un nouvel onglet pour les autres services. Aucun lecteur tiers n'est chargé avant le clic.
- `session.videoFile` : chemin d'un MP4/WebM local ou URL directe. Un lecteur HTML natif apparaît dans la fenêtre de session. Prioritaire sur `videoUrl`.
- `session.poster` : chemin d'une photo seule, par exemple `assets/session-001.jpg`. Elle remplace l'affiche définie dans `index.html` et reçoit un bouton de lecture dessiné en CSS.
- `contactEmail`, `instagramUrl`, `youtubeUrl` : coordonnées officielles de HMM.

Le statut devient « Watch now » dès qu'une vidéo valide est configurée. Sans vidéo, le bouton présente les détails « Coming soon ». Aucun enregistrement, formulaire, paiement ou message automatique n'est activé. Les réseaux non renseignés affichent un message explicite ; aucun compte HMM n'a été inventé. Ne mettre aucun secret dans les fichiers du site.

Les descriptifs complémentaires des ateliers sont des textes de présentation à affiner ensemble. Aucune date ni réservation n'est annoncée.

## Publier un article

`workshops.html` regroupe les articles de fond : sound design, techniques avancées, routage studio et mastering. Le lien « Workshops » de la navigation principale et « Explore workshops » sur l'accueil mènent à cette page.

Pour publier un article, dupliquer un bloc `<dialog id="...">` dans `workshops.html`, y écrire le texte, puis ajouter un bouton correspondant dans `.workshop-list` avec `data-dialog="..."` pointant vers cet identifiant. La page réutilise `styles.css` et `app.js`, sans dépendance ni compilation supplémentaire.

## Fidélité à la maquette

La page conserve le fond clair, le logo HMM, le titre sur deux lignes, la grande session, la section ateliers en deux colonnes sur ordinateur et le pied de page minimal. Sur petit écran, les blocs se réorganisent verticalement.

L'affiche de la session est une image YouTube (`i.ytimg.com`). `assets/hmm-reference.png` reste la maquette fournie et sert d'image de secours si l'affiche distante ne charge pas. Le conteneur est un véritable bouton accessible : au clic, le lecteur YouTube est intégré dans le bloc session, sans chargement tiers avant l'interaction. Le reste du site est du HTML/CSS, pas une image de page. Les logos SVG sont les fichiers HMM existants.

## Dépôt partagé

https://github.com/DigiAlchemydsp/Humans-Making-Music

Pour récupérer le projet :

```sh
git clone https://github.com/DigiAlchemydsp/Humans-Making-Music.git
cd Humans-Making-Music
npm run dev
```

Le dépôt étant privé, GitHub demandera une authentification autorisée pour le cloner.

## Travailler à deux

Garder `main` comme version de référence. Créer une branche pour chaque changement, par exemple `feature/workshops` ou `design/homepage`, puis ouvrir une pull request. Relire avant d'intégrer. Un seul fichier de configuration centralise les liens.

## Contrôler et préparer un hébergement

```sh
npm run check
npm run build
```

`dist/` contient uniquement les fichiers publics. Ils sont compatibles avec un hébergement statique et les sous-répertoires grâce aux chemins relatifs. Aucun domaine, analytics ou service externe n'est configuré.

## Activer GitHub Pages

Les fichiers statiques sont prêts à être publiés depuis `main`, dossier `/(root)`. Le fichier `.nojekyll` évite le traitement Jekyll. Aucune installation ni compilation n'est nécessaire pour cette méthode.

Un propriétaire, administrateur ou mainteneur du dépôt doit activer la publication :

1. Ouvrir https://github.com/DigiAlchemydsp/Humans-Making-Music/settings/pages.
2. Dans **Build and deployment → Source**, choisir **Deploy from a branch**.
3. Sélectionner **main** et **/(root)**, puis **Save**.
4. Attendre la réussite du déploiement **pages build and deployment** dans l'onglet **Actions**.
5. Revenir dans **Settings → Pages** et ouvrir l'adresse donnée par **Visit site**.

Après cette activation, chaque modification de `main` déclenche la mise à jour du site. La présence de ce fichier README ou de `.nojekyll` ne signifie pas, à elle seule, que Pages est déjà activé.

Pour conserver ce dépôt privé, GitHub Pages nécessite une offre compatible sur le compte propriétaire (GitHub Pro pour un compte personnel, ou une offre d'organisation compatible). Le site Pages standard est public même si le dépôt est privé. Aucun changement de visibilité du dépôt n'est effectué par ce projet.

Documentation : https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Accessibilité

Navigation au clavier, lien d'accès au contenu, indicateurs de focus, textes alternatifs, dialogues HTML natifs refermables par Échap et restitution du focus. La préférence de réduction des animations est respectée. Les liens d'ancrage et les textes restent consultables sans JavaScript ; les fenêtres de détails nécessitent JavaScript.

## Droits

Projet privé HMM. Aucune licence open source n'est accordée par cette livraison. La propriété et les droits de réutilisation des éléments de marque et des visuels restent à déterminer par leurs ayants droit avant une redistribution publique.
