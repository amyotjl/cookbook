/**
 * Platform adapter: fetch a page's HTML for recipe import.
 *
 * In React Native there is no CORS restriction (that's browser-only), so this can
 * fetch any recipe site directly from the device. This is the only place the app
 * touches the network for the URL-import path; it is injected into the core's
 * `extractRecipe` so the core stays network-agnostic and unit-testable.
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      // Some sites gate bot-looking requests; present a normal browser UA.
      'User-Agent':
        'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch page (HTTP ${res.status})`);
  return res.text();
}
