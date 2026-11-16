import { CATEGORIES, UNIT_CONFLICT_RESOLUTIONS, UNITS } from '../domain/constants';
import { Checker } from '../utils/validation';

type Body = Record<string, any>;

export function validateList(body: Body) {
  const c = new Checker();
  const id = c.uuid(body, 'id');
  const name = c.string(body, 'name', { required: true, max: 60 });
  c.assert();
  return { id, name: name as string };
}

export function validateItemInput(body: Body) {
  const c = new Checker();
  const id = c.uuid(body, 'id');
  const productId = c.string(body, 'productId', { required: true, max: 128 });
  const name = c.string(body, 'name', { required: true, max: 120 });
  const quantity = c.number(body, 'quantity', { exclusiveMin: 0, max: 100000 }) ?? 1;
  const unit = c.oneOf(body, 'unit', UNITS) ?? 'PIECE';
  const note = c.string(body, 'note', { max: 120 }) ?? '';
  const unitConflict = c.oneOf(body, 'unitConflict', UNIT_CONFLICT_RESOLUTIONS);
  c.assert();
  return { id, productId: productId as string, name: name as string, quantity, unit, note, unitConflict };
}

export function validateItemEdit(body: Body) {
  const c = new Checker();
  const quantity = c.number(body, 'quantity', { exclusiveMin: 0, max: 100000 });
  const unit = c.oneOf(body, 'unit', UNITS);
  const note = c.string(body, 'note', { max: 120 });
  c.assert();
  return { quantity, unit, note };
}

export function validatePurchased(body: Body) {
  const c = new Checker();
  const purchased = c.boolean(body, 'purchased', true);
  c.assert();
  return purchased as boolean;
}

export function validateProduct(body: Body) {
  const c = new Checker();
  const name = c.string(body, 'name', { required: true, max: 120 });
  const category = c.oneOf(body, 'category', CATEGORIES) ?? 'autres';
  c.assert();
  return { name: name as string, category };
}

export const MAX_TEMPLATE_ITEMS = 200;

export function validateTemplate(body: Body) {
  const c = new Checker();
  const name = c.string(body, 'name', { required: true, max: 60 });
  const rawItems = body.items;
  const items: Array<{ productId: string; name: string; quantity: number; unit: (typeof UNITS)[number]; note: string }> = [];
  if (!Array.isArray(rawItems)) {
    c.errors.items = 'Doit être un tableau';
  } else if (rawItems.length > MAX_TEMPLATE_ITEMS) {
    c.errors.items = `Maximum ${MAX_TEMPLATE_ITEMS} produits`;
  } else {
    const seen = new Set<string>();
    rawItems.forEach((raw, index) => {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        c.errors[`items[${index}]`] = 'Doit être un objet';
        return;
      }
      const ic = new Checker();
      const productId = ic.string(raw, 'productId', { required: true, max: 128 });
      const itemName = ic.string(raw, 'name', { required: true, max: 120 });
      const quantity = ic.number(raw, 'quantity', { exclusiveMin: 0, max: 100000 }) ?? 1;
      const unit = ic.oneOf(raw, 'unit', UNITS) ?? 'PIECE';
      const note = ic.string(raw, 'note', { max: 120 }) ?? '';
      for (const [field, message] of Object.entries(ic.errors)) c.errors[`items[${index}].${field}`] = message;
      if (productId && seen.has(productId)) c.errors[`items[${index}].productId`] = 'Produit en double';
      if (productId) seen.add(productId);
      if (productId && itemName) items.push({ productId, name: itemName, quantity, unit, note });
    });
  }
  c.assert();
  return { name: name as string, items };
}
