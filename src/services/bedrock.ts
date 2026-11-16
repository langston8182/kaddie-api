import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { UNITS, Unit } from '../domain/constants';
import { builtinProductNames } from '../domain/dictionary';
import { NUMBER_WORDS, SpokenItem, plain } from '../domain/spokenParser';

const MAX_ITEMS = 20;
const TIMEOUT_MS = 5000;

export type Invoke = (system: string, phrase: string) => Promise<string>;

let client: BedrockRuntimeClient | undefined;

/** Appel Bedrock (API Converse), modèle et région réglables par variables d'environnement. */
const invokeBedrock: Invoke = async (system, phrase) => {
  client ??= new BedrockRuntimeClient({ region: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'eu-west-3' });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: process.env.BEDROCK_MODEL_ID || 'eu.amazon.nova-lite-v1:0',
        system: [{ text: system }],
        messages: [{ role: 'user', content: [{ text: phrase }] }],
        inferenceConfig: { maxTokens: 500, temperature: 0 },
      }),
      { abortSignal: abort.signal },
    );
    return response.output?.message?.content?.map((part) => part.text ?? '').join('') ?? '';
  } finally {
    clearTimeout(timer);
  }
};

export function buildSystemPrompt(): string {
  return `Tu extrais des produits de courses d'une phrase dictée à un assistant vocal, en français.
Réponds UNIQUEMENT avec un JSON de la forme {"items":[{"name":"Tomate","quantity":300,"unit":"G"}]}, sans aucun autre texte.
Règles :
- Un élément par produit demandé.
- "name" est le nom court du produit, au singulier, avec une majuscule initiale, sans quantité, sans verbe ni formule de politesse ("je veux trois avocats" donne "Avocat").
- Si le produit correspond à un nom de la liste ci-dessous, recopie exactement ce nom.
- Corrige les erreurs évidentes de transcription ("flocons davoine" donne "Flocons d'avoine").
- "quantity" est un nombre strictement positif (1 par défaut). Convertis les nombres écrits en lettres.
- "unit" vaut exactement l'une de : ${UNITS.join(', ')}. N'invente JAMAIS d'unité : si aucune unité n'est dite, mets PIECE (même pour des flocons, du lait ou du pain).
- Garde l'unité dite, sans convertir : "2 kilos" donne quantity 2 et unit KG (pas 2000 G) ; "300 grammes" donne G ; "2 litres" donne L ; "33 centilitres" donne quantity 330 et unit ML ; "une bouteille" donne BOTTLE ; "un paquet" donne PACK ; "une douzaine" donne quantity 12 et unit PIECE.
- Si la phrase ne contient aucun produit, réponds {"items":[]}.
Produits connus : ${builtinProductNames().join('; ')}`;
}

/** Extrait et valide le JSON renvoyé par le modèle ; lève une erreur s'il est inutilisable. */
export function parseModelOutput(text: string): SpokenItem[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Réponse du modèle sans JSON');
  const data = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(data?.items)) throw new Error('Réponse du modèle invalide');
  const items: SpokenItem[] = [];
  for (const raw of data.items.slice(0, MAX_ITEMS)) {
    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    const quantity = typeof raw?.quantity === 'number' ? raw.quantity : Number(raw?.quantity ?? 1);
    const unit = String(raw?.unit ?? 'PIECE').toUpperCase();
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) continue;
    items.push({
      name,
      quantity: Math.round(quantity * 1000) / 1000,
      unit: (UNITS as readonly string[]).includes(unit) ? (unit as Unit) : 'PIECE',
    });
  }
  return items;
}

const UNIT_MENTIONS: Partial<Record<Unit, RegExp>> = {
  KG: /\b(kg|kilos?|kilogrammes?)\b|\dkg\b/,
  G: /\b(g|gr|grammes?)\b|\dg\b/,
  L: /\b(l|litres?)\b|\dl\b/,
  ML: /\b(ml|millilitres?|cl|centilitres?)\b|\d(ml|cl)\b/,
  BOTTLE: /\bbouteilles?\b/,
  PACK: /\b(paquets?|boites?)\b/,
};

/**
 * Un modèle de langage peut « deviner » (flocons en paquet, yaourt en litre). Une unité ou une quantité n'est donc
 * retenue que si elle a réellement été dite ; sinon : 1 pièce.
 */
export function sanitizeAgainstPhrase(items: SpokenItem[], phrase: string): SpokenItem[] {
  const spoken = plain(phrase.toLowerCase()).replace(/['’]/g, ' ');
  const words = spoken.split(/\s+/);
  const saidNumber = /\d/.test(spoken) || words.some((w) => w in NUMBER_WORDS && w !== 'un' && w !== 'une') || /douzaine/.test(spoken);
  return items.map((item) => {
    const mention = UNIT_MENTIONS[item.unit];
    const unit = item.unit === 'PIECE' || (mention && mention.test(spoken)) ? item.unit : 'PIECE';
    const quantity = saidNumber ? item.quantity : 1;
    return unit === item.unit && quantity === item.quantity ? item : { ...item, unit, quantity: unit === 'PIECE' && item.unit !== 'PIECE' ? 1 : quantity };
  });
}

export async function extractItemsWithModel(phrase: string, invoke: Invoke = invokeBedrock): Promise<SpokenItem[]> {
  return sanitizeAgainstPhrase(parseModelOutput(await invoke(buildSystemPrompt(), phrase)), phrase);
}
