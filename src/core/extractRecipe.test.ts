import { describe, it, expect } from 'vitest';
import { extractRecipe } from './extractRecipe';

const PANCAKE_HTML = `<html><head>
<script type="application/ld+json">
{"@type":"Recipe","name":"Test Pancakes",
 "recipeIngredient":["2 cups flour","1 tbsp sugar","2 eggs"],
 "recipeInstructions":[{"@type":"HowToStep","text":"Mix."},{"@type":"HowToStep","text":"Cook for 3 minutes."}]}
</script></head><body></body></html>`;

const PANCAKE_CAPTION = `Best Pancakes

Ingredients
2 cups flour
1 tbsp sugar
2 eggs

Instructions
Mix dry ingredients.
Cook for 3 minutes.`;

describe('extractRecipe priority', () => {
  it('1) uses JSON-LD when page HTML is provided', async () => {
    const d = await extractRecipe({ html: PANCAKE_HTML, url: 'https://site.com/r' });
    expect(d.extractionMethod).toBe('json-ld');
    expect(d.ingredients).toHaveLength(3);
  });

  it('1b) fetches HTML via injected fetcher then uses JSON-LD', async () => {
    const d = await extractRecipe(
      { url: 'https://site.com/r' },
      { fetchHtml: async () => PANCAKE_HTML },
    );
    expect(d.extractionMethod).toBe('json-ld');
  });

  it('2) prefers caption/description text over OCR', async () => {
    let ocrCalled = false;
    const d = await extractRecipe(
      { text: PANCAKE_CAPTION, imageUri: 'file:///x.jpg' },
      {
        ocr: async () => {
          ocrCalled = true;
          return PANCAKE_CAPTION;
        },
      },
    );
    expect(d.extractionMethod).toBe('description-text');
    expect(d.title).toBe('Best Pancakes');
    expect(ocrCalled).toBe(false); // text was usable, so OCR must not run
  });

  it('3) falls back to OCR when the text is unusable', async () => {
    const d = await extractRecipe(
      { text: 'omg so good, link in bio', imageUri: 'file:///x.jpg' },
      { ocr: async () => PANCAKE_CAPTION },
    );
    expect(d.extractionMethod).toBe('ocr');
    expect(d.ingredients).toHaveLength(3);
  });

  it('3b) OCRs a bare image (no text at all)', async () => {
    const d = await extractRecipe(
      { imageUri: 'file:///x.jpg' },
      { ocr: async () => PANCAKE_CAPTION },
    );
    expect(d.extractionMethod).toBe('ocr');
  });

  it('4) returns an empty manual draft when nothing is usable', async () => {
    const d = await extractRecipe({}, {});
    expect(d.extractionMethod).toBe('manual');
    expect(d.confidence).toBe(0);
    expect(d.warnings.length).toBeGreaterThanOrEqual(1);
  });
});
