import { describe, it, expect } from 'vitest';
import { normalizeTag, parseTags, buildSearchText, recipeMatchesQuery } from './search';

describe('parseTags', () => {
  it('splits, normalizes, and de-duplicates', () => {
    expect(parseTags('Dinner, vegan ,  Dinner, ')).toEqual(['dinner', 'vegan']);
  });
  it('returns empty for blank input', () => {
    expect(parseTags('   ')).toEqual([]);
  });
});

describe('normalizeTag', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeTag('  Quick   Weeknight ')).toBe('quick weeknight');
  });
});

describe('buildSearchText', () => {
  it('includes title, ingredient names, and tags', () => {
    const text = buildSearchText({
      title: 'Lemon Pasta',
      ingredients: [
        { name: 'spaghetti', canonicalName: 'spaghetti' },
        { name: 'lemon', canonicalName: 'lemon' },
      ],
      tags: ['quick', 'vegetarian'],
    });
    expect(text).toContain('lemon pasta');
    expect(text).toContain('spaghetti');
    expect(text).toContain('vegetarian');
    expect(text).toBe(text.toLowerCase());
  });
});

describe('recipeMatchesQuery', () => {
  const text = buildSearchText({
    title: 'Lemon Pasta',
    ingredients: [{ name: 'spaghetti', canonicalName: 'spaghetti' }],
    tags: ['quick'],
  });
  it('matches when all terms are present (AND)', () => {
    expect(recipeMatchesQuery(text, 'lemon pasta')).toBe(true);
    expect(recipeMatchesQuery(text, 'quick spaghetti')).toBe(true);
  });
  it('fails when any term is missing', () => {
    expect(recipeMatchesQuery(text, 'lemon chicken')).toBe(false);
  });
  it('empty query matches everything', () => {
    expect(recipeMatchesQuery(text, '   ')).toBe(true);
  });
});
