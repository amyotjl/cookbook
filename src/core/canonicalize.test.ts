import { describe, it, expect } from 'vitest';
import { canonicalizeName, aisleFor, isSameIngredient } from './canonicalize';

describe('canonicalizeName', () => {
  it('maps regional synonyms', () => {
    expect(canonicalizeName('Scallion')).toBe('green onion');
    expect(canonicalizeName('aubergine')).toBe('eggplant');
    expect(canonicalizeName('Plain Flour')).toBe('all-purpose flour');
  });
  it('strips prep words', () => {
    expect(canonicalizeName('finely chopped onion')).toBe('onion');
    expect(canonicalizeName('fresh basil')).toBe('basil');
  });
});

describe('aisleFor', () => {
  it('classifies common ingredients', () => {
    expect(aisleFor('chicken breast')).toBe('Meat & Seafood');
    expect(aisleFor('whole milk')).toBe('Dairy & Eggs');
    expect(aisleFor('granulated sugar')).toBe('Baking');
    expect(aisleFor('Fresh Tomatoes')).toBe('Produce');
  });
  it('falls back to Other', () => {
    expect(aisleFor('xyzzy widget')).toBe('Other');
  });
});

describe('isSameIngredient', () => {
  it('treats synonyms as equal', () => {
    expect(isSameIngredient('scallions', 'green onion')).toBe(true);
    expect(isSameIngredient('flour', 'sugar')).toBe(false);
  });
});
