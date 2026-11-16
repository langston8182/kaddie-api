import { displayName, normalize, productKey } from '../../domain/text';
import { productToDto } from '../../mappers';
import { ProductModel } from '../../models/product.model';
import { api, ok, requireId } from '../../utils/handler';
import { success } from '../../utils/response';
import { HttpError } from '../../utils/validation';
import { validateProduct } from '../../validators/shopping.validators';

/**
 * Crée ou met à jour un produit personnel (identifiant fourni par le client, rejouable).
 * Un produit équivalent (même clé normalisée : casse, accents, pluriel) ne peut exister qu'une fois : 409 sinon.
 */
export const handler = api(async (ctx) => {
  const id = requireId(ctx);
  const data = validateProduct(ctx.body);
  const name = displayName(data.name);
  const key = productKey(name);
  if (!key) throw new HttpError(400, 'Données invalides', { name: 'Nom invalide' });

  const duplicate = await ProductModel.findOne({ userId: ctx.userId, key, id: { $ne: id } }).lean();
  if (duplicate) throw new HttpError(409, 'Ce produit existe déjà', { existing: productToDto(duplicate) });

  const existing = await ProductModel.findOne({ userId: ctx.userId, id });
  if (existing) {
    existing.set({ name, normalized: normalize(name), key, category: data.category });
    await existing.save();
    return ok(productToDto(existing.toObject()));
  }
  const created = await ProductModel.create({
    userId: ctx.userId,
    id,
    name,
    normalized: normalize(name),
    key,
    category: data.category,
  });
  return success(201, productToDto(created.toObject()));
});
