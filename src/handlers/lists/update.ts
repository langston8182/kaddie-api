import { listToDto } from '../../mappers';
import { ShoppingListModel } from '../../models/shoppingList.model';
import { api, ok, requireId } from '../../utils/handler';
import { success } from '../../utils/response';
import { validateList } from '../../validators/shopping.validators';

/** Renomme la liste ; la crée si elle n'existe pas encore (identifiant fourni par le client, rejouable). */
export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  const data = validateList(ctx.body);
  const existing = await ShoppingListModel.findOne({ userId: ctx.userId, id });
  if (existing) {
    existing.name = data.name;
    await existing.save();
    return ok(listToDto(existing.toObject()));
  }
  const created = await ShoppingListModel.create({ userId: ctx.userId, id, name: data.name });
  return success(201, listToDto(created.toObject()));
});
