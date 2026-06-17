# CookBook

A **local-only** recipe capture, planning, and cooking app for Android. No accounts, no subscription, no servers — everything lives on your phone.

Built with React Native + Expo. The "magic" (importing a recipe from a link or pasted text) works with **no AI and no paid service** by reading the page's structured data, falling back to a text parser, with OCR planned as the image fallback.

## Features

- **Import recipes** from a web URL or pasted text/caption. Structured-data (`schema.org/Recipe`) sites parse with no AI; other text is parsed heuristically. Everything lands in an **editable** card so you can fix any misses.
- **Create / edit by hand** — full manual recipe entry (title, tags, ingredients, steps).
- **Organize** — searchable library (title, ingredient, or tag) with tags.
- **Cook** — step view that keeps the screen awake, with per-step countdown timers and live **serving scaling**.
- **Groceries** — pick recipes and get one consolidated, **aisle-sorted** shopping list with check-off.
- **Offline & private** — recipes are stored in on-device SQLite; nothing leaves the phone.

## Architecture

- `src/core/` — **framework-agnostic TypeScript** (no React Native imports): extraction (`extractRecipe`), `schema.org` JSON-LD parsing, ingredient parsing + canonicalization/aisle mapping, time parsing, serving scaling + unit conversion, grocery consolidation, search/tags. Fully unit-tested with Vitest.
- `src/db/` — on-device SQLite store (`expo-sqlite`): normalized `recipes` / `ingredients` / `steps` tables.
- `src/platform/` — thin platform adapters (e.g. `fetchHtml`) injected into the core, so the core stays pure and testable.
- `App.tsx` — the React Native UI (Home / Review / Detail / Groceries).

The core takes side-effects (HTML fetch, OCR) as **injected dependencies**, which is why it runs and tests under plain Node with no native modules.

## Extraction strategy

Prefer **text** over OCR: structured data → caption/description/pasted text → (planned) OCR fallback for images. Text is cheaper and more accurate than OCR.

## Getting started

Requires Node LTS. Runs in **Expo Go** for the import/text path (no native build needed).

```bash
npm install
npx expo start -c
```

Then scan the QR code with **Expo Go** on an Android phone (same Wi-Fi). This project targets **Expo SDK 54** to match the current Expo Go release.

### Scripts

```bash
npm test         # run the core unit tests (Vitest)
npm run typecheck # TypeScript, no emit
npx expo-doctor   # validate the Expo project
```

## Roadmap

- Folders to organize the library (tables already in place)
- Bundled offline nutrition database (calories/macros)
- Weekly meal planner that feeds the grocery list
- Dev build (decoupled from Expo Go) to add: share-sheet import ("Share → CookBook"), on-device **OCR** import, translation, and voice/read-aloud cooking mode
- Optional bring-your-own-API-key AI layer (assistant, smart edits, pantry/photo recognition) — off by default

## License

Personal project. Not affiliated with any commercial recipe app.
