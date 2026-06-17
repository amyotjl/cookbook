import type { ParsedIngredient } from './types';

/**
 * Pure search/tag helpers. Search is done in-memory over the (small, single-user)
 * recipe library, so it is fully unit-testable and needs no SQL. A denormalized
 * `searchText` blob is built per recipe at save time and matched with AND semantics.
 */

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Parse a comma-separated tags input into a de-duplicated, normalized list. */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(',').map(normalizeTag).filter(Boolean))];
}

/** Build the lowercase search blob from a recipe's title, ingredient names, and tags. */
export function buildSearchText(parts: {
  title: string;
  ingredients: Pick<ParsedIngredient, 'name' | 'canonicalName'>[];
  tags?: string[];
}): string {
  const bits = [
    parts.title,
    ...parts.ingredients.flatMap((i) => [i.name, i.canonicalName]),
    ...(parts.tags ?? []),
  ];
  return bits.join(' ').toLowerCase();
}

/** Match a recipe's searchText against a free-text query (every whitespace term must appear). */
export function recipeMatchesQuery(searchText: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((term) => searchText.includes(term));
}
