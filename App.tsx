import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import * as Clipboard from 'expo-clipboard';

import {
  buildGroceryList,
  buildSearchText,
  extractRecipe,
  parseIngredientLine,
  parseTags,
  recipeMatchesQuery,
  scaleIngredients,
  type GroceryItem,
  type ParsedIngredient,
  type RecipeDraft,
} from './src/core';
import { fetchHtml } from './src/platform/fetchHtml';
import {
  deleteRecipe,
  initDb,
  listRecipes,
  saveRecipe,
  updateRecipe,
  type SavedRecipe,
} from './src/db/recipes';
import { colors, styles } from './src/ui/styles';

type Screen = 'home' | 'review' | 'detail' | 'grocery';

const EMPTY_DRAFT: RecipeDraft = {
  title: '',
  ingredients: [],
  steps: [],
  prepTimeMin: null,
  cookTimeMin: null,
  totalTimeMin: null,
  servings: null,
  nutrition: null,
  sourceType: 'manual',
  sourceRef: null,
  extractionMethod: 'manual',
  confidence: 1,
  warnings: [],
};

function fmtQty(n: number | null): string {
  if (n == null) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function ingredientLabel(ing: ParsedIngredient): string {
  const qty = [fmtQty(ing.quantity), ing.unit ?? ''].filter(Boolean).join(' ');
  const main = [qty, ing.name].filter(Boolean).join(' ');
  return ing.notes ? `${main}, ${ing.notes}` : main;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [draftTags, setDraftTags] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [selected, setSelected] = useState<SavedRecipe | null>(null);

  const refresh = useCallback(async () => {
    setSaved(await listRecipes());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initDb();
        await refresh();
      } catch (e) {
        Alert.alert('Database error', String(e));
      }
    })();
  }, [refresh]);

  const onImport = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    try {
      const result = await extractRecipe({ text }, { fetchHtml });
      setEditingId(null);
      setDraftTags('');
      setDraft(result);
      setScreen('review');
    } catch (e) {
      Alert.alert('Import failed', String(e));
    } finally {
      setLoading(false);
    }
  }, [input]);

  const onPaste = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setInput(text);
  }, []);

  const startNew = useCallback(() => {
    setEditingId(null);
    setDraftTags('');
    setDraft({ ...EMPTY_DRAFT });
    setScreen('review');
  }, []);

  const startEdit = useCallback((r: SavedRecipe) => {
    setEditingId(r.id);
    setDraftTags(r.tags.join(', '));
    setDraft(r.recipe);
    setScreen('review');
  }, []);

  const onSave = useCallback(async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      Alert.alert('Add a title', 'Please give the recipe a title before saving.');
      return;
    }
    try {
      const tags = parseTags(draftTags);
      if (editingId != null) await updateRecipe(editingId, draft, tags);
      else await saveRecipe(draft, tags);
      setDraft(null);
      setEditingId(null);
      setDraftTags('');
      setInput('');
      await refresh();
      setScreen('home');
    } catch (e) {
      Alert.alert('Save failed', String(e));
    }
  }, [draft, draftTags, editingId, refresh]);

  const onDelete = useCallback(
    (id: number) => {
      Alert.alert('Delete recipe?', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRecipe(id);
            await refresh();
            setScreen('home');
          },
        },
      ]);
    },
    [refresh],
  );

  const filtered = useMemo(
    () =>
      saved.filter((r) =>
        recipeMatchesQuery(
          buildSearchText({ title: r.recipe.title, ingredients: r.recipe.ingredients, tags: r.tags }),
          query,
        ),
      ),
    [saved, query],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {screen === 'home' && (
          <HomeScreen
            input={input}
            setInput={setInput}
            query={query}
            setQuery={setQuery}
            loading={loading}
            onImport={onImport}
            onPaste={onPaste}
            onNew={startNew}
            recipes={filtered}
            totalCount={saved.length}
            onOpen={(r) => {
              setSelected(r);
              setScreen('detail');
            }}
            onGroceries={() => setScreen('grocery')}
          />
        )}
        {screen === 'review' && draft && (
          <ReviewScreen
            draft={draft}
            setDraft={setDraft}
            tags={draftTags}
            setTags={setDraftTags}
            editing={editingId != null}
            onSave={onSave}
            onCancel={() => {
              setDraft(null);
              setEditingId(null);
              setScreen('home');
            }}
          />
        )}
        {screen === 'detail' && selected && (
          <DetailScreen
            saved={selected}
            onBack={() => setScreen('home')}
            onEdit={() => startEdit(selected)}
            onDelete={() => onDelete(selected.id)}
          />
        )}
        {screen === 'grocery' && (
          <GroceryScreen saved={saved} onBack={() => setScreen('home')} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HomeScreen(props: {
  input: string;
  setInput: (s: string) => void;
  query: string;
  setQuery: (s: string) => void;
  loading: boolean;
  onImport: () => void;
  onPaste: () => void;
  onNew: () => void;
  recipes: SavedRecipe[];
  totalCount: number;
  onOpen: (r: SavedRecipe) => void;
  onGroceries: () => void;
}) {
  const {
    input,
    setInput,
    query,
    setQuery,
    loading,
    onImport,
    onPaste,
    onNew,
    recipes,
    totalCount,
    onOpen,
    onGroceries,
  } = props;
  return (
    <View style={styles.container}>
      <Text style={styles.header}>CookBook</Text>
      <Text style={styles.subheader}>Paste a recipe link or text — it stays on your phone.</Text>

      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="https://… a recipe link, or paste the recipe text / caption"
        placeholderTextColor={colors.subtle}
        value={input}
        onChangeText={setInput}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.rowBetween}>
        <Pressable onPress={onPaste}>
          <Text style={styles.link}>Paste from clipboard</Text>
        </Pressable>
        {input.length > 0 && (
          <Pressable onPress={() => setInput('')}>
            <Text style={[styles.link, { color: colors.subtle }]}>Clear</Text>
          </Pressable>
        )}
      </View>
      <Pressable style={styles.button} onPress={onImport} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Import recipe</Text>
        )}
      </Pressable>
      <Pressable style={styles.buttonGhost} onPress={onNew}>
        <Text style={styles.buttonGhostText}>＋ New recipe (manual)</Text>
      </Pressable>

      <View style={[styles.rowBetween, { marginTop: 18 }]}>
        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>My recipes ({totalCount})</Text>
        <Pressable onPress={onGroceries}>
          <Text style={styles.link}>Groceries ›</Text>
        </Pressable>
      </View>

      {totalCount > 0 && (
        <TextInput
          style={[styles.input, { marginBottom: 10 }]}
          placeholder="Search by title, ingredient, or tag"
          placeholderTextColor={colors.subtle}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      )}

      {totalCount === 0 ? (
        <Text style={styles.empty}>No recipes yet. Import or create your first one above.</Text>
      ) : recipes.length === 0 ? (
        <Text style={styles.empty}>No recipes match “{query}”.</Text>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => String(r.id)}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => onOpen(item)}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.recipe.title}
              </Text>
              <Text style={styles.cardMeta}>
                {item.recipe.ingredients.length} ingredients · {item.recipe.steps.length} steps
                {item.tags.length ? ` · ${item.tags.join(', ')}` : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function ReviewScreen(props: {
  draft: RecipeDraft;
  setDraft: (d: RecipeDraft) => void;
  tags: string;
  setTags: (s: string) => void;
  editing: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { draft, setDraft, tags, setTags, editing, onSave, onCancel } = props;

  const setTitle = (title: string) => setDraft({ ...draft, title });

  const setIngredientRaw = (index: number, raw: string) => {
    const ingredients = draft.ingredients.slice();
    ingredients[index] = parseIngredientLine(raw); // re-parse so qty/unit/aisle stay in sync
    setDraft({ ...draft, ingredients });
  };
  const removeIngredient = (index: number) =>
    setDraft({ ...draft, ingredients: draft.ingredients.filter((_, i) => i !== index) });
  const addIngredient = () =>
    setDraft({ ...draft, ingredients: [...draft.ingredients, parseIngredientLine('')] });

  const setStepText = (index: number, text: string) => {
    const steps = draft.steps.slice();
    const existing = steps[index];
    if (existing) steps[index] = { ...existing, text };
    setDraft({ ...draft, steps });
  };
  const removeStep = (index: number) =>
    setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) });
  const addStep = () =>
    setDraft({
      ...draft,
      steps: [...draft.steps, { index: draft.steps.length, text: '', timerSeconds: null }],
    });

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {draft.extractionMethod !== 'manual' && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {draft.extractionMethod} · {Math.round(draft.confidence * 100)}% confident
          </Text>
        </View>
      )}
      {draft.warnings.map((w, i) => (
        <Text key={i} style={styles.warn}>
          ⚠ {w}
        </Text>
      ))}

      <Text style={styles.sectionTitle}>Title</Text>
      <TextInput
        style={styles.input}
        value={draft.title}
        onChangeText={setTitle}
        placeholder="Recipe title"
        placeholderTextColor={colors.subtle}
      />

      <Text style={styles.sectionTitle}>Tags (comma-separated)</Text>
      <TextInput
        style={styles.input}
        value={tags}
        onChangeText={setTags}
        placeholder="e.g. dinner, vegetarian, quick"
        placeholderTextColor={colors.subtle}
        autoCapitalize="none"
      />

      <Text style={styles.sectionTitle}>Ingredients ({draft.ingredients.length})</Text>
      {draft.ingredients.map((ing, i) => (
        <View key={i} style={styles.ingredientRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={ing.raw}
            onChangeText={(t) => setIngredientRaw(i, t)}
            placeholder="e.g. 2 cups flour"
            placeholderTextColor={colors.subtle}
          />
          <Pressable onPress={() => removeIngredient(i)} style={{ paddingHorizontal: 10 }}>
            <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.buttonGhost} onPress={addIngredient}>
        <Text style={styles.buttonGhostText}>＋ Add ingredient</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Steps ({draft.steps.length})</Text>
      {draft.steps.map((s, i) => (
        <View key={i} style={[styles.row, { alignItems: 'flex-start', marginBottom: 8 }]}>
          <Text style={styles.stepNum}>{i + 1}</Text>
          <TextInput
            style={[styles.input, styles.multiline, { flex: 1 }]}
            value={s.text}
            onChangeText={(t) => setStepText(i, t)}
            placeholder="Describe this step"
            placeholderTextColor={colors.subtle}
            multiline
          />
          <Pressable onPress={() => removeStep(i)} style={{ paddingHorizontal: 8, paddingTop: 12 }}>
            <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.buttonGhost} onPress={addStep}>
        <Text style={styles.buttonGhostText}>＋ Add step</Text>
      </Pressable>

      <Pressable style={styles.button} onPress={onSave}>
        <Text style={styles.buttonText}>{editing ? 'Save changes' : 'Save to CookBook'}</Text>
      </Pressable>
      <Pressable style={styles.buttonGhost} onPress={onCancel}>
        <Text style={styles.buttonGhostText}>{editing ? 'Cancel' : 'Discard'}</Text>
      </Pressable>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function DetailScreen(props: {
  saved: SavedRecipe;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { saved, onBack, onEdit, onDelete } = props;
  useKeepAwake(); // keep the screen on while cooking
  const recipe = saved.recipe;
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : 1;
  const [servings, setServings] = useState(baseServings);

  const shownIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, baseServings, servings),
    [recipe.ingredients, baseServings, servings],
  );

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.rowBetween}>
        <Pressable onPress={onBack}>
          <Text style={styles.link}>‹ Back</Text>
        </Pressable>
        <Pressable onPress={onEdit}>
          <Text style={styles.link}>Edit</Text>
        </Pressable>
      </View>
      <Text style={[styles.header, { marginTop: 8 }]}>{recipe.title}</Text>
      <Text style={styles.subheader}>
        {[
          recipe.totalTimeMin ? `${recipe.totalTimeMin} min` : null,
          recipe.cuisine,
          saved.tags.length ? saved.tags.join(', ') : null,
          'screen stays on',
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Servings</Text>
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => setServings((s) => Math.max(1, s - 1))}
          >
            <Text style={styles.stepperBtnText}>−</Text>
          </Pressable>
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.text,
              minWidth: 24,
              textAlign: 'center',
            }}
          >
            {servings}
          </Text>
          <Pressable style={styles.stepperBtn} onPress={() => setServings((s) => s + 1)}>
            <Text style={styles.stepperBtnText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Ingredients</Text>
      {shownIngredients.map((ing, i) => (
        <Text key={i} style={[styles.stepText, { marginBottom: 4 }]}>
          • {ingredientLabel(ing)}
          {ing.aisle && ing.aisle !== 'Other' ? `  (${ing.aisle})` : ''}
        </Text>
      ))}

      <Text style={styles.sectionTitle}>Steps</Text>
      {recipe.steps.map((s, i) => (
        <View key={i} style={[styles.row, { alignItems: 'flex-start', marginBottom: 10 }]}>
          <Text style={styles.stepNum}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepText}>{s.text}</Text>
            {s.timerSeconds ? <StepTimer seconds={s.timerSeconds} /> : null}
          </View>
        </View>
      ))}

      <Pressable style={[styles.buttonGhost, { borderColor: colors.danger }]} onPress={onDelete}>
        <Text style={[styles.buttonGhostText, { color: colors.danger }]}>Delete recipe</Text>
      </Pressable>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function StepTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            if (ref.current) clearInterval(ref.current);
            setRunning(false);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [running]);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const label = `${mm}:${String(ss).padStart(2, '0')}`;
  const hint = running ? 'tap to pause' : remaining === 0 ? 'done — tap to reset' : 'tap to start';

  return (
    <Pressable
      onPress={() => {
        if (remaining === 0) {
          setRemaining(seconds);
          return;
        }
        setRunning((r) => !r);
      }}
      style={{
        alignSelf: 'flex-start',
        marginTop: 6,
        backgroundColor: remaining === 0 ? colors.good : colors.accentSoft,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text
        style={{
          color: remaining === 0 ? '#fff' : colors.accent,
          fontWeight: '700',
          fontSize: 13,
        }}
      >
        ⏱ {label} · {hint}
      </Text>
    </Pressable>
  );
}

function GroceryScreen(props: { saved: SavedRecipe[]; onBack: () => void }) {
  const { saved, onBack } = props;
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const sections = useMemo(() => {
    const lists = saved.filter((r) => selected[r.id]).map((r) => r.recipe.ingredients);
    return buildGroceryList(lists);
  }, [saved, selected]);

  const itemKey = (aisle: string, it: GroceryItem) =>
    `${aisle}|${it.canonicalName}|${it.unit ?? ''}`;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack}>
        <Text style={styles.link}>‹ Back</Text>
      </Pressable>
      <Text style={[styles.header, { marginTop: 8 }]}>Groceries</Text>
      <Text style={styles.subheader}>Pick recipes to combine into one aisle-sorted list.</Text>

      {saved.length === 0 ? (
        <Text style={styles.empty}>Save some recipes first.</Text>
      ) : (
        saved.map((r) => (
          <Pressable
            key={r.id}
            style={styles.ingredientRow}
            onPress={() => setSelected((s) => ({ ...s, [r.id]: !s[r.id] }))}
          >
            <Text style={{ fontSize: 18, marginRight: 8 }}>{selected[r.id] ? '☑' : '☐'}</Text>
            <Text style={{ flex: 1, color: colors.text }}>{r.recipe.title}</Text>
          </Pressable>
        ))
      )}

      {sections.length > 0 && <Text style={styles.sectionTitle}>Shopping list</Text>}
      {sections.map((sec) => (
        <View key={sec.aisle} style={{ marginBottom: 8 }}>
          <Text style={{ fontWeight: '700', color: colors.accent, marginTop: 8, marginBottom: 4 }}>
            {sec.aisle}
          </Text>
          {sec.items.map((it) => {
            const k = itemKey(sec.aisle, it);
            const isChecked = !!checked[k];
            const qty = [it.quantity != null ? fmtQty(it.quantity) : '', it.unit ?? '']
              .filter(Boolean)
              .join(' ');
            return (
              <Pressable
                key={k}
                style={styles.ingredientRow}
                onPress={() => setChecked((c) => ({ ...c, [k]: !c[k] }))}
              >
                <Text style={{ fontSize: 16, marginRight: 8 }}>{isChecked ? '☑' : '☐'}</Text>
                <Text
                  style={{
                    flex: 1,
                    color: isChecked ? colors.subtle : colors.text,
                    textDecorationLine: isChecked ? 'line-through' : 'none',
                  }}
                >
                  {[qty, it.displayName].filter(Boolean).join(' ')}
                  {it.sourceCount > 1 ? `  ×${it.sourceCount}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
