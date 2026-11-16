/** Normalisation identique à celle de l'application Android, pour que les clés de produits coïncident. */

const DIACRITICS = /\p{Mn}+/gu;
const SEPARATORS = /[^a-z0-9]+/g;

export function normalize(input: string): string {
  const lowered = input.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  return lowered.normalize('NFD').replace(DIACRITICS, '').replace(SEPARATORS, ' ').trim();
}

function singularize(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.length > 4 && (word.endsWith('eaux') || word.endsWith('oux'))) return word.slice(0, -1);
  return word;
}

/** Forme normalisée dont chaque mot est ramené à un singulier prudent (variantes de pluriel). */
export function productKey(input: string): string {
  return normalize(input)
    .split(' ')
    .filter(Boolean)
    .map(singularize)
    .join(' ');
}

export function displayName(input: string): string {
  const cleaned = input.trim().replace(/\s+/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
