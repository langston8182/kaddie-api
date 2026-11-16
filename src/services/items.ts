import { randomUUID } from 'crypto';
import { Unit, UnitConflictResolution } from '../domain/constants';
import { mergeIntoItem, round3 } from '../domain/quantity';
import { itemToDto } from '../mappers';
import { ProductModel } from '../models/product.model';
import { ShoppingItemModel } from '../models/shoppingItem.model';
import { ShoppingListModel } from '../models/shoppingList.model';
import { HttpError } from '../utils/validation';

export interface AddItemInput {
  id?: string;
  productId: string;
  name: string;
  quantity: number;
  unit: Unit;
  note: string;
  unitConflict?: UnitConflictResolution;
}

export type AddItemStatus = 'ADDED' | 'MERGED' | 'UNCHANGED';

const MAX_ATTEMPTS = 5;

export async function touchList(userId: string, listId: string): Promise<void> {
  await ShoppingListModel.updateOne({ userId, id: listId }, { $set: { updatedAt: new Date() } });
}

export async function requireList(userId: string, listId: string) {
  const list = await ShoppingListModel.findOne({ userId, id: listId }).lean();
  if (!list) throw new HttpError(404, 'Liste non trouvée');
  return list;
}

/**
 * Ajoute un produit à une liste, ou fusionne les quantités s'il y est déjà (un produit n'apparaît
 * qu'une fois par liste). Sans transaction : l'index unique (liste, produit) et un compteur de version
 * (concurrence optimiste) garantissent la cohérence, avec quelques relectures en cas de course.
 * Rejouer la même requête (même `id` d'article) est sans effet.
 */
export async function addItem(userId: string, listId: string, input: AddItemInput) {
  await requireList(userId, listId);

  if (input.id) {
    const replay = await ShoppingItemModel.findOne({ userId, id: input.id }).lean();
    if (replay) {
      if (replay.listId !== listId) throw new HttpError(409, 'Identifiant déjà utilisé');
      return { status: 'UNCHANGED' as AddItemStatus, item: itemToDto(replay) };
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await ShoppingItemModel.findOne({ userId, listId, productId: input.productId }).lean();

    if (!existing) {
      try {
        const created = await ShoppingItemModel.create({
          userId,
          listId,
          id: input.id ?? randomUUID(),
          productId: input.productId,
          name: input.name,
          quantity: round3(input.quantity),
          unit: input.unit,
          purchasedQuantity: 0,
          isPurchased: false,
          note: input.note,
        });
        await afterAdd(userId, listId, input.productId);
        return { status: 'ADDED' as AddItemStatus, item: itemToDto(created.toObject()) };
      } catch (err: any) {
        if (err?.code === 11000) continue; // ajout concurrent du même produit : on retente en fusion
        throw err;
      }
    }

    let next = mergeIntoItem(existing, { amount: input.quantity, unit: input.unit });
    if (!next) {
      if (input.unitConflict === 'KEEP_EXISTING') {
        return { status: 'UNCHANGED' as AddItemStatus, item: itemToDto(existing) };
      }
      if (input.unitConflict !== 'REPLACE') {
        throw new HttpError(409, 'Unités incompatibles', { code: 'UNIT_CONFLICT', existing: itemToDto(existing) });
      }
      next = { quantity: round3(input.quantity), unit: input.unit, purchasedQuantity: 0, isPurchased: false };
    }

    const updated = await ShoppingItemModel.findOneAndUpdate(
      { _id: existing._id, version: existing.version },
      { $set: { ...next, note: existing.note || input.note }, $inc: { version: 1 } },
      { new: true },
    ).lean();
    if (!updated) continue; // modifié entre-temps : relire et recalculer
    await afterAdd(userId, listId, input.productId);
    return { status: 'MERGED' as AddItemStatus, item: itemToDto(updated) };
  }
  throw new HttpError(409, 'Conflit de modification, réessayez');
}

async function afterAdd(userId: string, listId: string, productId: string): Promise<void> {
  await Promise.all([
    touchList(userId, listId),
    ProductModel.updateOne({ userId, id: productId }, { $inc: { usageCount: 1 } }),
  ]);
}
