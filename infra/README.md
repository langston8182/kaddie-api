# CI/CD - Pipeline AWS (CodePipeline + CodeBuild)

Pipeline : **Source (GitHub)** → **Deploy Dev** (tests + `serverless deploy --stage dev`) → **Approbation manuelle** → **Deploy Prod** (tests + `serverless deploy --stage prod`).

## 1. Connexion GitHub (CodeStar Connection)

La connexion `langston8182-github` existe déjà et est `Available` :

`arn:aws:codestar-connections:eu-west-3:489767271637:connection/cac7195e-fd2b-44d9-9b43-59a6cf4867eb`

Vérifie que l'app AWS Connector for GitHub a accès au dépôt `langston8182/kaddie-api`, qui doit exister sur GitHub avec une branche `main`.

## 2. Secret Secrets Manager (déjà créé)

Le secret `kaddie/secrets` contient les deux environnements :

```json
{
  "preprod": { "MONGO_URI": "...", "DB_NAME": "kaddie" },
  "prod": { "MONGO_URI": "...", "DB_NAME": "kaddie" }
}
```

Le stage `dev` du pipeline lit la clé `preprod`, le stage `prod` lit la clé `prod`.
Chaque build récupère le secret via `aws secretsmanager get-secret-value` et exporte
`MONGODB_URI` / `MONGODB_DB_NAME` avant `serverless deploy` (voir `buildspec-dev.yml` /
`buildspec-prod.yml`).

## 3. Déployer le pipeline (CloudFormation)

```bash
aws cloudformation deploy \
  --template-file infra/pipeline.yml \
  --stack-name kaddie-api-pipeline \
  --capabilities CAPABILITY_NAMED_IAM \
  --region eu-west-3 \
  --parameter-overrides \
      CodeStarConnectionArn=arn:aws:codestar-connections:eu-west-3:489767271637:connection/cac7195e-fd2b-44d9-9b43-59a6cf4867eb \
      GitHubOwner=langston8182 \
      GitHubRepo=kaddie-api \
      GitHubBranch=main \
      SecretsManagerSecretName=kaddie/secrets \
      SecretsManagerSecretArn=arn:aws:secretsmanager:eu-west-3:489767271637:secret:kaddie/secrets-T4x5Y5
```

## 4. Déclenchement

Chaque `git push` sur `main` déclenche automatiquement : build + tests + déploiement `dev`. Le pipeline s'arrête ensuite sur l'étape d'approbation manuelle (visible dans la console CodePipeline) avant de déployer en `prod`.

## Fichiers

- `infra/pipeline.yml` — Stack CloudFormation (CodePipeline, CodeBuild, rôles IAM, bucket d'artefacts).
- `infra/buildspec-dev.yml` — Build + tests (unit + intégration) + `serverless deploy --stage dev`.
- `infra/buildspec-prod.yml` — Build + tests unitaires + `serverless deploy --stage prod`.

## Mise à jour du pipeline

Si tu modifies `infra/pipeline.yml`, relance la commande `aws cloudformation deploy` de l'étape 3 pour appliquer les changements (pas besoin de recréer la stack).
