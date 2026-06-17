import * as SQLite from 'expo-sqlite';
import {
  buildSearchText,
  type ExtractionMethod,
  type ParsedIngredient,
  type RecipeDraft,
  type RecipeStep,
  type SourceType,
} from '../core';

/**
 * On-device recipe store (expo-sqlite, included in Expo Go).
 *
 * Schema v2 normalizes recipes into `recipes` / `ingredients` / `steps` tables
 * (plus folders for a later phase), replacing the v1 single-JSON-row MVP. The v1
 * data, if any, is migrated on first launch.
 */

export interface SavedRecipe {
  id: number;
  title: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  recipe: RecipeDraft;
}

interface RecipeRow {
  id: number;
  title: string;
  description: string | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  totalTimeMin: number | null;
  servings: number | null;
  imageUrl: string | null;
  sourceType: string | null;
  sourceRef: string | null;
  cuisine: string | null;
  language: string | null;
  extractionMethod: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  tagsJson: string;
  createdAt: number;
  updatedAt: number;
}
interface IngredientRow {
  id: number;
  recipeId: number;
  rawText: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  canonicalName: string;
  aisle: string;
  sortOrder: number;
}
interface StepRow {
  id: number;
  recipeId: number;
  idx: number;
  text: string;
  timerSeconds: number | null;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('cookbook.db');
  return dbPromise;
}

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    prepTimeMin INTEGER, cookTimeMin INTEGER, totalTimeMin INTEGER,
    servings REAL,
    imageUrl TEXT,
    sourceType TEXT, sourceRef TEXT,
    cuisine TEXT, language TEXT,
    extractionMethod TEXT,
    calories REAL, proteinG REAL, carbsG REAL, fatG REAL,
    tagsJson TEXT NOT NULL DEFAULT '[]',
    searchText TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY NOT NULL,
    recipeId INTEGER NOT NULL,
    rawText TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL, unit TEXT, notes TEXT,
    canonicalName TEXT NOT NULL,
    aisle TEXT NOT NULL,
    sortOrder INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY NOT NULL,
    recipeId INTEGER NOT NULL,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL,
    timerSeconds INTEGER
  );
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS folder_recipe (
    folderId INTEGER NOT NULL,
    recipeId INTEGER NOT NULL,
    PRIMARY KEY (folderId, recipeId)
  );
  CREATE INDEX IF NOT EXISTS idx_ingredients_recipe ON ingredients(recipeId);
  CREATE INDEX IF NOT EXISTS idx_steps_recipe ON steps(recipeId);
`;

export async function initDb(): Promise<void> {
  const db = await getDb();
  // Detect and migrate the legacy v1 table (recipes with a `json` column) before
  // creating the normalized schema.
  const legacyCols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(recipes)");
  const isLegacy = legacyCols.some((c) => c.name === 'json');

  let legacyDrafts: RecipeDraft[] = [];
  if (isLegacy) {
    const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM recipes');
    legacyDrafts = rows.map((r) => JSON.parse(r.json) as RecipeDraft);
    await db.execAsync('DROP TABLE IF EXISTS recipes;');
  }

  await db.execAsync(SCHEMA);

  if (legacyDrafts.length) {
    for (const draft of legacyDrafts) await saveRecipe(draft, []);
  }
}

async function insertParts(
  db: SQLite.SQLiteDatabase,
  recipeId: number,
  draft: RecipeDraft,
): Promise<void> {
  for (let i = 0; i < draft.ingredients.length; i++) {
    const g = draft.ingredients[i]!;
    await db.runAsync(
      'INSERT INTO ingredients (recipeId, rawText, name, quantity, unit, notes, canonicalName, aisle, sortOrder) VALUES (?,?,?,?,?,?,?,?,?)',
      recipeId,
      g.raw,
      g.name,
      g.quantity,
      g.unit,
      g.notes ?? null,
      g.canonicalName,
      g.aisle,
      i,
    );
  }
  for (let i = 0; i < draft.steps.length; i++) {
    const s = draft.steps[i]!;
    await db.runAsync(
      'INSERT INTO steps (recipeId, idx, text, timerSeconds) VALUES (?,?,?,?)',
      recipeId,
      i,
      s.text,
      s.timerSeconds ?? null,
    );
  }
}

function recipeColumns(draft: RecipeDraft, tags: string[]) {
  const searchText = buildSearchText({ title: draft.title, ingredients: draft.ingredients, tags });
  return {
    searchText,
    values: [
      draft.title,
      draft.description ?? null,
      draft.prepTimeMin ?? null,
      draft.cookTimeMin ?? null,
      draft.totalTimeMin ?? null,
      draft.servings ?? null,
      draft.imageUrl ?? null,
      draft.sourceType,
      draft.sourceRef ?? null,
      draft.cuisine ?? null,
      draft.language ?? null,
      draft.extractionMethod,
      draft.nutrition?.calories ?? null,
      draft.nutrition?.proteinG ?? null,
      draft.nutrition?.carbsG ?? null,
      draft.nutrition?.fatG ?? null,
      JSON.stringify(tags),
      searchText,
    ] as const,
  };
}

const RECIPE_COLS =
  'title, description, prepTimeMin, cookTimeMin, totalTimeMin, servings, imageUrl, sourceType, sourceRef, cuisine, language, extractionMethod, calories, proteinG, carbsG, fatG, tagsJson, searchText';

export async function saveRecipe(draft: RecipeDraft, tags: string[] = []): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const { values } = recipeColumns(draft, tags);
  let id = 0;
  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO recipes (${RECIPE_COLS}, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ...values,
      now,
      now,
    );
    id = res.lastInsertRowId;
    await insertParts(db, id, draft);
  });
  return id;
}

export async function updateRecipe(
  id: number,
  draft: RecipeDraft,
  tags: string[] = [],
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const { values } = recipeColumns(draft, tags);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE recipes SET title=?, description=?, prepTimeMin=?, cookTimeMin=?, totalTimeMin=?, servings=?, imageUrl=?, sourceType=?, sourceRef=?, cuisine=?, language=?, extractionMethod=?, calories=?, proteinG=?, carbsG=?, fatG=?, tagsJson=?, searchText=?, updatedAt=? WHERE id=?`,
      ...values,
      now,
      id,
    );
    await db.runAsync('DELETE FROM ingredients WHERE recipeId = ?', id);
    await db.runAsync('DELETE FROM steps WHERE recipeId = ?', id);
    await insertParts(db, id, draft);
  });
}

function rowToDraft(
  r: RecipeRow,
  ingredients: ParsedIngredient[],
  steps: RecipeStep[],
): RecipeDraft {
  const hasNutrition =
    r.calories != null || r.proteinG != null || r.carbsG != null || r.fatG != null;
  return {
    title: r.title,
    description: r.description ?? undefined,
    ingredients,
    steps,
    prepTimeMin: r.prepTimeMin,
    cookTimeMin: r.cookTimeMin,
    totalTimeMin: r.totalTimeMin,
    servings: r.servings,
    imageUrl: r.imageUrl,
    cuisine: r.cuisine,
    language: r.language,
    sourceType: (r.sourceType ?? 'manual') as SourceType,
    sourceRef: r.sourceRef,
    nutrition: hasNutrition
      ? {
          calories: r.calories,
          proteinG: r.proteinG,
          carbsG: r.carbsG,
          fatG: r.fatG,
          fiberG: null,
          sodiumMg: null,
          perServing: true,
        }
      : null,
    extractionMethod: (r.extractionMethod ?? 'manual') as ExtractionMethod,
    confidence: 1,
    warnings: [],
  };
}

function ingredientRowToParsed(g: IngredientRow): ParsedIngredient {
  return {
    raw: g.rawText,
    quantity: g.quantity,
    unit: g.unit,
    name: g.name,
    canonicalName: g.canonicalName,
    aisle: g.aisle,
    notes: g.notes ?? undefined,
  };
}

/** Load all recipes (with ingredients + steps). Fine for a single-user library. */
export async function listRecipes(): Promise<SavedRecipe[]> {
  const db = await getDb();
  const recipeRows = await db.getAllAsync<RecipeRow>('SELECT * FROM recipes ORDER BY updatedAt DESC');
  if (recipeRows.length === 0) return [];

  const allIngredients = await db.getAllAsync<IngredientRow>(
    'SELECT * FROM ingredients ORDER BY recipeId, sortOrder',
  );
  const allSteps = await db.getAllAsync<StepRow>('SELECT * FROM steps ORDER BY recipeId, idx');

  const ingByRecipe = new Map<number, ParsedIngredient[]>();
  for (const g of allIngredients) {
    const arr = ingByRecipe.get(g.recipeId) ?? [];
    arr.push(ingredientRowToParsed(g));
    ingByRecipe.set(g.recipeId, arr);
  }
  const stepsByRecipe = new Map<number, RecipeStep[]>();
  for (const s of allSteps) {
    const arr = stepsByRecipe.get(s.recipeId) ?? [];
    arr.push({ index: s.idx, text: s.text, timerSeconds: s.timerSeconds });
    stepsByRecipe.set(s.recipeId, arr);
  }

  return recipeRows.map((r) => ({
    id: r.id,
    title: r.title,
    tags: JSON.parse(r.tagsJson) as string[],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    recipe: rowToDraft(r, ingByRecipe.get(r.id) ?? [], stepsByRecipe.get(r.id) ?? []),
  }));
}

export async function deleteRecipe(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM ingredients WHERE recipeId = ?', id);
    await db.runAsync('DELETE FROM steps WHERE recipeId = ?', id);
    await db.runAsync('DELETE FROM folder_recipe WHERE recipeId = ?', id);
    await db.runAsync('DELETE FROM recipes WHERE id = ?', id);
  });
}
