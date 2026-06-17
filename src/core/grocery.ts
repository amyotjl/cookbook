import type { ParsedIngredient } from './types';
import { aisleFor } from './canonicalize';
import { roundNice } from './scale';

/**
 * Build a consolidated, aisle-grouped grocery list from one or more recipes'
 * ingredient lists. Deterministic, no AI.
 *
 * Merge rule: ingredients are bucketed by (canonicalName + unit) so quantities are
 * only ever summed when the units match — never producing an incorrect total. The
 * same ingredient in two different units (e.g. cups vs grams) yields two lines under
 * the same aisle, which is correct and easy for the shopper to reconcile.
 */

export interface GroceryItem {
  canonicalName: string;
  displayName: string;
  /** summed quantity, or null when any contributor lacked a quantity */
  quantity: number | null;
  unit: string | null;
  aisle: string;
  checked: boolean;
  /** how many ingredient lines were merged into this item */
  sourceCount: number;
}

export interface GrocerySection {
  aisle: string;
  items: GroceryItem[];
}

/** Typical store-walk order; aisles not listed sort to the end alphabetically. */
const AISLE_ORDER = [
  'Produce',
  'Bakery',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Baking',
  'Pantry',
  'Spices & Seasoning',
  'Frozen',
  'Beverages',
  'Other',
];

function aisleRank(aisle: string): number {
  const i = AISLE_ORDER.indexOf(aisle);
  return i === -1 ? AISLE_ORDER.length : i;
}

export function buildGroceryList(ingredientLists: ParsedIngredient[][]): GrocerySection[] {
  const buckets = new Map<string, GroceryItem>();

  for (const list of ingredientLists) {
    for (const ing of list) {
      const unitKey = (ing.unit ?? '').toLowerCase().trim();
      const key = `${ing.canonicalName}|${unitKey}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.sourceCount += 1;
        if (existing.quantity == null || ing.quantity == null) {
          existing.quantity = null; // can't total when a contributor has no amount
        } else {
          existing.quantity = roundNice(existing.quantity + ing.quantity);
        }
      } else {
        buckets.set(key, {
          canonicalName: ing.canonicalName,
          displayName: ing.name || ing.canonicalName,
          quantity: ing.quantity,
          unit: ing.unit,
          aisle: ing.aisle || aisleFor(ing.canonicalName),
          checked: false,
          sourceCount: 1,
        });
      }
    }
  }

  const byAisle = new Map<string, GroceryItem[]>();
  for (const item of buckets.values()) {
    const arr = byAisle.get(item.aisle) ?? [];
    arr.push(item);
    byAisle.set(item.aisle, arr);
  }

  return [...byAisle.entries()]
    .map(([aisle, items]) => ({
      aisle,
      items: items.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => aisleRank(a.aisle) - aisleRank(b.aisle) || a.aisle.localeCompare(b.aisle));
}

/** Flatten sections back to a single ordered item array (handy for counts / persistence). */
export function flattenGrocery(sections: GrocerySection[]): GroceryItem[] {
  return sections.flatMap((s) => s.items);
}
