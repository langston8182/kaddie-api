import { itemToDto, listToDto } from '../../mappers';
import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { requireList } from '../../services/items';
import { api, ok, requireId } from '../../utils/handler';

/** Une liste avec tous ses produits. */
export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  const list = await requireList(ctx.userId, id);
  const items = await ShoppingItemModel.find({ userId: ctx.userId, listId: id }).sort({ createdAt: 1 }).lean();
  const remainingCount = items.filter((i: any) => !i.isPurchased).length;
  return ok({ ...listToDto(list, { totalCount: items.length, remainingCount }), items: items.map(itemToDto) });
});
