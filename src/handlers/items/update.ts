import { withEdit } from '../../domain/quantity';
import { itemToDto } from '../../mappers';
import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { touchList } from '../../services/items';
import { api, ok, requireId } from '../../utils/handler';
import { error } from '../../utils/response';
import { HttpError } from '../../utils/validation';
import { validateItemEdit } from '../../validators/shopping.validators';

/** Modifie quantité, unité, note et/ou épinglage (`isPinned`), en gardant cohérentes les quantités demandée et achetée. */
export const handler = api(async (ctx) => {
  const listId = requireId(ctx, 'id');
  const itemId = requireId(ctx, 'itemId');
  const edit = validateItemEdit(ctx.body);
  if (edit.quantity === undefined && edit.unit === undefined && edit.note === undefined && edit.isPinned === undefined) {
    throw new HttpError(400, 'Aucune modification fournie');
  }

  const item = await ShoppingItemModel.findOne({ userId: ctx.userId, listId, id: itemId });
  if (!item) return error(404, 'Produit non trouvé');

  const next = withEdit(item, edit.quantity ?? item.quantity, edit.unit ?? item.unit);
  item.set({ ...next, ...(edit.note !== undefined ? { note: edit.note } : {}), ...(edit.isPinned !== undefined ? { isPinned: edit.isPinned } : {}), version: item.version + 1 });
  await item.save();
  await touchList(ctx.userId, listId);
  return ok(itemToDto(item.toObject()));
});
