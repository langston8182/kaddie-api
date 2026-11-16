import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { ShoppingListModel } from '../../models/shoppingList.model';
import { api, requireId } from '../../utils/handler';
import { error, noContent } from '../../utils/response';

/** Supprime la liste et tous ses produits. */
export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  const list = await ShoppingListModel.findOneAndDelete({ userId: ctx.userId, id });
  if (!list) return error(404, 'Liste non trouvée');
  await ShoppingItemModel.deleteMany({ userId: ctx.userId, listId: id });
  return noContent();
});
