import { ProductModel } from '../../models/product.model';
import { ShoppingItemModel } from '../../models/shoppingItem.model';
import { TemplateModel } from '../../models/template.model';
import { ShoppingListModel } from '../../models/shoppingList.model';
import { api } from '../../utils/handler';
import { noContent } from '../../utils/response';

/** Supprime toutes les données de l'utilisateur. */
export const handler = api(async ({ userId }) => {
  await Promise.all([
    ShoppingItemModel.deleteMany({ userId }),
    ShoppingListModel.deleteMany({ userId }),
    ProductModel.deleteMany({ userId }),
    TemplateModel.deleteMany({ userId }),
  ]);
  return noContent();
});
