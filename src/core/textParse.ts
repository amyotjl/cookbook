import { parseIngredient } from 'parse-ingredient';
import type { RecipeDraft, RecipeStep } from './types';
import { parseIngredientLines } from './ingredientParser';
import { detectStepTimerSeconds, humanTimeToMinutes } from './timeParse';

const INGREDIENTS_HEADER = /^\s*ingredients?\s*:?\s*$/i;
const STEPS_HEADER = /^\s*(instructions?|directions?|method|steps|preparation)\s*:?\s*$/i;

function splitLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•·▢]\s*/, '').trim()) // strip bullet markers
    .filter((l) => l.length > 0);
}

/** A line looks like an ingredient if a quantity or a unit can be parsed from it. */
function looksLikeIngredient(line: string): boolean {
  const p = parseIngredient(line)[0];
  if (!p) return false;
  if (p.isGroupHeader) return false;
  return p.quantity != null || (p.unitOfMeasure != null && p.unitOfMeasure !== '');
}

/** Remove a leading step number like "1." or "2)" from instruction lines. */
function stripStepNumber(line: string): string {
  return line.replace(/^\s*\d+\s*[.)\]:-]\s*/, '').trim();
}

function toSteps(lines: string[]): RecipeStep[] {
  return lines
    .map(stripStepNumber)
    .filter(Boolean)
    .map((text, index) => ({ index, text, timerSeconds: detectStepTimerSeconds(text) }));
}

/**
 * Heuristically parse free text (a social post caption/description, or OCR output)
 * into a recipe draft. Prefers explicit "Ingredients"/"Instructions" headers; falls
 * back to per-line classification. Always presented for manual edit afterwards.
 */
export function parseRecipeFromText(
  text: string,
  opts: { method: 'description-text' | 'ocr'; sourceRef?: string } = { method: 'description-text' },
): RecipeDraft {
  const lines = splitLines(text);
  const warnings: string[] = [];

  let title = 'Untitled recipe';
  let ingredientLines: string[] = [];
  let stepLines: string[] = [];

  const ingHeaderIdx = lines.findIndex((l) => INGREDIENTS_HEADER.test(l));
  const stepHeaderIdx = lines.findIndex((l) => STEPS_HEADER.test(l));

  if (ingHeaderIdx !== -1 && stepHeaderIdx !== -1 && stepHeaderIdx > ingHeaderIdx) {
    // clean, header-delimited layout
    const before = lines.slice(0, ingHeaderIdx).filter(Boolean);
    if (before.length) title = before[0]!;
    ingredientLines = lines.slice(ingHeaderIdx + 1, stepHeaderIdx);
    stepLines = lines.slice(stepHeaderIdx + 1);
  } else if (ingHeaderIdx !== -1) {
    const before = lines.slice(0, ingHeaderIdx).filter(Boolean);
    if (before.length) title = before[0]!;
    const after = lines.slice(ingHeaderIdx + 1);
    // ingredients run until the lines stop looking like ingredients
    const firstStep = after.findIndex((l, i) => i > 0 && !looksLikeIngredient(l));
    if (firstStep === -1) {
      ingredientLines = after;
    } else {
      ingredientLines = after.slice(0, firstStep);
      stepLines = after.slice(firstStep);
    }
  } else {
    // no headers — classify each line
    warnings.push('No "Ingredients"/"Instructions" headers found; classification is approximate — please review.');
    const body = [...lines];
    // title = first non-ingredient, reasonably short line
    if (body.length && !looksLikeIngredient(body[0]!) && body[0]!.split(/\s+/).length <= 12) {
      title = body.shift()!;
    }
    for (const l of body) {
      if (looksLikeIngredient(l)) ingredientLines.push(l);
      else stepLines.push(l);
    }
  }

  const ingredients = parseIngredientLines(ingredientLines);
  const steps = toSteps(stepLines);

  if (ingredients.length === 0) warnings.push('No ingredients detected.');
  if (steps.length === 0) warnings.push('No steps detected.');

  // confidence: header-based + both sections present is strong; OCR is inherently noisier
  let confidence = 0.4;
  if (ingHeaderIdx !== -1 && stepHeaderIdx !== -1) confidence = 0.8;
  else if (ingredients.length > 0 && steps.length > 0) confidence = 0.6;
  if (opts.method === 'ocr') confidence -= 0.1;

  return {
    title,
    ingredients,
    steps,
    prepTimeMin: null,
    cookTimeMin: null,
    totalTimeMin: humanTimeToMinutes(text),
    servings: null,
    sourceType: opts.method === 'ocr' ? 'image' : 'clipboard',
    sourceRef: opts.sourceRef ?? null,
    nutrition: null,
    extractionMethod: opts.method,
    confidence: Math.max(0.1, Math.min(1, confidence)),
    warnings,
  };
}
