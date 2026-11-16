import { ProductModel } from '../../models/product.model';
import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { api, requireId } from '../../utils/handler';
import { error, noContent } from '../../utils/response';
import { HttpError } from '../../utils/validation';

/** Refuse de supprimer un produit encore présent dans une liste. */
export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  const inUse = await ShoppingItemModel.exists({ userId: ctx.userId, productId: id });
  if (inUse) throw new HttpError(409, 'Produit utilisé dans une liste');
  const product = await ProductModel.findOneAndDelete({ userId: ctx.userId, id });
  if (!product) return error(404, 'Produit non trouvé');
  return noContent();
});
