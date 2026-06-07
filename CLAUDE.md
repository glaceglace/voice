# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Root (runs both backend + frontend in parallel)
```bash
npm run dev      # Start both backend and frontend dev servers
npm run build    # Build both packages
npm test         # Run all tests
```

### Backend (`cd backend`)
```bash
npm run dev      # ts-node-dev server with auto-restart (port 3000)
npm run build    # Compile TypeScript → dist/
npm test         # Jest tests with coverage
npx jest src/path/to/file.spec.ts  # Single test file
```

### Frontend (`cd frontend`)
```bash
npm start        # Angular dev server (port 4200)
npm run build    # Production build
npm test         # Vitest via Angular CLI
ng test --include='**/foo.spec.ts'  # Single test file
```

Backend env config: copy `backend/.env.example` → `backend/.env` before first run.

## Architecture

### Monorepo Layout
- `backend/` — Express.js + TypeScript REST API; FFmpeg-based audio DSP
- `frontend/` — Angular 21 standalone SPA; Web Audio API for playback/recording

### Frontend Architecture

**State: Angular Signals (no NgRx)**  
`ProjectService` is the single source of truth. It exposes a readonly `state` signal and maintains an undo stack (max 50). All mutations go through `mutate()`, which snapshots state before updating. State is automatically debounced (300 ms) and persisted to `localStorage` under the key `voice-editor-project`; it is rehydrated on service init. `reset()` clears history, restores `defaultProjectState()`, and removes the localStorage entry.

**Key services (all `providedIn: 'root'`):**
- `ProjectService` — immutable project state + undo history + localStorage persistence
- `PlaybackService` — Web Audio API scheduling; plays clips from state; rAF loop updates `playheadPosition` signal during playback
- `RecorderService` — MediaRecorder → `recorded$` Subject → `FileService.importBlob()`
- `AudioContextService` — manages the shared `AudioContext` lifecycle
- `FileService` — file import orchestration (upload → addClip → fetch peaks); also owns zoom-tier change detection that re-fetches all peaks on zoom boundary crossing
- `EditActionsService` — cut/trim logic; determines which of 4 split cases applies, calls `ApiService`, updates state, re-fetches peaks at correct resolution
- `ApiService` — all HTTP to the backend (`/api/audio/*`)

**Component hierarchy:**
```
EditorComponent
  ├── ToolbarComponent       (transport controls, zoom, undo, export, new-project)
  └── TimelineComponent      (core DAW canvas — drag/select/context-menu/auto-scroll)
        ├── TrackHeaderComponent  (per-track controls: mute/solo/import/delete)
        ├── WaveformCanvasComponent  (canvas peak rendering per clip)
        └── ContextMenuComponent
```

`TimelineComponent` owns all mouse hit-testing, drag-to-select, handle drag, keyboard shortcuts (Ctrl+Z undo, Ctrl+X cut, spacebar play/pause, arrows seek, Delete), and an `autoScrollEffect` that keeps the playhead visible during playback. Each track row is `TRACK_HEIGHT = 160 px` tall; this constant is also used in the hit-test formula `floor((y - rulerH) / TRACK_HEIGHT)`.

`TrackHeaderComponent` injects both `ProjectService` and `FileService`. Its import button triggers a file picker scoped to that track's ID. Delete and the toolbar's "New project" button both gate on `window.confirm()` before mutating state.

### Backend Architecture

Express routes under `/api/audio/`:
- `POST /import` — multipart file upload, stored in `/tmp/voice-editor/sessions/`; returns `fileId`
- `GET /peaks/:fileId` — compute waveform peaks at a given resolution
- `GET /file/:fileId/raw` — stream raw audio for Web Audio decoding
- `POST /cut`, `/trim`, `/merge`, `/fade`, `/noise-gate` — FFmpeg DSP ops; return new `fileId`s
- `POST /export` — starts async export job; returns `jobId`
- `GET /export/progress/:jobId` — SSE stream of `{ progress, status }` events
- `GET /export/download/:jobId` — download completed export (available only when `status === 'done'`)
- `DELETE /file/:fileId` — cleanup
- `POST /session/cleanup` — bulk cleanup on tab close

`FfmpegService` wraps `fluent-ffmpeg` for all DSP. `StorageService` manages file I/O; on startup it scans the session directory and re-registers any pre-existing files so that a backend restart doesn't break already-imported clips.

### Key Data Flows

**Import (per-track):** `TrackHeaderComponent.importFile()` → `FileService.importFile(file, trackId)` → `ApiService.uploadFile()` → `ProjectService.addClip()` → `ApiService.getPeaks(resolution)` → `ProjectService.setClipPeaks()`

**Peak resolution formula** (used in both `FileService` and `EditActionsService`):  
`clamp(ceil(zoom × duration), 200, 10000)` — gives ~1 peak per CSS pixel so waveforms are never blurry regardless of clip length or zoom level. `FileService` also has a `zoomTier()` (thresholds: 50, 200 px/s) that triggers a full peaks re-fetch for all clips when zoom crosses a boundary.

**Playback:** `PlaybackService.play()` → fetch `/file/:id/raw` for each active clip → decode `AudioBuffer` → schedule via `AudioBufferSourceNode` → rAF loop updates playhead signal → `TimelineComponent.autoScrollEffect` keeps playhead in view

**Cut edit (4-case logic in `EditActionsService`):** selection → determine case (full remove / left trim / right trim / split) → `ApiService.cut()` → `ProjectService.replaceClip()` → fetch peaks for new clips at correct resolution

**Export:** `ExportDialogComponent.startExport()` → `ApiService.startExport()` → SSE on `/export/progress/:jobId` → wait for `status === 'done'` (not `progress >= 100`, because FFmpeg fires `progress: 100` before the `end` event) → `ApiService.downloadExport()` → trigger download

### Critical Implementation Notes

- **`WaveformCanvasComponent` requires `:host { display: block; }`** — without it the host is an inline element, `offsetWidth` returns 0, and the canvas always renders at the 200px fallback. The canvas uses `offsetWidth`/`offsetHeight` (not `parentElement.clientWidth`) and a `ResizeObserver` to re-draw whenever the clip block resizes.

- **`StorageService` re-registers files on startup** — the in-memory registry is populated from the session directory at init. If adding new DSP ops that create files, register them with `storageService.registerFile(newId, outputPath, name)` immediately after creation so they survive backend restarts.

- **SSE export resolution** — `waitForProgress()` resolves only on `status === 'done'`, never on `progress >= 100` alone. FFmpeg emits a final progress event at 100% *before* the `end` event fires; resolving on progress alone causes the download to arrive before the job is finalised (404 "Export not ready").

- **`effect()` calls must be in injection context** — use field initializers (`private readonly x = effect(...)`) not `ngOnInit`. The `autoScrollEffect` in `TimelineComponent` is a field initializer for this reason.

## Testing

**Backend** uses Jest (`jest.config.ts`): 100% lines/functions/statements, 95% branches globally; `src/server.ts` is excluded from coverage. Run with `npm test` from `backend/`.

**Frontend** uses Vitest (via `@angular/build:unit-test`): thresholds 98% statements, 96% branches, 95% functions, 99% lines.

Key testing patterns:
- Components that use `ResizeObserver` (e.g. `TimelineComponent`, `WaveformCanvasComponent`) need `vi.stubGlobal('ResizeObserver', ...)` in `beforeEach` and `vi.unstubAllGlobals()` in `afterEach`.
- Components that render `TimelineComponent` as a child (e.g. `EditorComponent`) also need the `ResizeObserver` stub.
- Tests that use `window.confirm` need `vi.spyOn(window, 'confirm').mockReturnValue(true/false)`.
- A standalone `describe` block that calls `TestBed.configureTestingModule` inside an `it()` must call `TestBed.resetTestingModule()` first, because the previous suite's `beforeEach` leaves TestBed configured.
