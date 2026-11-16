import { randomUUID } from 'crypto';
import { listToDto } from '../../mappers';
import { ShoppingListModel } from '../../models/shoppingList.model';
import { api } from '../../utils/handler';
import { success } from '../../utils/response';
import { validateList } from '../../validators/shopping.validators';

export const handler = api(async ({ userId, body }) => {
  const data = validateList(body);
  const list = await ShoppingListModel.create({ userId, id: data.id ?? randomUUID(), name: data.name });
  return success(201, listToDto(list.toObject(), { totalCount: 0, remainingCount: 0 }));
});
