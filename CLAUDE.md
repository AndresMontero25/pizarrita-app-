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

## Deployment

**Platform: Vercel**, connected to the GitHub repo `AndresMontero25/pizarrita-app-`.

Deployment is automatic — pushing to `main` triggers a production deploy on Vercel. No manual deploy command needed.

Workflow for new features:
1. Create a feature branch (e.g. `git checkout -b feature-name`)
2. Develop and test locally with `npm run dev`
3. Merge into `main` and push → Vercel deploys automatically

## Architecture

This is a React + Vite app that wraps Excalidraw with multi-project support, backed by Firebase Firestore and Firebase Auth.

**Authentication (`src/firebase.js`, `src/AuthPage.jsx`):**
- Firebase Auth with email/password
- `AuthPage` handles login and registration with two tabs
- On login/register, the user's email is written to the `users/{uid}` collection so other users can find them for sharing
- `onAuthStateChanged` in `App.jsx` guards the entire app — unauthenticated users only see `AuthPage`

**Three-layer data model (`src/db.js`):**
- `users/{uid}`: stores `{ email }` for all registered users (used for the sharing feature)
- `projects/{projectId}`: metadata (`name`, `ownerId`, `sharedWith[]`, `createdAt`, `updatedAt`)
- `scenes/{projectId}`: Excalidraw canvas state (`elements`, `appState`), with a `files` subcollection

**Per-user projects and sharing:**
- Each project has `ownerId` (the creator's uid) and `sharedWith` (array of uids with read-only access)
- `getAllProjects(userId)` runs two Firestore queries (owned + shared) and merges them — requires two composite indexes:
  - `projects`: `ownerId ASC` + `createdAt ASC`
  - `projects`: `sharedWith (Arrays)` + `createdAt ASC`
- Shared projects open in Excalidraw's `viewModeEnabled` — read-only, cannot edit or delete
- Only the owner sees rename, share, and delete buttons

**`src/App.jsx` — single-file application:**
- Sidebar lists projects; clicking one loads its scene from Firestore and passes it as `initialData` to `<Excalidraw>`
- `onExcalidrawChange` debounces auto-save (1.5s) back to Firestore via `saveScene` (only for owned projects)
- Delete requires Firebase re-authentication with the user's own password (`reauthenticateWithCredential`)
- `cleanSceneData` normalizes loaded scene data to satisfy Excalidraw's required appState shape (especially `collaborators: new Map()`)
- Theme (light/dark) is persisted to `localStorage` and applied via `data-theme` on `<html>`
- Last active project is persisted to `localStorage` as `lastProjectId` and restored on load
- An `ErrorBoundary` wraps `<Excalidraw>` to catch render errors gracefully
- `window.EXCALIDRAW_ASSET_PATH = "/"` polyfill is required for Excalidraw to resolve its assets correctly under Vite
