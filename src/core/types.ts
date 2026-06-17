/**
 * Framework-agnostic data model for the local-only recipe app.
 *
 * These types are the contract between the pure core logic (extraction, parsing,
 * scaling, grocery aggregation, nutrition) and the React Native / Expo UI layer.
 * Nothing here imports React Native, so it is fully unit-testable under Node.
 */

export type SourceType =
  | 'url'
  | 'social'
  | 'image'
  | 'clipboard'
  | 'manual'
  | 'copycat';

export type ExtractionMethod =
  | 'json-ld'
  | 'description-text'
  | 'ocr'
  | 'manual';

/** A single parsed ingredient line, normalized for scaling / grocery / pantry / nutrition. */
export interface ParsedIngredient {
  /** the original, unmodified line */
  raw: string;
  /** numeric amount, null if none could be parsed */
  quantity: number | null;
  /** unit of measure as written (e.g. "cup", "g", "tbsp"), null if none */
  unit: string | null;
  /** human-facing ingredient name (e.g. "all-purpose flour") */
  name: string;
  /** normalized key for dedup / pantry-match / nutrition lookup (e.g. "flour") */
  canonicalName: string;
  /** store section for grocery grouping (e.g. "Produce", "Dairy") */
  aisle: string;
  /** trailing prep notes (e.g. "finely chopped"), if separable */
  notes?: string;
}

export interface RecipeStep {
  index: number;
  text: string;
  /** detected in-step timer in seconds (e.g. "bake for 25 minutes" -> 1500), if any */
  timerSeconds?: number | null;
}

export interface NutritionInfo {
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
  sodiumMg?: number | null;
  /** true if the figures are per serving, false if for the whole recipe */
  perServing: boolean;
}

/**
 * The output of the extraction pipeline, before it is persisted as a Recipe.
 * A draft is always presented in the editable recipe card so the user can fix
 * any extraction misses (a non-negotiable UX per the plan).
 */
export interface RecipeDraft {
  title: string;
  description?: string;
  ingredients: ParsedIngredient[];
  steps: RecipeStep[];
  prepTimeMin?: number | null;
  cookTimeMin?: number | null;
  totalTimeMin?: number | null;
  servings?: number | null;
  imageUrl?: string | null;
  cuisine?: string | null;
  language?: string | null;
  sourceType: SourceType;
  sourceRef?: string | null;
  nutrition?: NutritionInfo | null;
  /** which strategy produced this draft (text preferred over OCR per the plan) */
  extractionMethod: ExtractionMethod;
  /** rough 0..1 confidence in the extraction */
  confidence: number;
  /** human-readable notes about what was uncertain or missing */
  warnings: string[];
}

export const UNIT_SYSTEMS = ['imperial', 'metric'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];
