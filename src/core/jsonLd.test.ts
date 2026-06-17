import { describe, it, expect } from 'vitest';
import { extractRecipeFromHtml, findRecipeNode, extractJsonLdBlocks } from './jsonLd';

const HTML = `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","name":"ignore me"},
  {"@type":["Recipe"],
   "name":"Test Pancakes",
   "description":"Fluffy pancakes.",
   "recipeIngredient":["2 cups flour","1 tbsp sugar","2 eggs"],
   "recipeInstructions":[
     {"@type":"HowToStep","text":"Mix everything."},
     {"@type":"HowToStep","text":"Cook for 3 minutes."}
   ],
   "prepTime":"PT10M","cookTime":"PT20M","totalTime":"PT30M",
   "recipeYield":"4 servings",
   "nutrition":{"@type":"NutritionInformation","calories":"250 kcal","proteinContent":"6 g"}}
]}
</script></head><body></body></html>`;

describe('extractJsonLdBlocks / findRecipeNode', () => {
  it('finds a Recipe node inside @graph', () => {
    const node = findRecipeNode(extractJsonLdBlocks(HTML));
    expect(node).not.toBeNull();
    expect(node.name).toBe('Test Pancakes');
  });
});

describe('extractRecipeFromHtml', () => {
  it('maps a schema.org Recipe to a draft', () => {
    const draft = extractRecipeFromHtml(HTML, 'https://example.com/r')!;
    expect(draft).not.toBeNull();
    expect(draft.title).toBe('Test Pancakes');
    expect(draft.ingredients).toHaveLength(3);
    expect(draft.steps).toHaveLength(2);
    expect(draft.steps[1]!.timerSeconds).toBe(180);
    expect(draft.prepTimeMin).toBe(10);
    expect(draft.cookTimeMin).toBe(20);
    expect(draft.totalTimeMin).toBe(30);
    expect(draft.servings).toBe(4);
    expect(draft.nutrition!.calories).toBe(250);
    expect(draft.nutrition!.proteinG).toBe(6);
    expect(draft.extractionMethod).toBe('json-ld');
    expect(draft.confidence).toBeGreaterThan(0.9);
    expect(draft.sourceRef).toBe('https://example.com/r');
  });

  it('returns null when there is no Recipe structured data', () => {
    expect(extractRecipeFromHtml('<html><body>no recipe here</body></html>')).toBeNull();
  });
});
