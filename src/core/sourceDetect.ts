import type { SourceType } from './types';

/** Hosts we treat as social posts (caption/description-first, scraping is fragile). */
const SOCIAL_HOSTS = [
  'tiktok.com',
  'vm.tiktok.com',
  'instagram.com',
  'instagr.am',
  'youtube.com',
  'youtu.be',
  'm.youtube.com',
  'facebook.com',
  'fb.watch',
  'fb.com',
  'pinterest.com',
  'pin.it',
];

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;

export interface SourceInput {
  /** explicit URL the user shared / pasted */
  url?: string;
  /** free text: a pasted recipe, or a social post caption/description */
  text?: string;
  /** local URI of an image/screenshot the user shared or captured */
  imageUri?: string;
}

export interface DetectedSource {
  type: SourceType;
  /** resolved URL when present (from `url` or extracted from `text`) */
  url?: string;
  /** the text payload (caption/description/pasted recipe) when present */
  text?: string;
  /** local image URI when present */
  imageUri?: string;
  /** hostname for url/social sources */
  host?: string;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return undefined;
  }
}

function isSocialHost(host: string | undefined): boolean {
  if (!host) return false;
  return SOCIAL_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

/** Pull the first http(s) URL out of a blob of text (social shares often look like "caption … https://…"). */
export function extractFirstUrl(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.match(URL_RE);
  return m ? m[0].replace(/[.,)\]]+$/, '') : undefined;
}

/**
 * Classify an import input into a source type.
 *
 * Precedence reflects the user's extraction strategy: a URL (which may carry a
 * caption/description or structured JSON-LD) and pasted text are preferred; a
 * bare image is the OCR-fallback case.
 */
export function detectSource(input: SourceInput): DetectedSource {
  const url = input.url?.trim() || extractFirstUrl(input.text);
  const host = url ? hostOf(url) : undefined;

  if (url) {
    const type: SourceType = isSocialHost(host) ? 'social' : 'url';
    return { type, url, host, text: input.text?.trim() || undefined, imageUri: input.imageUri };
  }

  if (input.text && input.text.trim()) {
    // carry imageUri through so the OCR fallback can fire if the text turns out unusable
    return { type: 'clipboard', text: input.text.trim(), imageUri: input.imageUri };
  }

  if (input.imageUri) {
    return { type: 'image', imageUri: input.imageUri };
  }

  // Nothing usable -> treat as an empty manual draft.
  return { type: 'manual' };
}
