import { addItem } from '../../services/items';
import { api, ok, requireId } from '../../utils/handler';
import { success } from '../../utils/response';
import { validateItemInput } from '../../validators/shopping.validators';

/**
 * Ajoute un produit à la liste ou fusionne les quantités s'il y est déjà.
 * 201 si ajouté, 200 si fusionné/inchangé, 409 `UNIT_CONFLICT` si les unités sont incompatibles
 * (renvoyer alors la requête avec `unitConflict: REPLACE | KEEP_EXISTING`).
 */
export const handler = api(async (ctx) => {
  const listId = requireId(ctx);
  const input = validateItemInput(ctx.body);
  const { status, item } = await addItem(ctx.userId, listId, input);
  const body = { result: status, item };
  return status === 'ADDED' ? success(201, body) : ok(body);
});
