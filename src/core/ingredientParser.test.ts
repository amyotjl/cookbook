import { describe, it, expect } from 'vitest';
import { parseIngredientLine, parseIngredientLines } from './ingredientParser';

describe('parseIngredientLine', () => {
  it('parses quantity, unit, and name', () => {
    const r = parseIngredientLine('2 cups flour');
    expect(r.quantity).toBe(2);
    expect(r.unit).toMatch(/cup/i);
    expect(r.name).toBe('flour');
    expect(r.aisle).toBe('Baking');
  });

  it('splits trailing prep notes', () => {
    const r = parseIngredientLine('1 onion, finely chopped');
    expect(r.quantity).toBe(1);
    expect(r.name).toBe('onion');
    expect(r.notes).toBe('finely chopped');
    expect(r.aisle).toBe('Produce');
  });

  it('handles unit-less / quantity-less lines', () => {
    const r = parseIngredientLine('Salt to taste');
    expect(r.quantity).toBeNull();
    expect(r.aisle).toBe('Spices & Seasoning');
  });
});

describe('parseIngredientLines', () => {
  it('drops blank lines', () => {
    const r = parseIngredientLines(['2 cups flour', '', '   ', '2 eggs']);
    expect(r).toHaveLength(2);
    expect(r[1]!.quantity).toBe(2);
  });
});
