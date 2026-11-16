import { randomUUID } from 'crypto';
import { findBuiltinProduct } from '../domain/dictionary';
import { SpokenItem } from '../domain/spokenParser';
import { displayName, normalize, productKey } from '../domain/text';
import { ProductModel } from '../models/product.model';
import { ShoppingListModel } from '../models/shoppingList.model';
import { AddItemStatus, addItem } from './items';
import { Unit } from '../domain/constants';

export interface VoiceAddResult {
  name: string;
  quantity: number;
  unit: Unit;
  status: AddItemStatus;
  isNewProduct: boolean;
  /** Quantité totale dans la liste après l'ajout. */
  total: number;
  totalUnit: Unit;
}

const MAX_NAME_LENGTH = 40;
const MAX_NAME_WORDS = 5;

/**
 * Produit visé par un nom dicté : dictionnaire de base d'abord (mêmes identifiants que l'application), puis
 * produits personnels de l'utilisateur, sinon création d'un produit personnel. Les « noms » qui sont en réalité
 * des phrases (« je veux trois avocats ») sont refusés plutôt que créés.
 */
export async function resolveProduct(userId: string, spokenName: string) {
  const builtin = findBuiltinProduct(spokenName);
  if (builtin) return { id: builtin.id, name: builtin.name, isNew: false };

  const name = displayName(spokenName);
  const key = productKey(name);
  if (!key || name.length > MAX_NAME_LENGTH || name.split(' ').length > MAX_NAME_WORDS || !/\p{L}/u.test(name)) return undefined;

  const existing = await ProductModel.findOne({ userId, key }).lean();
  if (existing) return { id: existing.id, name: existing.name, isNew: false };
  try {
    const created = await ProductModel.create({
      userId,
      id: randomUUID(),
      name,
      normalized: normalize(name),
      key,
      category: 'autres',
    });
    return { id: created.id, name: created.name, isNew: true };
  } catch (err: any) {
    if (err?.code !== 11000) throw err;
    const raced = await ProductModel.findOne({ userId, key }).lean();
    return raced ? { id: raced.id, name: raced.name, isNew: false } : undefined;
  }
}

/** Liste visée : la plus récemment modifiée ; créée (« Courses ») si l'utilisateur n'en a aucune. */
export async function targetList(userId: string): Promise<{ id: string; name: string }> {
  const latest = await ShoppingListModel.findOne({ userId }).sort({ updatedAt: -1 }).lean();
  if (latest) return { id: latest.id, name: latest.name };
  const created = await ShoppingListModel.create({ userId, id: randomUUID(), name: 'Courses' });
  return { id: created.id, name: created.name };
}

export async function addSpokenItems(
  userId: string,
  items: SpokenItem[],
): Promise<{ list: { id: string; name: string }; added: VoiceAddResult[]; rejected: string[] }> {
  const list = await targetList(userId);
  const added: VoiceAddResult[] = [];
  const rejected: string[] = [];
  for (const spoken of items) {
    const product = await resolveProduct(userId, spoken.name);
    if (!product) {
      rejected.push(spoken.name);
      continue;
    }
    const { status, item } = await addItem(userId, list.id, {
      productId: product.id,
      name: product.name,
      quantity: spoken.quantity,
      unit: spoken.unit,
      note: '',
      // Alexa ne peut pas arbitrer deux unités incompatibles : on ne touche pas à ce qui est déjà dans la liste.
      unitConflict: 'KEEP_EXISTING',
    });
    added.push({
      name: product.name,
      quantity: spoken.quantity,
      unit: spoken.unit,
      status,
      isNewProduct: product.isNew,
      total: item.quantity,
      totalUnit: item.unit,
    });
  }
  return { list, added, rejected };
}
