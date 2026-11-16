import { productToDto } from '../../mappers';
import { ProductModel } from '../../models/product.model';
import { api, ok, updatedSince } from '../../utils/handler';

/** Produits personnels de l'utilisateur (le dictionnaire de base reste embarqué dans l'application). */
export const handler = api(async (ctx) => {
  const since = updatedSince(ctx);
  const filter: Record<string, unknown> = { userId: ctx.userId };
  if (since) filter.updatedAt = { $gte: since };
  const products = await ProductModel.find(filter).sort({ name: 1 }).lean();
  return ok(products.map(productToDto));
});
