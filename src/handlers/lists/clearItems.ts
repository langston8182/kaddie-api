import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { requireList, touchList } from '../../services/items';
import { api, ok, requireId } from '../../utils/handler';

/** Vide la liste : tous les produits, ou seulement les achetés avec `?purchased=true`. */
export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  await requireList(ctx.userId, id);
  const filter: Record<string, unknown> = { userId: ctx.userId, listId: id };
  if (ctx.query.purchased === 'true') filter.isPurchased = true;
  const result = await ShoppingItemModel.deleteMany(filter);
  await touchList(ctx.userId, id);
  return ok({ deletedCount: result.deletedCount });
});
