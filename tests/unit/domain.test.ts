import { addQuantities, mergeIntoItem, withEdit, withPurchased } from '../../src/domain/quantity';
import { displayName, normalize, productKey } from '../../src/domain/text';
import { Checker, isValidUuid } from '../../src/utils/validation';
import { validateItemInput } from '../../src/validators/shopping.validators';

describe('quantity', () => {
  it('additionne dans la même unité', () => {
    expect(addQuantities({ amount: 2, unit: 'PIECE' }, { amount: 3, unit: 'PIECE' })).toEqual({ amount: 5, unit: 'PIECE' });
    expect(addQuantities({ amount: 1, unit: 'L' }, { amount: 2, unit: 'L' })).toEqual({ amount: 3, unit: 'L' });
  });

  it('convertit les unités compatibles vers la plus grande', () => {
    expect(addQuantities({ amount: 500, unit: 'G' }, { amount: 1, unit: 'KG' })).toEqual({ amount: 1.5, unit: 'KG' });
    expect(addQuantities({ amount: 1, unit: 'L' }, { amount: 500, unit: 'ML' })).toEqual({ amount: 1.5, unit: 'L' });
  });

  it('refuse les unités incompatibles', () => {
    expect(addQuantities({ amount: 1, unit: 'KG' }, { amount: 1, unit: 'PIECE' })).toBeNull();
    expect(addQuantities({ amount: 1, unit: 'PIECE' }, { amount: 1, unit: 'PACK' })).toBeNull();
  });

  it('un ajout sur un produit acheté le remet à acheter en gardant la quantité achetée', () => {
    const bought = withPurchased({ quantity: 1, unit: 'PIECE', purchasedQuantity: 0, isPurchased: false }, true);
    const merged = mergeIntoItem(bought, { amount: 1, unit: 'PIECE' });
    expect(merged).toEqual({ quantity: 2, unit: 'PIECE', purchasedQuantity: 1, isPurchased: false });
  });

  it("garde l'état acheté cohérent à la modification", () => {
    const base = { quantity: 2, unit: 'PIECE' as const, purchasedQuantity: 2, isPurchased: true };
    expect(withEdit(base, 3, 'PIECE')).toMatchObject({ isPurchased: false, purchasedQuantity: 2 });
    expect(withEdit(base, 1, 'PIECE')).toMatchObject({ isPurchased: true, purchasedQuantity: 1 });
    expect(withEdit(base, 500, 'G')).toMatchObject({ isPurchased: true, purchasedQuantity: 500 });
  });
});

describe('text', () => {
  it('normalise accents, casse et séparateurs', () => {
    expect(normalize('  Pomme-de-TERRE ')).toBe('pomme de terre');
    expect(normalize('Crème   fraîche')).toBe('creme fraiche');
  });

  it('rapproche les pluriels sans abîmer les mots courts', () => {
    expect(productKey('Tomates')).toBe(productKey('tomate'));
    expect(productKey('gâteaux')).toBe('gateau');
    expect(productKey('riz')).toBe('riz');
    expect(productKey('Pommes de terre')).toBe('pomme de terre');
    expect(productKey('tomate cerise')).not.toBe(productKey('tomate'));
  });

  it('met la première lettre en majuscule', () => {
    expect(displayName('  quinoa   royal ')).toBe('Quinoa royal');
  });
});

describe('validation', () => {
  it('reconnaît les UUID', () => {
    expect(isValidUuid('3f2b7c1e-8a41-4d3c-9b0e-5f6a7d8e9c10')).toBe(true);
    expect(isValidUuid('abc')).toBe(false);
  });

  it('accumule les erreurs', () => {
    const c = new Checker();
    c.string({}, 'name', { required: true });
    c.number({ q: -1 }, 'q', { exclusiveMin: 0 });
    expect(Object.keys(c.errors)).toEqual(['name', 'q']);
    expect(() => c.assert()).toThrow('Données invalides');
  });

  it("applique les valeurs par défaut d'un article", () => {
    expect(validateItemInput({ productId: 'p', name: 'Lait' })).toMatchObject({ quantity: 1, unit: 'PIECE', note: '' });
    expect(() => validateItemInput({ productId: 'p', name: 'Lait', quantity: 0 })).toThrow();
    expect(() => validateItemInput({ productId: 'p', name: 'Lait', unit: 'TONNE' })).toThrow();
  });
});
