import { Model, Schema, model, models } from 'mongoose';

export interface IShoppingList {
  userId: string;
  /** UUID généré par le client. */
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const ShoppingListSchema = new Schema<IShoppingList>(
  {
    userId: { type: String, required: true },
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
  },
  { timestamps: true, id: false, collection: 'shopping_lists' },
);
ShoppingListSchema.index({ userId: 1, id: 1 }, { unique: true });
ShoppingListSchema.index({ userId: 1, updatedAt: -1 });

export const ShoppingListModel = (models.ShoppingList as Model<IShoppingList>) || model<IShoppingList>('ShoppingList', ShoppingListSchema);
