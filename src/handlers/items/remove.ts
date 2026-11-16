import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { touchList } from '../../services/items';
import { api, requireId } from '../../utils/handler';
import { error, noContent } from '../../utils/response';

export const handler = api(async (ctx) => {
  const listId = requireId(ctx, 'id');
  const itemId = requireId(ctx, 'itemId');
  const item = await ShoppingItemModel.findOneAndDelete({ userId: ctx.userId, listId, id: itemId });
  if (!item) return error(404, 'Produit non trouvé');
  await touchList(ctx.userId, listId);
  return noContent();
});
