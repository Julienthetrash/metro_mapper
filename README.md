# Mon Métro Paris

PWA (Progressive Web App) installable pour suivre les stations du métro parisien que vous avez visitées. **100 % local**, aucune donnée envoyée à un serveur.

- 16 lignes (1 → 14, plus 3bis et 7bis) — 321 stations
- 3 vues : carte interactive Leaflet, liste des lignes, statistiques + badges
- Stockage local via IndexedDB (Dexie)
- Offline (service worker, cache-first)
- Photos souvenirs (compressées avant stockage)
- Export / import JSON pour backup
- Pas de framework, pas d'étape de build — vanilla JS

## Lancer en local

```bash
cd mon-metro-paris
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

> Un service worker exige `http://localhost` ou `https://`. Ouvrir le fichier `index.html` directement ne fonctionnera pas (CORS, modules ES).

## Régénérer les données stations / lignes

Les fichiers `data/stations.json` et `data/lines.json` sont déjà committés. Pour les régénérer depuis l'open data IDFM :

```bash
python3 scripts/generate_data.py
# si l'API est inaccessible, télécharger le GeoJSON manuellement depuis
# https://data.iledefrance-mobilites.fr/explore/dataset/emplacement-des-gares-idf/
# puis :
python3 scripts/generate_data.py chemin/vers/emplacement-des-gares-idf.geojson
```

## Déployer sur GitHub Pages

1. Créer un repo GitHub (ex. `mon-metro-paris`).
2. Pousser ce dossier à la racine du repo (`git init && git add . && git commit -m "init" && git push`).
3. *Settings → Pages → Source : branche `main`, dossier `/root`*.
4. L'app est en ligne sur `https://<user>.github.io/mon-metro-paris/`.

Tous les chemins étant relatifs, l'app fonctionne aussi bien à la racine d'un domaine que dans un sous-chemin.

## Installer sur l'écran d'accueil

**iPhone (Safari)** : ouvrir l'URL → bouton Partager (carré avec flèche) → "Sur l'écran d'accueil" → l'icône M apparaît comme une vraie app.

**Android (Chrome)** : un bandeau "Installer" devrait s'afficher automatiquement ; sinon, menu ⋮ → "Installer l'application".

## ⚠️ Persistance sur iOS

Safari peut purger les données IndexedDB des PWA non utilisées pendant ~7 jours. Atténuations :

- L'app demande automatiquement un stockage persistant (`navigator.storage.persist()`).
- **Pensez à exporter votre progression** (Stats → Exporter JSON) régulièrement.

## Structure

```
mon-metro-paris/
├── index.html                  # Point d'entrée
├── manifest.json               # Manifest PWA
├── service-worker.js           # Cache offline
├── css/styles.css
├── js/
│   ├── app.js                  # Bootstrap + routing
│   ├── db.js                   # Couche Dexie
│   ├── data-loader.js
│   ├── views/                  # map / lines / stats / station-detail
│   ├── services/               # stats / badges / share
│   └── components/             # line-badge / progress-ring / toast
├── data/
│   ├── stations.json
│   └── lines.json
├── icons/
└── scripts/generate_data.py
```

## Crédits

- Données stations : [Île-de-France Mobilités](https://data.iledefrance-mobilites.fr/) (Licence Ouverte)
- Cartographie : [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Lib carte : [Leaflet](https://leafletjs.com/) + [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
- IndexedDB wrapper : [Dexie](https://dexie.org/)
# metro_mapper
