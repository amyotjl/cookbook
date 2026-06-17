import { describe, it, expect } from 'vitest';
import { detectSource, extractFirstUrl } from './sourceDetect';

describe('extractFirstUrl', () => {
  it('pulls the first url and trims trailing punctuation', () => {
    expect(extractFirstUrl('see https://a.com/b. thanks')).toBe('https://a.com/b');
    expect(extractFirstUrl('no link here')).toBeUndefined();
  });
});

describe('detectSource', () => {
  it('detects a plain web url', () => {
    const s = detectSource({ url: 'https://example.com/recipe' });
    expect(s.type).toBe('url');
    expect(s.host).toBe('example.com');
  });

  it('detects a social url embedded in caption text', () => {
    const s = detectSource({ text: 'yum! https://www.tiktok.com/@x/video/123' });
    expect(s.type).toBe('social');
    expect(s.host).toBe('tiktok.com');
    expect(s.url).toContain('tiktok.com');
  });

  it('detects pasted text', () => {
    const s = detectSource({ text: 'just a caption, no link' });
    expect(s.type).toBe('clipboard');
    expect(s.text).toBe('just a caption, no link');
  });

  it('carries an image through alongside text', () => {
    const s = detectSource({ text: 'caption', imageUri: 'file:///a.jpg' });
    expect(s.type).toBe('clipboard');
    expect(s.imageUri).toBe('file:///a.jpg');
  });

  it('detects a bare image', () => {
    expect(detectSource({ imageUri: 'file:///a.jpg' }).type).toBe('image');
  });

  it('falls back to manual', () => {
    expect(detectSource({}).type).toBe('manual');
  });
});
