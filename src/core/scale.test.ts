import { describe, it, expect } from 'vitest';
import {
  scaleIngredient,
  scaleIngredients,
  convertQuantity,
  convertIngredient,
  roundNice,
} from './scale';
import type { ParsedIngredient } from './types';

function ing(quantity: number | null, unit: string | null, name = 'thing'): ParsedIngredient {
  return { raw: `${quantity ?? ''} ${unit ?? ''} ${name}`.trim(), quantity, unit, name, canonicalName: name, aisle: 'Other' };
}

describe('roundNice', () => {
  it('rounds to 2 decimals', () => {
    expect(roundNice(473.176)).toBe(473.18);
    expect(roundNice(2)).toBe(2);
  });
});

describe('scaleIngredients', () => {
  it('scales quantities by the serving ratio', () => {
    const out = scaleIngredients([ing(2, 'cup', 'flour'), ing(null, null, 'salt')], 4, 8);
    expect(out[0]!.quantity).toBe(4);
    expect(out[1]!.quantity).toBeNull(); // quantity-less stays null
  });

  it('guards against zero servings', () => {
    const out = scaleIngredients([ing(2, 'cup')], 0, 4);
    expect(out[0]!.quantity).toBe(2);
  });
});

describe('scaleIngredient', () => {
  it('multiplies a single quantity', () => {
    expect(scaleIngredient(ing(3, 'tbsp'), 0.5).quantity).toBe(1.5);
  });
});

describe('convertQuantity', () => {
  it('imperial -> metric volume', () => {
    const r = convertQuantity(2, 'cup', 'metric')!;
    expect(r.unit).toBe('ml');
    expect(r.quantity).toBeCloseTo(473.18, 1);
  });

  it('metric -> imperial volume', () => {
    const r = convertQuantity(500, 'ml', 'imperial')!;
    expect(r.unit).toBe('cup');
    expect(r.quantity).toBeCloseTo(2.11, 1);
  });

  it('imperial -> metric mass', () => {
    const r = convertQuantity(1, 'lb', 'metric')!;
    expect(r.unit).toBe('g');
    expect(r.quantity).toBeCloseTo(453.59, 1);
  });

  it('returns null for count-based / unknown units', () => {
    expect(convertQuantity(2, 'eggs', 'metric')).toBeNull();
    expect(convertQuantity(2, null, 'metric')).toBeNull();
  });

  it('keeps same-system units unchanged', () => {
    const r = convertQuantity(2, 'cup', 'imperial')!;
    expect(r.unit).toBe('cup');
    expect(r.quantity).toBe(2);
  });
});

describe('convertIngredient', () => {
  it('converts unit + quantity together', () => {
    const r = convertIngredient(ing(1, 'lb', 'beef'), 'metric');
    expect(r.unit).toBe('g');
    expect(r.quantity).toBeCloseTo(453.59, 1);
  });
});
