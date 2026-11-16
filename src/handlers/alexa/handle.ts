import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { SpokenItem, parseSpokenItems } from '../../domain/spokenParser';
import { extractItemsWithModel } from '../../services/bedrock';
import { validateSkillId, validateTimestamp, verifyAlexaRequest } from '../../services/alexaVerify';
import { VoiceAddResult, addSpokenItems } from '../../services/voiceAdd';
import { api, verifyAccessToken } from '../../utils/handler';
import { success } from '../../utils/response';
import { HttpError } from '../../utils/validation';

/** Dépendances remplaçables en test. */
export interface AlexaDeps {
  verifyRequest: (event: APIGatewayProxyEventV2, rawBody: string) => Promise<void>;
  skillIds: () => string[];
  userFromToken: (token: string) => Promise<string>;
  extract: (phrase: string) => Promise<SpokenItem[]>;
  now: () => number;
}

const UNIT_WORDS: Record<string, [string, string]> = {
  KG: ['kilo', 'kilos'],
  G: ['gramme', 'grammes'],
  L: ['litre', 'litres'],
  ML: ['millilitre', 'millilitres'],
  BOTTLE: ['bouteille', 'bouteilles'],
  PACK: ['paquet', 'paquets'],
};

function format(n: number): string {
  return String(n).replace('.', ',');
}

/** « 300 grammes de tomate », « 3 steak » : formulation pour la synthèse vocale. */
export function spokenQuantity(quantity: number, unit: string, name: string): string {
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  const words = UNIT_WORDS[unit];
  if (!words) return `${format(quantity)} ${lower}`;
  const article = /^[aeiouyhàâéèêëîïôûœ]/i.test(lower) ? "d'" : 'de ';
  return `${format(quantity)} ${quantity > 1 ? words[1] : words[0]} ${article}${lower}`;
}

export function describeResults(list: string, added: VoiceAddResult[], rejected: string[]): string {
  const parts: string[] = [];
  const done = added.filter((a) => a.status !== 'UNCHANGED');
  if (done.length > 0) {
    parts.push(`C'est fait : ${done.map((a) => spokenQuantity(a.quantity, a.unit, a.name)).join(', ')}, ajouté à ${list}.`);
  }
  for (const a of added.filter((r) => r.status === 'UNCHANGED')) {
    parts.push(`${a.name} est déjà dans ${list} avec une autre unité, je n'ai rien changé.`);
  }
  const created = added.filter((a) => a.isNewProduct).map((a) => a.name);
  if (created.length > 0) parts.push(`Nouveau produit : ${created.join(', ')}.`);
  if (rejected.length > 0) parts.push(`Je n'ai pas compris : ${rejected.join(', ')}.`);
  return parts.join(' ');
}

export interface AlexaResponse {
  version: string;
  response: {
    outputSpeech?: { type: string; text: string };
    reprompt?: { outputSpeech: { type: string; text: string } };
    card?: { type: string };
    shouldEndSession?: boolean;
  };
}

const say = (text: string, end = true, extra: Record<string, unknown> = {}): AlexaResponse => ({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text },
    ...(end ? {} : { reprompt: { outputSpeech: { type: 'PlainText', text: 'Que veux-tu ajouter ?' } } }),
    shouldEndSession: end,
    ...extra,
  },
});

const linkAccount = () =>
  say("Pour utiliser Kaddie, associe d'abord ton compte dans l'application Alexa.", true, { card: { type: 'LinkAccount' } });

/** Corps de réponse pour une requête Alexa déjà authentifiée (signature, skill et date vérifiées avant). */
export async function respond(body: any, deps: Pick<AlexaDeps, 'userFromToken' | 'extract'>): Promise<AlexaResponse> {
  const request = body?.request;
  switch (request?.type) {
    case 'SessionEndedRequest':
      return { version: '1.0', response: {} };
    case 'LaunchRequest':
      return say('Que veux-tu ajouter à ta liste ?', false);
    case 'IntentRequest':
      break;
    default:
      return say("Je n'ai pas compris.");
  }

  const intent = request.intent?.name;
  if (intent === 'AMAZON.HelpIntent') {
    return say('Dis par exemple : ajoute trois steaks et 300 grammes de tomates. Je les ajoute à ta liste la plus récente.', false);
  }
  if (intent === 'AMAZON.StopIntent' || intent === 'AMAZON.CancelIntent' || intent === 'AMAZON.NavigateHomeIntent') {
    return say('À bientôt !');
  }
  if (intent !== 'AddIntent') {
    return say("Dis par exemple : ajoute des tomates.", false);
  }

  const token: string | undefined = body?.context?.System?.user?.accessToken ?? body?.session?.user?.accessToken;
  if (!token) return linkAccount();
  let userId: string;
  try {
    userId = await deps.userFromToken(token);
  } catch {
    return linkAccount();
  }

  const phrase: string = request.intent?.slots?.produits?.value ?? '';
  if (!phrase.trim()) return say('Que veux-tu ajouter ?', false);

  let items: SpokenItem[];
  try {
    items = await deps.extract(phrase);
  } catch (err) {
    // Modèle indisponible ou réponse inutilisable : analyse à règles, moins souple mais sans réseau.
    console.warn('Extraction par le modèle impossible, repli sur les règles', err);
    items = parseSpokenItems(phrase);
  }
  if (items.length === 0) return say("Je n'ai pas trouvé de produit dans ta phrase. Essaie : ajoute des tomates.", false);

  const { list, added, rejected } = await addSpokenItems(userId, items);
  if (added.length === 0) return say(describeResults(list.name, added, rejected) || "Je n'ai rien ajouté.", false);
  return say(describeResults(list.name, added, rejected));
}

export const defaultDeps: AlexaDeps = {
  verifyRequest: (event, rawBody) => verifyAlexaRequest(event.headers ?? {}, rawBody),
  skillIds: () => (process.env.ALEXA_SKILL_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  userFromToken: verifyAccessToken,
  extract: extractItemsWithModel,
  now: Date.now,
};

export function createHandler(deps: AlexaDeps = defaultDeps) {
  // Pas d'authentification par en-tête : l'identité vient du jeton de liaison de compte, après la signature d'Amazon.
  return api(
    async ({ event, body }) => {
      const rawBody = event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : event.body ?? '';
      const allowed = deps.skillIds();
      if (allowed.length === 0) throw new HttpError(500, 'Skill non configurée');
      try {
        await deps.verifyRequest(event, rawBody);
        validateSkillId(body, allowed);
        validateTimestamp(body?.request?.timestamp, deps.now());
      } catch (err) {
        // Ne journalise jamais le corps (il contient le jeton de l'utilisateur), seulement la raison du refus.
        console.warn('Requête Alexa refusée', {
          reason: err instanceof Error ? err.message : String(err),
          type: body?.request?.type,
          certUrl: event.headers?.signaturecertchainurl,
          hasSignature: !!event.headers?.['signature-256'],
        });
        throw err;
      }
      return success(200, await respond(body, deps));
    },
    { auth: false },
  );
}

export const handler = createHandler();
