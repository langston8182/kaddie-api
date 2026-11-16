import { Unit } from './constants';

export interface SpokenItem {
  name: string;
  quantity: number;
  unit: Unit;
}

/**
 * Analyse « à règles » d'une phrase dictée (« deux kilos de tomates, du lait et 500 g de farine »).
 * Sert de secours quand le modèle de langage est indisponible ; équivalent du VoiceParser de l'application Android.
 */
const SEPARATORS = /\s*(?:(?<!\d),|,(?!\d)|;|\bet\b|\bpuis\b|\bainsi que\b)\s*/;
const NUMBER_WITH_UNIT = /^(\d+(?:[.,]\d+)?)(kg|g|l|ml|cl)$/;
const DIGITS = /^\d+(?:[.,]\d+)?$/;
const ARTICLES = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'un', 'une']);

export const NUMBER_WORDS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60, cent: 100,
};

const UNITS: Record<string, [Unit, number]> = {};
function addUnits(unit: Unit, factor: number, ...words: string[]) {
  for (const w of words) UNITS[w] = [unit, factor];
}
addUnits('KG', 1, 'kg', 'kilo', 'kilos', 'kilogramme', 'kilogrammes');
addUnits('G', 1, 'g', 'gramme', 'grammes', 'gr');
addUnits('L', 1, 'l', 'litre', 'litres');
addUnits('ML', 1, 'ml', 'millilitre', 'millilitres');
addUnits('ML', 10, 'cl', 'centilitre', 'centilitres');
addUnits('BOTTLE', 1, 'bouteille', 'bouteilles');
addUnits('PACK', 1, 'paquet', 'paquets', 'boite', 'boites');
addUnits('PIECE', 1, 'piece', 'pieces', 'unite', 'unites');
addUnits('PIECE', 12, 'douzaine', 'douzaines');

export const plain = (token: string) => token.normalize('NFD').replace(/\p{Mn}+/gu, '');

function leadingNumber(token: string): number | undefined {
  if (DIGITS.test(token)) return Number(token.replace(',', '.'));
  return NUMBER_WORDS[plain(token)];
}

function parseSegment(segment: string): SpokenItem | undefined {
  const tokens = segment.replace(/['’]/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return undefined;

  let quantity: number | undefined;
  let unit: Unit | undefined;

  const withUnit = NUMBER_WITH_UNIT.exec(tokens[0]);
  if (withUnit) {
    const [u, factor] = UNITS[withUnit[2]];
    quantity = Number(withUnit[1].replace(',', '.')) * factor;
    unit = u;
    tokens.shift();
  }
  if (quantity === undefined) {
    quantity = leadingNumber(tokens[0]);
    if (quantity !== undefined) tokens.shift();
  }
  if (unit === undefined && quantity !== undefined && tokens.length > 0) {
    const found = UNITS[plain(tokens[0])];
    if (found) {
      unit = found[0];
      quantity *= found[1];
      tokens.shift();
    }
  }
  while (tokens.length > 0 && ARTICLES.has(plain(tokens[0]))) tokens.shift();
  if (tokens.length === 0) return undefined;

  const q = quantity ?? 1;
  if (!(q > 0)) return undefined;
  const name = tokens.join(' ');
  return { name: name.charAt(0).toUpperCase() + name.slice(1), quantity: Math.round(q * 1000) / 1000, unit: unit ?? 'PIECE' };
}

export function parseSpokenItems(text: string): SpokenItem[] {
  return text
    .trim()
    .toLowerCase()
    .split(SEPARATORS)
    .map(parseSegment)
    .filter((item): item is SpokenItem => item !== undefined);
}
