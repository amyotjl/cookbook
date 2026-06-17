import type { RecipeDraft } from './types';
import { detectSource, type SourceInput } from './sourceDetect';
import { extractRecipeFromHtml } from './jsonLd';
import { parseRecipeFromText } from './textParse';

/** Injected OCR step (e.g. on-device ML Kit text recognition). Keeps the core pure/testable. */
export type OcrProvider = (imageUri: string) => Promise<string>;

/** Injected HTML fetcher (e.g. `fetch`). Keeps the core free of network assumptions. */
export type HtmlFetcher = (url: string) => Promise<string>;

export interface ExtractInput extends SourceInput {
  /** pre-fetched page HTML, if the caller already retrieved it */
  html?: string;
}

export interface ExtractDeps {
  ocr?: OcrProvider;
  fetchHtml?: HtmlFetcher;
}

function hasContent(draft: RecipeDraft): boolean {
  return draft.ingredients.length > 0 || draft.steps.length > 0;
}

function emptyDraft(
  sourceType: RecipeDraft['sourceType'],
  sourceRef: string | null,
  warnings: string[],
): RecipeDraft {
  return {
    title: 'Untitled recipe',
    ingredients: [],
    steps: [],
    prepTimeMin: null,
    cookTimeMin: null,
    totalTimeMin: null,
    servings: null,
    nutrition: null,
    sourceType,
    sourceRef,
    extractionMethod: 'manual',
    confidence: 0,
    warnings,
  };
}

/**
 * The recipe-import orchestrator.
 *
 * Extraction priority (per the user's strategy — text first, OCR last):
 *   1. Structured data: schema.org/Recipe JSON-LD from the page HTML (no AI, most accurate).
 *   2. Available text: the post description / caption, or pasted text (heuristic parse).
 *   3. OCR fallback: only when there is no usable text and an image + OCR provider exist.
 *   4. Otherwise: an empty manual draft for the user to fill in.
 *
 * The OCR step and the HTML fetch are injected so this function is fully unit-testable
 * with no network and no native modules.
 */
export async function extractRecipe(
  input: ExtractInput,
  deps: ExtractDeps = {},
): Promise<RecipeDraft> {
  const src = detectSource(input);

  // 1) Structured / page HTML first.
  let html = input.html;
  if (!html && src.url && deps.fetchHtml) {
    try {
      html = await deps.fetchHtml(src.url);
    } catch {
      // network failure — fall through to text / OCR paths
    }
  }
  if (html) {
    const fromJsonLd = extractRecipeFromHtml(html, src.url);
    if (fromJsonLd && hasContent(fromJsonLd)) return fromJsonLd;
  }

  // 2) Caption / description / pasted text (preferred over OCR).
  if (src.text) {
    const draft = parseRecipeFromText(src.text, {
      method: 'description-text',
      sourceRef: src.url ?? undefined,
    });
    if (hasContent(draft)) {
      if (src.url) {
        draft.sourceType = src.type;
        draft.sourceRef = src.url;
      }
      return draft;
    }
    // text present but yielded no recipe — fall through to OCR if possible
  }

  // 3) OCR fallback — image + provider, only reached when text didn't produce a recipe.
  if (src.imageUri && deps.ocr) {
    const ocrText = await deps.ocr(src.imageUri);
    const draft = parseRecipeFromText(ocrText, { method: 'ocr', sourceRef: src.imageUri });
    draft.sourceType = 'image';
    if (!hasContent(draft)) {
      draft.warnings.push('OCR produced no recognizable recipe — please enter it manually.');
    }
    return draft;
  }

  // 4) Nothing usable.
  const warnings = ['Could not extract a recipe automatically — please enter it manually.'];
  if (src.url && !html) {
    warnings.push('Could not fetch the page (offline or blocked). Paste the recipe text instead.');
  }
  if (html && !src.text) {
    warnings.push('The page has no structured recipe data; paste the text or use a BYOK extractor.');
  }
  if (src.imageUri && !deps.ocr) {
    warnings.push('An image was provided but no OCR provider is configured.');
  }
  return emptyDraft(src.type === 'manual' ? 'manual' : src.type, src.url ?? src.imageUri ?? null, warnings);
}
