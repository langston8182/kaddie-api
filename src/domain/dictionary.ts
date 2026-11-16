import raw from '../data/dictionary.json';
import { productKey } from './text';

/**
 * Dictionnaire de base de l'application (copie de `app/src/main/assets/dictionary.json`). Les produits ont le même
 * identifiant que dans l'application (`builtin:<clé>`), pour que l'app et Alexa fusionnent les mêmes produits.
 */
export interface BuiltinProduct {
  id: string;
  name: string;
  category: string;
}

interface DictionaryFile {
  categories: Array<{ id: string; products: string[] }>;
}

const byKey = new Map<string, BuiltinProduct>();
const byCompact = new Map<string, BuiltinProduct>();
const names: string[] = [];

for (const category of (raw as DictionaryFile).categories) {
  for (const line of category.products) {
    const [name, ...aliases] = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (!name) continue;
    const key = productKey(name);
    if (!key) continue;
    const product: BuiltinProduct = { id: `builtin:${key}`, name, category: category.id };
    if (!byKey.has(key)) {
      byKey.set(key, product);
      byCompact.set(key.replace(/ /g, ''), product);
      names.push(name);
    }
    // Un alias n'écrase jamais un produit existant (« yaourt » → « Yaourt nature » seulement si « Yaourt » n'existe pas).
    for (const alias of aliases) {
      const aliasKey = productKey(alias);
      if (aliasKey && !byKey.has(aliasKey)) {
        byKey.set(aliasKey, product);
        byCompact.set(aliasKey.replace(/ /g, ''), product);
      }
    }
  }
}

/** Retrouve un produit du dictionnaire par son nom ou un alias (casse, accents, pluriel, tirets ignorés). */
export function findBuiltinProduct(name: string): BuiltinProduct | undefined {
  const key = productKey(name);
  if (!key) return undefined;
  return byKey.get(key) ?? byCompact.get(key.replace(/ /g, ''));
}

/** Noms des produits de base, pour guider le modèle de langage. */
export function builtinProductNames(): string[] {
  return names;
}
