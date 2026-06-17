import { parse as parseHtml } from 'node-html-parser';
import type { RecipeDraft, RecipeStep } from './types';
import { parseIngredientLines } from './ingredientParser';
import { iso8601DurationToMinutes, detectStepTimerSeconds } from './timeParse';

/** Pull and JSON.parse every <script type="application/ld+json"> block, tolerating bad blocks. */
export function extractJsonLdBlocks(html: string): unknown[] {
  const root = parseHtml(html);
  const scripts = root.querySelectorAll('script[type="application/ld+json"]');
  const out: unknown[] = [];
  for (const el of scripts) {
    const raw = (el.rawText || el.text || '').trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Some sites concatenate multiple JSON objects or include trailing commas; skip silently.
    }
  }
  return out;
}

function typeIncludesRecipe(node: any): boolean {
  const t = node?.['@type'];
  if (!t) return false;
  if (Array.isArray(t)) return t.some((x) => String(x).toLowerCase() === 'recipe');
  return String(t).toLowerCase() === 'recipe';
}

/** Walk parsed JSON-LD (objects, arrays, and @graph containers) to find the first Recipe node. */
export function findRecipeNode(blocks: unknown[]): any | null {
  const queue: any[] = [...blocks];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (typeIncludesRecipe(node)) return node;
    if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);
  }
  return null;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function firstString(v: any): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = firstString(x);
      if (s) return s;
    }
    return undefined;
  }
  if (v && typeof v === 'object') {
    if (typeof v.url === 'string') return v.url;
    if (typeof v.name === 'string') return v.name;
    if (typeof v.text === 'string') return v.text;
  }
  return undefined;
}

/** Flatten schema.org recipeInstructions (string | HowToStep[] | HowToSection[]) into ordered steps. */
function extractSteps(instructions: any): RecipeStep[] {
  const texts: string[] = [];

  const pushFrom = (node: any) => {
    if (!node) return;
    if (typeof node === 'string') {
      // a single string may itself contain newlines / numbered steps
      node
        .split(/\r?\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => texts.push(s));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(pushFrom);
      return;
    }
    const t = String(node['@type'] ?? '').toLowerCase();
    if (t === 'howtosection' && node.itemListElement) {
      pushFrom(node.itemListElement);
      return;
    }
    // HowToStep or generic
    const text = node.text ?? node.name;
    if (typeof text === 'string' && text.trim()) texts.push(text.trim());
  };

  pushFrom(instructions);

  return texts.map((text, i) => ({
    index: i,
    text,
    timerSeconds: detectStepTimerSeconds(text),
  }));
}

function extractServings(recipeYield: any): number | null {
  const s = Array.isArray(recipeYield) ? recipeYield[0] : recipeYield;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') {
    const m = s.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

function num(v: any): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.match(/[\d.]+/);
    if (m) return parseFloat(m[0]);
  }
  return null;
}

/** Convert a found schema.org Recipe node into our RecipeDraft. */
export function recipeNodeToDraft(node: any, sourceRef?: string): RecipeDraft {
  const warnings: string[] = [];

  const title = firstString(node.name) ?? 'Untitled recipe';
  const ingredientLines = asArray<string>(node.recipeIngredient ?? node.ingredients).filter(
    (x) => typeof x === 'string',
  );
  const ingredients = parseIngredientLines(ingredientLines);
  const steps = extractSteps(node.recipeInstructions);

  if (ingredients.length === 0) warnings.push('No ingredients found in structured data.');
  if (steps.length === 0) warnings.push('No instructions found in structured data.');

  const nutritionNode = node.nutrition;
  const nutrition = nutritionNode
    ? {
        calories: num(nutritionNode.calories),
        proteinG: num(nutritionNode.proteinContent),
        carbsG: num(nutritionNode.carbohydrateContent),
        fatG: num(nutritionNode.fatContent),
        fiberG: num(nutritionNode.fiberContent),
        sodiumMg: num(nutritionNode.sodiumContent),
        perServing: true,
      }
    : null;

  return {
    title,
    description: firstString(node.description),
    ingredients,
    steps,
    prepTimeMin: iso8601DurationToMinutes(firstString(node.prepTime)),
    cookTimeMin: iso8601DurationToMinutes(firstString(node.cookTime)),
    totalTimeMin: iso8601DurationToMinutes(firstString(node.totalTime)),
    servings: extractServings(node.recipeYield),
    imageUrl: firstString(node.image),
    cuisine: firstString(node.recipeCuisine) ?? null,
    language: firstString(node.inLanguage) ?? null,
    sourceType: 'url',
    sourceRef: sourceRef ?? null,
    nutrition,
    extractionMethod: 'json-ld',
    confidence: ingredients.length > 0 && steps.length > 0 ? 0.95 : 0.6,
    warnings,
  };
}

/** Convenience: HTML string -> RecipeDraft, or null if no schema.org Recipe is present. */
export function extractRecipeFromHtml(html: string, sourceRef?: string): RecipeDraft | null {
  const node = findRecipeNode(extractJsonLdBlocks(html));
  if (!node) return null;
  return recipeNodeToDraft(node, sourceRef);
}
