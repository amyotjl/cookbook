/**
 * Ingredient canonicalization + aisle mapping.
 *
 * This is the "hidden backbone" called out in the plan: scaling, grocery dedup,
 * pantry matching, and nutrition lookup all depend on reducing a free-text
 * ingredient name to a stable canonical key, and on mapping that key to a store
 * aisle. The data here is intentionally editable — ship sensible defaults and let
 * the user re-map later.
 */

/** Words that describe preparation/state, not the ingredient identity. Stripped from the name. */
const PREP_WORDS = new Set([
  'fresh', 'freshly', 'frozen', 'dried', 'dry', 'canned', 'cooked', 'raw', 'ripe',
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'crushed', 'ground',
  'peeled', 'seeded', 'cored', 'pitted', 'trimmed', 'rinsed', 'drained', 'softened',
  'melted', 'beaten', 'whisked', 'sifted', 'packed', 'crumbled', 'cubed', 'halved',
  'quartered', 'julienned', 'roasted', 'toasted', 'boiled', 'steamed', 'warm', 'cold',
  'room', 'temperature', 'large', 'medium', 'small', 'extra', 'organic', 'unsalted',
  'salted', 'boneless', 'skinless', 'lean', 'thinly', 'finely', 'roughly', 'coarsely',
  'optional', 'divided', 'plus', 'more', 'for', 'to', 'taste', 'garnish', 'about',
  'approximately', 'lukewarm', 'cubes', 'pieces', 'wedges', 'strips',
]);

/** Map of synonym -> canonical name (regional and common variants). */
const SYNONYMS: Record<string, string> = {
  scallion: 'green onion',
  scallions: 'green onion',
  'spring onion': 'green onion',
  'spring onions': 'green onion',
  coriander: 'cilantro',
  aubergine: 'eggplant',
  courgette: 'zucchini',
  courgettes: 'zucchini',
  capsicum: 'bell pepper',
  'garbanzo bean': 'chickpea',
  'garbanzo beans': 'chickpea',
  chickpeas: 'chickpea',
  'confectioners sugar': 'powdered sugar',
  "confectioner's sugar": 'powdered sugar',
  'icing sugar': 'powdered sugar',
  'caster sugar': 'sugar',
  'castor sugar': 'sugar',
  'plain flour': 'all-purpose flour',
  'all purpose flour': 'all-purpose flour',
  'self raising flour': 'self-rising flour',
  'self-raising flour': 'self-rising flour',
  'bicarbonate of soda': 'baking soda',
  'baking powder': 'baking powder',
  prawns: 'shrimp',
  prawn: 'shrimp',
  rocket: 'arugula',
  beetroot: 'beet',
  'natural yogurt': 'yogurt',
  yoghurt: 'yogurt',
  'tomato puree': 'tomato paste',
  passata: 'tomato sauce',
};

/** Ordered category rules: first keyword hit wins. Keep specific before generic. */
const AISLE_RULES: Array<{ aisle: string; keywords: string[] }> = [
  { aisle: 'Produce', keywords: [
    'onion', 'garlic', 'tomato', 'potato', 'carrot', 'celery', 'pepper', 'lettuce',
    'spinach', 'kale', 'arugula', 'cucumber', 'zucchini', 'eggplant', 'broccoli',
    'cauliflower', 'mushroom', 'cilantro', 'parsley', 'basil', 'mint', 'ginger',
    'lemon', 'lime', 'apple', 'banana', 'avocado', 'lettuce', 'cabbage', 'beet',
    'green onion', 'shallot', 'leek', 'corn', 'pea', 'bean sprout', 'herb',
  ] },
  { aisle: 'Meat & Seafood', keywords: [
    'chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage', 'steak',
    'ground beef', 'mince', 'shrimp', 'salmon', 'tuna', 'fish', 'cod', 'tilapia',
    'ham', 'prosciutto',
  ] },
  { aisle: 'Dairy & Eggs', keywords: [
    'milk', 'butter', 'cheese', 'cream', 'yogurt', 'egg', 'eggs', 'sour cream',
    'mozzarella', 'parmesan', 'cheddar', 'feta', 'ricotta', 'buttermilk',
  ] },
  { aisle: 'Bakery', keywords: ['bread', 'baguette', 'bun', 'roll', 'tortilla', 'pita', 'naan'] },
  { aisle: 'Baking', keywords: [
    'flour', 'sugar', 'baking soda', 'baking powder', 'yeast', 'vanilla', 'cocoa',
    'chocolate chip', 'cornstarch', 'powdered sugar', 'brown sugar', 'molasses',
  ] },
  { aisle: 'Pantry', keywords: [
    'rice', 'pasta', 'noodle', 'oil', 'olive oil', 'vinegar', 'soy sauce', 'broth',
    'stock', 'tomato paste', 'tomato sauce', 'canned', 'lentil', 'chickpea', 'bean',
    'oats', 'honey', 'maple syrup', 'peanut butter', 'coconut milk', 'tahini',
  ] },
  { aisle: 'Spices & Seasoning', keywords: [
    'salt', 'pepper', 'cumin', 'paprika', 'cinnamon', 'nutmeg', 'oregano', 'thyme',
    'rosemary', 'chili powder', 'curry', 'turmeric', 'cayenne', 'bay leaf', 'clove',
  ] },
  { aisle: 'Frozen', keywords: ['frozen', 'ice cream', 'frozen peas'] },
  { aisle: 'Beverages', keywords: ['wine', 'beer', 'juice', 'coffee', 'tea', 'soda', 'water'] },
];

const DEFAULT_AISLE = 'Other';

/** Lowercase, strip prep words/punctuation, singularize trivial plurals, apply synonyms. */
export function canonicalizeName(name: string): string {
  let s = name.toLowerCase().trim();
  // remove parentheticals and trailing notes after a comma
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.split(',')[0]!;
  // strip non-letter noise
  s = s.replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  // exact synonym match before word stripping
  if (SYNONYMS[s]) return SYNONYMS[s]!;

  const kept = s
    .split(' ')
    .filter((w) => w && !PREP_WORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

  let result = kept.join(' ').trim();
  if (!result) result = s; // don't strip everything away
  return SYNONYMS[result] ?? result;
}

/** Map a canonical (or raw) ingredient name to a store aisle. */
export function aisleFor(name: string): string {
  const c = canonicalizeName(name);
  for (const rule of AISLE_RULES) {
    if (rule.keywords.some((k) => c.includes(k))) return rule.aisle;
  }
  return DEFAULT_AISLE;
}

/** Two ingredient names refer to the same thing (for grocery dedup / pantry match). */
export function isSameIngredient(a: string, b: string): boolean {
  return canonicalizeName(a) === canonicalizeName(b);
}
