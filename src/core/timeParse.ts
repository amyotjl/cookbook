/**
 * Time parsing helpers.
 *
 * Recipe sources express durations two ways:
 *  - schema.org JSON-LD uses ISO-8601 durations (e.g. "PT1H30M").
 *  - human text / captions use phrases like "1 hr 30 min", "45 minutes".
 */

/** Parse an ISO-8601 duration (the date/time-of-day form, e.g. "PT1H30M") into minutes. */
export function iso8601DurationToMinutes(input: string | null | undefined): number | null {
  if (!input) return null;
  const s = input.trim().toUpperCase();
  // PnDTnHnMnS — recipes only ever use D/H/M (S is ignored as sub-minute).
  const re = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
  const m = s.match(re);
  if (!m) return null;
  const days = parseFloat(m[1] ?? '0');
  const hours = parseFloat(m[2] ?? '0');
  const mins = parseFloat(m[3] ?? '0');
  const secs = parseFloat(m[4] ?? '0');
  const total = days * 24 * 60 + hours * 60 + mins + secs / 60;
  if (total <= 0 || Number.isNaN(total)) return null;
  return Math.round(total);
}

const HUMAN_TIME_RE =
  /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|days?|d)\b/gi;

/** Parse a human duration phrase ("1 hr 30 min", "45 minutes", "2 hours") into minutes. */
export function humanTimeToMinutes(input: string | null | undefined): number | null {
  if (!input) return null;
  let total = 0;
  let matched = false;
  for (const m of input.matchAll(HUMAN_TIME_RE)) {
    const value = parseFloat(m[1]!);
    const unit = m[2]!.toLowerCase();
    matched = true;
    if (unit.startsWith('d')) total += value * 24 * 60;
    else if (unit.startsWith('h')) total += value * 60;
    else total += value; // minutes
  }
  if (!matched || total <= 0) return null;
  return Math.round(total);
}

/** Best-effort: try ISO first, then human text. */
export function parseDurationToMinutes(input: string | null | undefined): number | null {
  return iso8601DurationToMinutes(input) ?? humanTimeToMinutes(input);
}

/** Extract an in-step timer (seconds) from instruction text, e.g. "bake for 25 minutes" -> 1500. */
export function detectStepTimerSeconds(stepText: string): number | null {
  const mins = humanTimeToMinutes(stepText);
  return mins != null ? mins * 60 : null;
}
