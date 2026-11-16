import { randomUUID } from 'crypto';
import { itemToDto, listToDto } from '../../mappers';
import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { ShoppingListModel } from '../../models/shoppingList.model';
import { requireList } from '../../services/items';
import { api, requireId } from '../../utils/handler';
import { success } from '../../utils/response';
import { validateList } from '../../validators/shopping.validators';
import { HttpError } from '../../utils/validation';

/** Copie une liste et ses produits, tous remis « à acheter ». Corps optionnel : { id, name }. */
export const handler = api(async (ctx) => {
  const sourceId = requireId(ctx);
  const source = await requireList(ctx.userId, sourceId);
  const hasBody = Object.keys(ctx.body).length > 0;
  const data = hasBody ? validateList(ctx.body) : { id: undefined, name: `${source.name} (copie)`.slice(0, 60) };

  const newId = data.id ?? randomUUID();
  if (newId === sourceId) throw new HttpError(400, 'Identifiant invalide');

  const copy = await ShoppingListModel.create({ userId: ctx.userId, id: newId, name: data.name });
  const items = await ShoppingItemModel.find({ userId: ctx.userId, listId: sourceId }).sort({ createdAt: 1 }).lean();
  const created = items.length
    ? await ShoppingItemModel.insertMany(
        items.map((i: any, index: number) => ({
          userId: ctx.userId,
          id: randomUUID(),
          listId: newId,
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          purchasedQuantity: 0,
          isPurchased: false,
          note: i.note,
          // createdAt distincts pour conserver l'ordre d'origine
          createdAt: new Date(Date.now() + index),
        })),
      )
    : [];
  return success(201, {
    ...listToDto(copy.toObject(), { totalCount: created.length, remainingCount: created.length }),
    items: created.map((i: any) => itemToDto(i.toObject())),
  });
});
