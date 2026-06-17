import { describe, it, expect } from 'vitest';
import { parseRecipeFromText } from './textParse';

const CAPTION_WITH_HEADERS = `Best Pancakes

Ingredients
2 cups flour
1 tbsp sugar
2 eggs

Instructions
Mix dry ingredients.
Add eggs and whisk.
Cook for 3 minutes.`;

const CAPTION_NO_HEADERS = `Quick Salad
1 cucumber
2 tomatoes
Chop the cucumber and tomatoes and toss together.`;

describe('parseRecipeFromText (header-delimited)', () => {
  it('splits title / ingredients / steps and detects timers', () => {
    const d = parseRecipeFromText(CAPTION_WITH_HEADERS, { method: 'description-text' });
    expect(d.title).toBe('Best Pancakes');
    expect(d.ingredients).toHaveLength(3);
    expect(d.steps).toHaveLength(3);
    expect(d.steps[2]!.timerSeconds).toBe(180);
    expect(d.extractionMethod).toBe('description-text');
    expect(d.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

describe('parseRecipeFromText (no headers)', () => {
  it('classifies lines heuristically and warns', () => {
    const d = parseRecipeFromText(CAPTION_NO_HEADERS, { method: 'description-text' });
    expect(d.title).toBe('Quick Salad');
    expect(d.ingredients).toHaveLength(2);
    expect(d.steps).toHaveLength(1);
    expect(d.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('marks OCR-sourced text with the ocr method', () => {
    const d = parseRecipeFromText(CAPTION_WITH_HEADERS, { method: 'ocr' });
    expect(d.extractionMethod).toBe('ocr');
    expect(d.sourceType).toBe('image');
  });
});
