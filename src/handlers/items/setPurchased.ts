import { withPurchased } from '../../domain/quantity';
import { itemToDto } from '../../mappers';
import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { touchList } from '../../services/items';
import { api, ok, requireId } from '../../utils/handler';
import { error } from '../../utils/response';
import { validatePurchased } from '../../validators/shopping.validators';

/** Coche / décoche un produit : { purchased: boolean }. */
export const handler = api(async (ctx) => {
  const listId = requireId(ctx, 'id');
  const itemId = requireId(ctx, 'itemId');
  const purchased = validatePurchased(ctx.body);

  const item = await ShoppingItemModel.findOne({ userId: ctx.userId, listId, id: itemId });
  if (!item) return error(404, 'Produit non trouvé');

  item.set({ ...withPurchased(item, purchased), version: item.version + 1 });
  await item.save();
  await touchList(ctx.userId, listId);
  return ok(itemToDto(item.toObject()));
});
