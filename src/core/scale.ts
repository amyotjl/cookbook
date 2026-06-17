import type { ParsedIngredient, UnitSystem } from './types';

/**
 * Deterministic serving scaling and unit conversion. No AI: pure arithmetic over
 * the parsed {quantity, unit} model. Count-based ingredients (e.g. "2 eggs") and
 * unrecognized units are scaled but never unit-converted.
 */

type Dim = 'volume' | 'mass';

interface UnitDef {
  dim: Dim;
  /** factor to the base unit (ml for volume, g for mass) */
  toBase: number;
  system: 'metric' | 'imperial';
  aliases: string[];
}

const UNIT_DEFS: UnitDef[] = [
  // volume — base milliliter
  { dim: 'volume', toBase: 1, system: 'metric', aliases: ['ml', 'milliliter', 'millilitre', 'milliliters', 'millilitres', 'cc'] },
  { dim: 'volume', toBase: 1000, system: 'metric', aliases: ['l', 'liter', 'litre', 'liters', 'litres'] },
  { dim: 'volume', toBase: 100, system: 'metric', aliases: ['dl', 'deciliter', 'decilitre'] },
  { dim: 'volume', toBase: 4.92892, system: 'imperial', aliases: ['tsp', 'teaspoon', 'teaspoons'] },
  { dim: 'volume', toBase: 14.7868, system: 'imperial', aliases: ['tbsp', 'tablespoon', 'tablespoons', 'tbs', 'tbsp.'] },
  { dim: 'volume', toBase: 29.5735, system: 'imperial', aliases: ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'] },
  { dim: 'volume', toBase: 236.588, system: 'imperial', aliases: ['cup', 'cups'] },
  { dim: 'volume', toBase: 473.176, system: 'imperial', aliases: ['pint', 'pints', 'pt'] },
  { dim: 'volume', toBase: 946.353, system: 'imperial', aliases: ['quart', 'quarts', 'qt'] },
  { dim: 'volume', toBase: 3785.41, system: 'imperial', aliases: ['gallon', 'gallons', 'gal'] },
  // mass — base gram
  { dim: 'mass', toBase: 0.001, system: 'metric', aliases: ['mg', 'milligram', 'milligrams'] },
  { dim: 'mass', toBase: 1, system: 'metric', aliases: ['g', 'gram', 'grams', 'gr'] },
  { dim: 'mass', toBase: 1000, system: 'metric', aliases: ['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
  { dim: 'mass', toBase: 28.3495, system: 'imperial', aliases: ['oz', 'ounce', 'ounces'] },
  { dim: 'mass', toBase: 453.592, system: 'imperial', aliases: ['lb', 'lbs', 'pound', 'pounds'] },
];

const ALIAS_TO_DEF = new Map<string, UnitDef>();
for (const def of UNIT_DEFS) {
  for (const a of def.aliases) ALIAS_TO_DEF.set(a, def);
}

function normalizeUnit(unit: string | null | undefined): UnitDef | null {
  if (!unit) return null;
  const key = unit.toLowerCase().trim().replace(/\.$/, '');
  return ALIAS_TO_DEF.get(key) ?? null;
}

/** Round to a tidy cooking-friendly precision (2 decimals, trailing zeros trimmed). */
export function roundNice(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Pick a human-friendly display unit + quantity for a base amount in the target system. */
function pickDisplay(baseAmount: number, dim: Dim, target: UnitSystem): { quantity: number; unit: string } {
  if (dim === 'volume') {
    if (target === 'metric') {
      return baseAmount >= 1000
        ? { quantity: roundNice(baseAmount / 1000), unit: 'l' }
        : { quantity: roundNice(baseAmount), unit: 'ml' };
    }
    // imperial volume ladder
    if (baseAmount >= 236.588 * 0.75) return { quantity: roundNice(baseAmount / 236.588), unit: 'cup' };
    if (baseAmount >= 14.7868) return { quantity: roundNice(baseAmount / 14.7868), unit: 'tbsp' };
    return { quantity: roundNice(baseAmount / 4.92892), unit: 'tsp' };
  }
  // mass
  if (target === 'metric') {
    return baseAmount >= 1000
      ? { quantity: roundNice(baseAmount / 1000), unit: 'kg' }
      : { quantity: roundNice(baseAmount), unit: 'g' };
  }
  return baseAmount >= 453.592
    ? { quantity: roundNice(baseAmount / 453.592), unit: 'lb' }
    : { quantity: roundNice(baseAmount / 28.3495), unit: 'oz' };
}

/**
 * Convert a quantity+unit to the target measurement system.
 * Returns null if the unit is unknown/count-based (caller should leave it unchanged).
 */
export function convertQuantity(
  quantity: number,
  unit: string | null | undefined,
  target: UnitSystem,
): { quantity: number; unit: string } | null {
  const def = normalizeUnit(unit);
  if (!def) return null;
  if (def.system === target) return { quantity: roundNice(quantity), unit: def.aliases[0]! };
  const base = quantity * def.toBase;
  return pickDisplay(base, def.dim, target);
}

/** Scale a single ingredient's quantity by a factor (unit unchanged). */
export function scaleIngredient(ing: ParsedIngredient, factor: number): ParsedIngredient {
  if (ing.quantity == null) return { ...ing };
  return { ...ing, quantity: roundNice(ing.quantity * factor) };
}

/** Scale a whole ingredient list from one serving count to another. */
export function scaleIngredients(
  ingredients: ParsedIngredient[],
  fromServings: number,
  toServings: number,
): ParsedIngredient[] {
  if (fromServings <= 0 || toServings <= 0) return ingredients.map((i) => ({ ...i }));
  const factor = toServings / fromServings;
  return ingredients.map((i) => scaleIngredient(i, factor));
}

/** Convert an ingredient to the target system in place of its unit/quantity (if convertible). */
export function convertIngredient(ing: ParsedIngredient, target: UnitSystem): ParsedIngredient {
  if (ing.quantity == null) return { ...ing };
  const converted = convertQuantity(ing.quantity, ing.unit, target);
  if (!converted) return { ...ing };
  return { ...ing, quantity: converted.quantity, unit: converted.unit };
}
