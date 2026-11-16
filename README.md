# Kaddie API

API REST serverless (AWS Lambda + API Gateway HTTP API + MongoDB Atlas) pour l'application Android Kaddie. Même architecture que `gympulse-api` : TypeScript, Serverless Framework 3, esbuild, Mongoose, Jest + MongoDB en mémoire.

> **Rôle** : l'application reste *local-first* (la base Room locale est la source de vérité, tout fonctionne hors connexion). Cette API prépare la sauvegarde cloud et la synchronisation : identifiants UUID générés par le client, écritures rejouables, lectures incrémentales (`updatedSince`).
> **Authentification** : en `prod`, JWT Cognito (`Authorization: Bearer`, access ou id token), validé dans `resolveUserId` (`src/utils/handler.ts`) ; l'identifiant utilisateur est le `sub`. Le pool est configuré par stage dans `custom.cognito` de `serverless.yml`. Sans pool (dev/preprod), seul l'en-tête `x-user-id` est accepté (`ALLOW_DEV_USER_HEADER=true`).

## Démarrage

```sh
cp .env.example .env     # renseigner MONGODB_URI
npm install
npm run dev              # serverless offline sur http://localhost:3000
npm test                 # unitaires + intégration (MongoDB en mémoire)
npm run build            # vérification TypeScript
npm run deploy           # stage dev ; deploy:prod pour la prod
```

Exemple : `curl -H 'x-user-id: moi' http://localhost:3000/v1/lists`

## Structure

```
src/
├── config/db.ts          connexion MongoDB mise en cache (warm start Lambda)
├── domain/               règles métier pures (unités, fusion de quantités, normalisation)
├── models/               schémas Mongoose (+ index)
├── validators/           validation des payloads (400 avec détail par champ)
├── mappers/              modèle → DTO
├── services/items.ts     ajout/fusion d'un produit dans une liste
├── handlers/             une lambda par route (health, lists, items, products, account)
└── utils/                api() (auth, DB, erreurs), réponses, validation
tests/unit, tests/integration
```

## Routes (préfixe `/v1`)

Pages publiques HTML à la racine (hors `/v1`, sans authentification), pour l'écran de consentement Google : `/` (accueil), `/confidentialite`, `/conditions`, `/suppression-compte` (`src/handlers/site/pages.ts`).

| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Santé (public) |
| GET | `/lists?updatedSince=` | Listes avec `totalCount` / `remainingCount` |
| POST | `/lists` | Crée une liste `{ id?, name }` (409 si l'id existe) |
| GET | `/lists/{id}` | Liste + produits |
| PUT | `/lists/{id}` | Renomme, ou crée si absente (rejouable) |
| DELETE | `/lists/{id}` | Supprime la liste et ses produits |
| POST | `/lists/{id}/duplicate` | Copie (tout « à acheter »), corps optionnel `{ id?, name }` |
| POST | `/lists/{id}/uncheck` | Remet tous les produits « à acheter » |
| GET | `/lists/{id}/items?updatedSince=` | Produits de la liste |
| POST | `/lists/{id}/items` | Ajoute **ou fusionne** un produit (voir ci-dessous) |
| DELETE | `/lists/{id}/items[?purchased=true]` | Vide la liste, ou seulement les achetés |
| PUT | `/lists/{id}/items/{itemId}` | Modifie `quantity`, `unit`, `note`, `isPinned` (épinglé en haut de la liste) |
| PUT | `/lists/{id}/items/{itemId}/purchased` | Coche / décoche `{ purchased }` |
| DELETE | `/lists/{id}/items/{itemId}` | Supprime un produit |
| GET | `/products?updatedSince=` | Produits personnels de l'utilisateur |
| PUT | `/products/{id}` | Crée / met à jour un produit personnel `{ name, category }` (409 si équivalent existant) |
| DELETE | `/products/{id}` | Supprime (409 s'il est dans une liste) |
| GET | `/templates` | Modèles de listes de l'utilisateur (avec leurs produits) |
| PUT | `/templates/{id}` | Crée ou remplace un modèle `{ name, items: [{ productId, name, quantity, unit, note }] }` (max 50 modèles, 200 produits) |
| DELETE | `/templates/{id}` | Supprime un modèle |
| DELETE | `/account` | Supprime toutes les données de l'utilisateur |

Le dictionnaire de base (~1 000 produits) reste embarqué dans l'application ; l'API ne stocke que les produits créés par l'utilisateur.

### Ajout / fusion d'un produit

`POST /lists/{id}/items` avec `{ id?, productId, name, quantity = 1, unit = PIECE, note?, unitConflict? }` :

- produit absent de la liste → **201** `{ result: "ADDED", item }` ;
- déjà présent → quantités additionnées, unités compatibles converties (500 g + 1 kg = 1,5 kg) → **200** `{ result: "MERGED", item }` ; un produit déjà acheté repasse « à acheter » en conservant la quantité déjà achetée ;
- unités incompatibles → **409** `{ details: { code: "UNIT_CONFLICT", existing } }` ; renvoyer la requête avec `unitConflict: "REPLACE"` ou `"KEEP_EXISTING"` ;
- rejouer le même `id` d'article est sans effet (`UNCHANGED`).

Unités : `PIECE, PACK, BOTTLE, KG, G, L, ML`. Catégories : `fruits_legumes, viandes_poissons, produits_laitiers, epicerie, boissons, surgeles, boulangerie, hygiene, entretien, autres`.

### Cohérence sans transaction

L'index unique `(userId, listId, productId)` empêche tout doublon, et un compteur `version` (concurrence optimiste) permet de relire et recalculer la fusion si deux requêtes se croisent.

## Erreurs

`{ "message": "...", "details": ... }` avec 400 (validation, `details` par champ), 401, 404, 409, 500.

## Suites prévues

- Pool Cognito pour dev/preprod (aujourd'hui `x-user-id`).
- Suppressions « tombstones » pour une vraie synchronisation différentielle.
- Implémentation Android de `ShoppingRemoteDataSource` appelant cette API.
