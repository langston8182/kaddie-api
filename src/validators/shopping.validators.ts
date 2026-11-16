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
