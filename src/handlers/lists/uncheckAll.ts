import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { requireList, touchList } from '../../services/items';
import { api, ok, requireId } from '../../utils/handler';

/** Remet tous les produits « à acheter » pour réutiliser la liste. */
export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  await requireList(ctx.userId, id);
  const result = await ShoppingItemModel.updateMany(
    { userId: ctx.userId, listId: id, $or: [{ isPurchased: true }, { purchasedQuantity: { $gt: 0 } }] },
    { $set: { isPurchased: false, purchasedQuantity: 0 }, $inc: { version: 1 } },
  );
  await touchList(ctx.userId, id);
  return ok({ modifiedCount: result.modifiedCount });
});
