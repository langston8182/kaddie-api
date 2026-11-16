import { Model, Schema, model, models } from 'mongoose';
import { Unit, UNITS } from '../domain/constants';

export interface ITemplateItem {
  productId: string;
  name: string;
  quantity: number;
  unit: Unit;
  note: string;
}

/** Modèle de liste (ex. « Barbecue ») : une « recette » réutilisable pour créer des listes. */
export interface ITemplate {
  userId: string;
  id: string;
  name: string;
  items: ITemplateItem[];
  createdAt: Date;
  updatedAt: Date;
}

const TemplateItemSchema = new Schema<ITemplateItem>(
  {
    productId: { type: String, required: true, maxlength: 128 },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: UNITS, default: 'PIECE' },
    note: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { _id: false },
);

const TemplateSchema = new Schema<ITemplate>(
  {
    userId: { type: String, required: true },
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    items: { type: [TemplateItemSchema], default: [] },
  },
  { timestamps: true, id: false, collection: 'list_templates' },
);
TemplateSchema.index({ userId: 1, id: 1 }, { unique: true });
TemplateSchema.index({ userId: 1, updatedAt: -1 });

export const TemplateModel = (models.Template as Model<ITemplate>) || model<ITemplate>('Template', TemplateSchema);
