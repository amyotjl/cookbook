import { parseIngredient } from 'parse-ingredient';
import type { ParsedIngredient } from './types';
import { canonicalizeName, aisleFor } from './canonicalize';

/** Split a trailing prep note off a description, e.g. "onion, finely chopped" -> {name, notes}. */
function splitNotes(description: string): { name: string; notes?: string } {
  const commaIdx = description.indexOf(',');
  if (commaIdx === -1) return { name: description.trim() };
  return {
    name: description.slice(0, commaIdx).trim(),
    notes: description.slice(commaIdx + 1).trim() || undefined,
  };
}

/**
 * Parse a single free-text ingredient line into a normalized ParsedIngredient.
 * Always returns something usable (falls back to the raw line as the name).
 */
export function parseIngredientLine(line: string): ParsedIngredient {
  const raw = line.trim();
  const parsed = parseIngredient(raw, { normalizeUOM: true })[0];

  if (!parsed || parsed.isGroupHeader) {
    const name = raw;
    return {
      raw,
      quantity: null,
      unit: null,
      name,
      canonicalName: canonicalizeName(name),
      aisle: aisleFor(name),
    };
  }

  const { name, notes } = splitNotes(parsed.description || raw);
  const cleanName = name || raw;

  return {
    raw,
    quantity: parsed.quantity ?? null,
    unit: parsed.unitOfMeasure ?? null,
    name: cleanName,
    canonicalName: canonicalizeName(cleanName),
    aisle: aisleFor(cleanName),
    notes,
  };
}

/** Parse multiple lines, dropping blanks and pure section headers. */
export function parseIngredientLines(lines: string[]): ParsedIngredient[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseIngredientLine);
}
