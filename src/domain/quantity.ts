import { Unit, UNIT_INFO } from './constants';

export interface Quantity {
  amount: number;
  unit: Unit;
}

const EPSILON = 1e-6;

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function convert(amount: number, from: Unit, to: Unit): number {
  return from === to ? amount : round3((amount * UNIT_INFO[from].factor) / UNIT_INFO[to].factor);
}

export function areCompatible(a: Unit, b: Unit): boolean {
  return UNIT_INFO[a].dimension === UNIT_INFO[b].dimension;
}

/**
 * Additionne deux quantités. Même unité : conservée. Unités compatibles : converties et exprimées dans
 * la plus grande des deux (500 g + 1 kg = 1,5 kg). `null` si les unités sont incompatibles.
 */
export function addQuantities(a: Quantity, b: Quantity): Quantity | null {
  if (a.unit === b.unit) return { amount: round3(a.amount + b.amount), unit: a.unit };
  if (!areCompatible(a.unit, b.unit)) return null;
  const target = UNIT_INFO[a.unit].factor >= UNIT_INFO[b.unit].factor ? a.unit : b.unit;
  return { amount: round3(convert(a.amount, a.unit, target) + convert(b.amount, b.unit, target)), unit: target };
}

export function isFullyPurchased(quantity: number, purchased: number): boolean {
  return purchased + EPSILON >= quantity;
}

export interface ItemState {
  quantity: number;
  unit: Unit;
  purchasedQuantity: number;
  isPurchased: boolean;
}

/** Cocher achète toute la quantité demandée ; décocher remet à zéro la quantité achetée. */
export function withPurchased(item: ItemState, purchased: boolean): ItemState {
  return { ...item, isPurchased: purchased, purchasedQuantity: purchased ? item.quantity : 0 };
}

/** Modifie quantité/unité en gardant cohérentes les quantités demandée et achetée. */
export function withEdit(item: ItemState, quantity: number, unit: Unit): ItemState {
  const newQuantity = round3(quantity);
  let purchased: number;
  if (unit !== item.unit) purchased = item.isPurchased ? newQuantity : 0;
  else if (item.isPurchased) purchased = Math.min(item.quantity, newQuantity);
  else purchased = Math.min(item.purchasedQuantity, newQuantity);
  return { quantity: newQuantity, unit, purchasedQuantity: purchased, isPurchased: isFullyPurchased(newQuantity, purchased) };
}

/**
 * Fusionne une quantité entrante dans un article existant. Un ajout sur un produit déjà acheté le
 * remet « à acheter » en conservant la quantité déjà achetée. `null` si unités incompatibles.
 */
export function mergeIntoItem(item: ItemState, incoming: Quantity): ItemState | null {
  const sum = addQuantities({ amount: item.quantity, unit: item.unit }, incoming);
  if (!sum) return null;
  const purchased = convert(item.purchasedQuantity, item.unit, sum.unit);
  return {
    quantity: sum.amount,
    unit: sum.unit,
    purchasedQuantity: purchased,
    isPurchased: isFullyPurchased(sum.amount, purchased),
  };
}
