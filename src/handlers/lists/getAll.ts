import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { ShoppingListModel } from '../../models/shoppingList.model';
import { listToDto } from '../../mappers';
import { api, ok, updatedSince } from '../../utils/handler';

export const handler = api(async (ctx) => {
  const since = updatedSince(ctx);
  const filter: Record<string, unknown> = { userId: ctx.userId };
  if (since) filter.updatedAt = { $gte: since };

  const lists = await ShoppingListModel.find(filter).sort({ updatedAt: -1 }).lean();
  if (lists.length === 0) return ok([]);

  const counts = await ShoppingItemModel.aggregate([
    { $match: { userId: ctx.userId, listId: { $in: lists.map((l: { id: string }) => l.id) } } },
    {
      $group: {
        _id: '$listId',
        totalCount: { $sum: 1 },
        remainingCount: { $sum: { $cond: ['$isPurchased', 0, 1] } },
      },
    },
  ]);
  const byList = new Map<string, { totalCount: number; remainingCount: number }>(
    counts.map((c: any) => [c._id, { totalCount: c.totalCount, remainingCount: c.remainingCount }]),
  );
  return ok(lists.map((l: any) => listToDto(l, byList.get(l.id) ?? { totalCount: 0, remainingCount: 0 })));
});
