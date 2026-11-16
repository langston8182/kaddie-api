import { itemToDto } from '../../mappers';
import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { requireList } from '../../services/items';
import { api, ok, requireId, updatedSince } from '../../utils/handler';

export const handler = api(async (ctx) => {
  const listId = requireId(ctx);
  await requireList(ctx.userId, listId);
  const since = updatedSince(ctx);
  const filter: Record<string, unknown> = { userId: ctx.userId, listId };
  if (since) filter.updatedAt = { $gte: since };
  const items = await ShoppingItemModel.find(filter).sort({ createdAt: 1 }).lean();
  return ok(items.map(itemToDto));
});
