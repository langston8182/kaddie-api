import { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/** Pages publiques exigées par Google (écran de consentement OAuth / branding). Contenu statique, sans base de données. */

const CONTACT = 'cyril.marchive@gmail.com';
const UPDATED = '16 novembre 2026';

function page(title: string, body: string): APIGatewayProxyStructuredResultV2 {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Kaddie</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px 20px 64px; }
  h1 { font-size: 1.9rem; margin-bottom: .25rem; }
  h2 { font-size: 1.2rem; margin-top: 2rem; }
  nav a { margin-right: 14px; }
  .muted { opacity: .7; font-size: .9rem; }
  a { color: #1b6b4a; }
  @media (prefers-color-scheme: dark) { a { color: #8bd6ad; } }
</style>
</head>
<body>
<nav><a href="/">Kaddie</a><a href="/confidentialite">Confidentialité</a><a href="/conditions">Conditions</a><a href="/suppression-compte">Supprimer mon compte</a></nav>
<h1>${title}</h1>
${body}
<p class="muted">Dernière mise à jour : ${UPDATED}.</p>
</body>
</html>`;
  return {
    statusCode: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    body: html,
  };
}

export const home = async () =>
  page(
    'Kaddie',
    `<p>Kaddie est une application Android de listes de courses, moderne, rapide et pensée pour être utilisée pendant les courses.</p>
<ul>
  <li>Plusieurs listes : créez, renommez, dupliquez et réutilisez vos listes (par exemple « Courses de la semaine »).</li>
  <li>Ajout rapide grâce à un dictionnaire d'environ 1 000 produits, avec reconnaissance des pluriels, des accents et des fautes de frappe.</li>
  <li>Un même produit n'apparaît qu'une fois par liste : les quantités sont additionnées et les unités converties (500 g + 1 kg = 1,5 kg).</li>
  <li>Fonctionne entièrement hors connexion ; vos listes restent sur votre téléphone.</li>
  <li>Connexion facultative avec votre compte Google pour sauvegarder vos listes.</li>
</ul>
<p>Contact : <a href="mailto:${CONTACT}">${CONTACT}</a></p>
<p><a href="/confidentialite">Politique de confidentialité</a> · <a href="/conditions">Conditions d'utilisation</a> · <a href="/suppression-compte">Supprimer mon compte</a></p>`,
  );

export const privacy = async () =>
  page(
    'Politique de confidentialité',
    `<p>Cette politique explique quelles données l'application Android Kaddie traite, pourquoi, et comment les supprimer.</p>

<h2>Données traitées</h2>
<ul>
  <li><strong>Sur votre téléphone</strong> : vos listes de courses, leurs produits (nom, quantité, unité, note, état « acheté »), les produits que vous ajoutez au dictionnaire et vos réglages d'affichage. Sans connexion, ces données restent uniquement sur votre appareil.</li>
  <li><strong>Si vous vous connectez avec Google</strong> : votre identifiant de compte, votre adresse e-mail et votre nom, communiqués par Google à notre service d'authentification (Amazon Cognito) avec votre accord. Seul l'identifiant de compte est utilisé par le serveur pour rattacher vos données.</li>
  <li><strong>Si vous utilisez Alexa</strong> (skill « ma liste perso », facultative) : la phrase que vous dictez (« ajoute trois steaks ») est traitée par Amazon Alexa, puis envoyée à notre serveur, qui la fait analyser par Amazon Bedrock (service d'IA d'Amazon Web Services, région Europe) pour en extraire les produits. Elle n'est pas conservée par Kaddie et n'est pas utilisée pour entraîner des modèles.</li>
  <li><strong>Sauvegarde</strong> : une fois connecté, vos listes, produits et produits personnalisés sont envoyés à notre serveur pour être sauvegardés et retrouvés.</li>
</ul>
<p>Kaddie ne collecte ni votre position, ni vos contacts, ni vos photos, n'affiche aucune publicité et n'utilise aucun outil de mesure d'audience ou de profilage.</p>

<h2>Finalités</h2>
<p>Les données servent uniquement à faire fonctionner l'application : afficher vos listes, les sauvegarder et vous reconnecter à votre compte. Elles ne sont ni vendues, ni louées, ni utilisées à des fins publicitaires.</p>

<h2>Prestataires et hébergement</h2>
<ul>
  <li><strong>Google</strong> : connexion avec votre compte Google.</li>
  <li><strong>Amazon Alexa</strong> et <strong>Amazon Bedrock</strong> : uniquement si vous utilisez la skill Alexa, pour comprendre vos phrases.</li>
  <li><strong>Amazon Web Services</strong> (Amazon Cognito, API Gateway, Lambda) : authentification et API, région Europe (Paris).</li>
  <li><strong>MongoDB Atlas</strong> : base de données où sont stockées vos listes sauvegardées.</li>
</ul>
<p>Les échanges avec le serveur sont chiffrés (HTTPS). Sur votre téléphone, les jetons de connexion sont stockés chiffrés avec le système de sécurité d'Android.</p>

<h2>Durée de conservation</h2>
<p>Vos données sont conservées tant que votre compte existe. Elles sont supprimées à la suppression de votre compte (voir ci-dessous).</p>

<h2>Vos droits et la suppression</h2>
<p>Vous pouvez à tout moment accéder à vos données, les corriger ou les supprimer. Se déconnecter dans l'application conserve les listes sur le téléphone ; désinstaller l'application les efface de l'appareil. Pour supprimer votre compte et les données sauvegardées sur le serveur, consultez la page <a href="/suppression-compte">Supprimer mon compte</a> ou écrivez à <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

<h2>Contact</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>`,
  );

export const terms = async () =>
  page(
    "Conditions d'utilisation",
    `<p>En utilisant l'application Android Kaddie, vous acceptez les conditions suivantes.</p>

<h2>Le service</h2>
<p>Kaddie permet de créer et gérer des listes de courses. L'application est gratuite et fonctionne sans compte ; la connexion avec Google est facultative et sert à sauvegarder vos listes.</p>

<h2>Votre compte et vos données</h2>
<p>Vous restez propriétaire du contenu de vos listes. Vous vous engagez à ne pas utiliser le service de façon illicite, ni à tenter d'en perturber le fonctionnement ou d'accéder aux données d'autres utilisateurs. Le traitement de vos données est décrit dans la <a href="/confidentialite">politique de confidentialité</a>.</p>

<h2>Disponibilité</h2>
<p>Le service est fourni « en l'état », sans garantie de disponibilité permanente. Il peut être interrompu ou modifié, y compris pour maintenance. L'application reste utilisable hors connexion avec les données de votre téléphone.</p>

<h2>Responsabilité</h2>
<p>Dans la limite permise par la loi, l'éditeur ne peut être tenu responsable des dommages indirects liés à l'utilisation de l'application ou à une perte de données.</p>

<h2>Suppression et évolution des conditions</h2>
<p>Vous pouvez supprimer votre compte à tout moment (voir <a href="/suppression-compte">Supprimer mon compte</a>). Ces conditions peuvent évoluer ; la date de dernière mise à jour figure en bas de page. Le droit français s'applique.</p>

<h2>Contact</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>`,
  );

export const deleteAccount = async () =>
  page(
    'Supprimer mon compte',
    `<p>Vous pouvez supprimer votre compte Kaddie et toutes les données sauvegardées sur le serveur (listes, produits, produits personnalisés).</p>

<h2>Comment faire</h2>
<p>Envoyez un e-mail à <a href="mailto:${CONTACT}">${CONTACT}</a> depuis l'adresse associée à votre compte Google, avec l'objet « Suppression de compte Kaddie ». Votre compte et vos données sont supprimés dans un délai raisonnable, et vous recevez une confirmation.</p>

<h2>Données sur votre téléphone</h2>
<p>Les listes enregistrées sur votre appareil ne sont pas concernées : pour les effacer, désinstallez l'application ou videz son stockage dans les réglages d'Android.</p>

<h2>Retirer l'accès de Google</h2>
<p>Vous pouvez aussi retirer l'accès de Kaddie à votre compte Google depuis <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>`,
  );
