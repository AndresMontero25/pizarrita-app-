# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server with HMR
npm run build    # Production build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

No test suite is configured.

## Architecture

This is a React + Vite app that wraps Excalidraw with multi-project support via IndexedDB.

**Two-layer data model (`src/db.js`):**
- `projects` table: metadata (id, name, createdAt, updatedAt)
- `scenes` table: Excalidraw canvas state (elements, appState, files), keyed by `projectId`
- Uses Dexie.js as an IndexedDB wrapper. `deleteProject` uses a transaction to atomically remove both the project and its scene.

**`src/App.jsx` — single-file application:**
- Sidebar lists projects; clicking one loads its scene from IndexedDB and passes it as `initialData` to the `<Excalidraw>` component.
- `onExcalidrawChange` debounces auto-save (1 second) back to IndexedDB via `saveScene`.
- `cleanSceneData` normalizes loaded scene data to satisfy Excalidraw's required appState shape (especially `collaborators: new Map()`).
- Theme (light/dark) is persisted to `localStorage` and applied via `data-theme` on `<html>`.
- Last active project is persisted to `localStorage` as `lastProjectId` and restored on load.
- An `ErrorBoundary` wraps `<Excalidraw>` to catch render errors gracefully.
- `window.EXCALIDRAW_ASSET_PATH = "/"` polyfill is required for Excalidraw to resolve its assets correctly under Vite.
