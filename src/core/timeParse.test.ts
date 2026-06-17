import { describe, it, expect } from 'vitest';
import {
  iso8601DurationToMinutes,
  humanTimeToMinutes,
  parseDurationToMinutes,
  detectStepTimerSeconds,
} from './timeParse';

describe('iso8601DurationToMinutes', () => {
  it('parses hours and minutes', () => {
    expect(iso8601DurationToMinutes('PT1H30M')).toBe(90);
    expect(iso8601DurationToMinutes('PT45M')).toBe(45);
    expect(iso8601DurationToMinutes('PT2H')).toBe(120);
  });
  it('parses days', () => {
    expect(iso8601DurationToMinutes('P1DT2H')).toBe(24 * 60 + 120);
  });
  it('returns null for junk / empty', () => {
    expect(iso8601DurationToMinutes('garbage')).toBeNull();
    expect(iso8601DurationToMinutes(null)).toBeNull();
    expect(iso8601DurationToMinutes(undefined)).toBeNull();
  });
});

describe('humanTimeToMinutes', () => {
  it('parses mixed phrases', () => {
    expect(humanTimeToMinutes('1 hr 30 min')).toBe(90);
    expect(humanTimeToMinutes('45 minutes')).toBe(45);
    expect(humanTimeToMinutes('2 hours')).toBe(120);
  });
  it('returns null when no duration present', () => {
    expect(humanTimeToMinutes('no time here')).toBeNull();
  });
});

describe('parseDurationToMinutes', () => {
  it('prefers ISO then falls back to human', () => {
    expect(parseDurationToMinutes('PT1H')).toBe(60);
    expect(parseDurationToMinutes('about 20 minutes')).toBe(20);
  });
});

describe('detectStepTimerSeconds', () => {
  it('extracts an in-step timer', () => {
    expect(detectStepTimerSeconds('bake for 25 minutes')).toBe(1500);
    expect(detectStepTimerSeconds('simmer 1 hr')).toBe(3600);
  });
  it('returns null when no timer phrase', () => {
    expect(detectStepTimerSeconds('mix well until combined')).toBeNull();
  });
});
