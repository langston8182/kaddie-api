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

## Alexa (skill « mon kaddie »)

« Alexa, demande à mon kaddie d'ajouter trois steaks et 300 grammes de tomates. » Les produits sont ajoutés à la **liste modifiée le plus récemment** (créée sous le nom « Courses » s'il n'y en a aucune) et apparaissent dans l'app à sa prochaine synchronisation.

```
Echo → Alexa → POST /alexa (cette API) → Bedrock (Nova Lite) → ajout dans MongoDB → réponse vocale
```

- **Point d'entrée** : `POST /alexa` (`src/handlers/alexa/handle.ts`), hors `/v1`. Il vérifie, dans l'ordre : le certificat et la signature d'Amazon (`src/services/alexaVerify.ts`), l'identifiant de la skill (`ALEXA_SKILL_IDS`), la date (150 s), puis le jeton de liaison de compte (jeton d'accès Cognito, même vérificateur que l'app ; client Alexa = `COGNITO_ALEXA_CLIENT_ID`). L'identifiant utilisateur est le `sub` du jeton. Sans jeton valide, Alexa propose de lier le compte.
- **Compréhension** : `src/services/bedrock.ts` envoie la phrase à Bedrock (API Converse, `BEDROCK_MODEL_ID` = profil d'inférence `eu.amazon.nova-lite-v1:0`, région `BEDROCK_REGION` = `eu-west-3`) avec la liste des produits connus, et reçoit un JSON `{items:[{name,quantity,unit}]}`. Une unité ou une quantité n'est retenue que si elle figure dans la phrase (le modèle invente parfois « paquet » ou « litre »). Si Bedrock est indisponible, repli sur une analyse à règles (`src/domain/spokenParser.ts`).
- **Produits** : `src/data/dictionary.json` est une **copie** du dictionnaire de l'app (`app/src/main/assets/dictionary.json`), à garder synchronisée. Les produits du dictionnaire ont les mêmes identifiants `builtin:<clé>` que dans l'app, donc Alexa et l'app fusionnent les mêmes produits. Un produit inconnu devient un produit personnel ; les « noms » qui sont des phrases (plus de 5 mots) sont refusés.
- **Fusion** : comme dans l'app (quantités additionnées, unités compatibles converties). Si les unités sont incompatibles, Alexa n'arbitre pas : la quantité existante est conservée et elle le dit.
- **Modèle d'interaction** : `alexa/interaction-model.fr-FR.json` (nom d'invocation « mon kaddie », intention `AddIntent` avec un emplacement `produits` de type `AMAZON.SearchQuery`), à importer dans la console Alexa (Build → Interaction Model → JSON Editor).

### Mise en place

1. **Bedrock** : accès au modèle Nova Lite dans `eu-west-3` (profil d'inférence `eu.amazon.nova-lite-v1:0`). Les droits `bedrock:InvokeModel` sont dans `serverless.yml`.
2. **Cognito** : un client **confidentiel** (avec secret) par pool, Google activé, flux *Authorization code*, scopes `openid email profile` ; ses URL de rappel sont celles que la console Alexa affiche (Account Linking). L'identifiant du client est dans `custom.alexa.clientId` de `serverless.yml` (stage `dev` renseigné ; **prod à renseigner**).
3. **Skill** : type Personnalisée, français (France), invocation « mon kaddie », endpoint HTTPS `https://kaddie-api-preprod.cyrilmarchive.com/alexa` (certificat d'une autorité reconnue), Account Linking *Auth Code Grant* (URI `…/oauth2/authorize` et `…/oauth2/token` du domaine Cognito, authentification **HTTP Basic**).
4. **Déployer** l'API, puis tester dans l'onglet *Test* de la console (mode Développement) ou sur l'Echo.

## Erreurs

`{ "message": "...", "details": ... }` avec 400 (validation, `details` par champ), 401, 404, 409, 500.

## Suites prévues

- Pool Cognito pour dev/preprod (aujourd'hui `x-user-id`).
- Implémentation Android de `ShoppingRemoteDataSource` appelant cette API.
