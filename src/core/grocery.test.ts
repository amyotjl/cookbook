import { describe, it, expect } from 'vitest';
import { buildGroceryList, flattenGrocery } from './grocery';
import { parseIngredientLines } from './ingredientParser';

describe('buildGroceryList', () => {
  it('sums same-unit quantities across recipes and groups by aisle', () => {
    const a = parseIngredientLines(['2 cups flour', '1 onion']);
    const b = parseIngredientLines(['2 cups flour', '2 onions']);
    const sections = buildGroceryList([a, b]);
    const items = flattenGrocery(sections);

    const flour = items.find((i) => i.canonicalName === 'flour')!;
    expect(flour.quantity).toBe(4);
    expect(flour.unit).toMatch(/cup/i);
    expect(flour.sourceCount).toBe(2);
    expect(flour.aisle).toBe('Baking');

    const onion = items.find((i) => i.canonicalName === 'onion')!;
    expect(onion.quantity).toBe(3); // 1 + 2, both unit-less
    expect(onion.aisle).toBe('Produce');
  });

  it('keeps quantity null when a contributor has no amount', () => {
    const list = parseIngredientLines(['Salt to taste', 'Salt to taste']);
    const items = flattenGrocery(buildGroceryList([list]));
    const salt = items.find((i) => i.canonicalName === 'salt')!;
    expect(salt.quantity).toBeNull();
    expect(salt.aisle).toBe('Spices & Seasoning');
  });

  it('does NOT merge the same ingredient across incompatible units', () => {
    const list = parseIngredientLines(['1 cup milk', '200 ml milk']);
    const items = flattenGrocery(buildGroceryList([list]));
    const milks = items.filter((i) => i.canonicalName === 'milk');
    expect(milks).toHaveLength(2); // cup and ml stay separate
    milks.forEach((m) => expect(m.aisle).toBe('Dairy & Eggs'));
  });

  it('orders sections by typical store walk (Produce before Baking)', () => {
    const list = parseIngredientLines(['2 cups flour', '1 onion']);
    const sections = buildGroceryList([list]);
    const aisles = sections.map((s) => s.aisle);
    expect(aisles.indexOf('Produce')).toBeLessThan(aisles.indexOf('Baking'));
  });
});
