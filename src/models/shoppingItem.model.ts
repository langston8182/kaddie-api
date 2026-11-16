import { Model, Schema, model, models } from 'mongoose';
import { Unit, UNITS } from '../domain/constants';

export interface IShoppingItem {
  userId: string;
  id: string;
  listId: string;
  productId: string;
  name: string;
  /** Quantité totale demandée. */
  quantity: number;
  unit: Unit;
  /** Part de la quantité déjà achetée. */
  purchasedQuantity: number;
  isPurchased: boolean;
  /** Épinglé en haut de la liste. */
  isPinned: boolean;
  note: string;
  /** Compteur de concurrence optimiste pour les fusions simultanées. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const ShoppingItemSchema = new Schema<IShoppingItem>(
  {
    userId: { type: String, required: true },
    id: { type: String, required: true },
    listId: { type: String, required: true },
    productId: { type: String, required: true, maxlength: 128 },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: UNITS, default: 'PIECE' },
    purchasedQuantity: { type: Number, min: 0, default: 0 },
    isPurchased: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 120, default: '' },
    version: { type: Number, default: 0 },
  },
  { timestamps: true, id: false, collection: 'shopping_items' },
);
ShoppingItemSchema.index({ userId: 1, id: 1 }, { unique: true });
// Un même produit n'apparaît qu'une fois par liste.
ShoppingItemSchema.index({ userId: 1, listId: 1, productId: 1 }, { unique: true });
ShoppingItemSchema.index({ userId: 1, listId: 1, isPurchased: 1 });

export const ShoppingItemModel = (models.ShoppingItem as Model<IShoppingItem>) || model<IShoppingItem>('ShoppingItem', ShoppingItemSchema);
