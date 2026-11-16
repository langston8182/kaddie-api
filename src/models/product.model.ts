import { Model, Schema, model, models } from 'mongoose';
import { Category, CATEGORIES } from '../domain/constants';

/** Produits personnels de l'utilisateur (le dictionnaire de base est embarqué dans l'application). */
export interface IProduct {
  userId: string;
  id: string;
  name: string;
  normalized: string;
  key: string;
  category: Category;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    userId: { type: String, required: true },
    id: { type: String, required: true, maxlength: 128 },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    normalized: { type: String, required: true },
    key: { type: String, required: true },
    category: { type: String, enum: CATEGORIES, default: 'autres' },
    usageCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true, id: false, collection: 'products' },
);
ProductSchema.index({ userId: 1, id: 1 }, { unique: true });
ProductSchema.index({ userId: 1, key: 1 }, { unique: true });
ProductSchema.index({ userId: 1, updatedAt: -1 });

export const ProductModel = (models.Product as Model<IProduct>) || model<IProduct>('Product', ProductSchema);
