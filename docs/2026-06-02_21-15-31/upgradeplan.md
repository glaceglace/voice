# Journalist Workflow Improvements

## Context

The primary user is a journalist who records audio news and needs to rapidly remove verbal tics, errors, and bad takes. The current app splits audio on "cut" but never removes the selected region — useless for cleanup. The waveform is small and hard to target precisely, and there is no keyboard path for fast editing. This plan adds a proper ripple-delete workflow, precise selection controls, a taller waveform, keyboard-first navigation, and a right-click context menu.

---

## Feature 1: Ripple Delete ("Delete Selection")

**What**: Select a region → the region is removed and the audio closes the gap. This is the journalist's primary editing action.

**Current behaviour**: `cutSelection()` splits the clip into two, leaving the bad region intact.  
**New behaviour**: The selected region is extracted and discarded; the left and right segments are merged into one clip that replaces the original.

### Implementation

**`toolbar.component.ts:264-311`** — rewrite `cutSelection()`:

```
async cutSelection(): Promise<void>
  sel = project.state().selection
  clip = project.getClipById(sel.clipId)

  fileStart = sel.start - clip.startTime + clip.sourceOffset
  fileEnd   = sel.end   - clip.startTime + clip.sourceOffset

  // Cut left segment (if selection doesn't start at clip start)
  // Cut right segment (if selection doesn't end at clip end)
  // Merge the two segments with api.merge([leftId, rightId], 0)
  // Replace original clip with single merged clip
  // Fetch peaks for merged clip
```

Edge cases: if `fileStart ≤ 0`, skip left cut and merge only the right. If `fileEnd ≥ clip.duration`, merge only the left. If both skip, delete the clip entirely.

**API chain** (already available in `api.service.ts`):
1. `api.cut(fileId, sourceOffset, fileStart)` → `leftFileId`
2. `api.cut(fileId, fileEnd, sourceOffset + duration)` → `rightFileId`
3. `api.merge([leftFileId, rightFileId], 0)` → `mergedFileId`
4. `project.replaceClip(clipId, [mergedClip])`

### Wire up keyboard shortcuts

**`timeline.component.ts:383-403`** (keydown handler):
- `Ctrl/Cmd+X` → call `toolbar.cutSelection()` (tooltip already advertises this but it's not wired)
- `Delete / Backspace` when `selection !== null` → call `toolbar.cutSelection()` instead of `removeClip()`

---

## Feature 2: Precise Selection — Drag Handles

**What**: After making a rough selection, the journalist can drag the left or right edge to fine-tune the boundary (e.g., exactly catch the start of a verbal tic).

### Implementation

**`timeline.component.ts` template** — add two thin absolute-positioned handle elements inside the selection overlay div:

```html
<div class="sel-handle sel-handle-left"  (mousedown)="startHandleDrag($event, 'start')"></div>
<div class="sel-handle sel-handle-right" (mousedown)="startHandleDrag($event, 'end')"></div>
```

- Left handle positioned at `left: 0`, right at `right: 0`
- Width ~10px, full track height, cursor `ew-resize`
- `startHandleDrag(event, side)` sets a drag state flag; `mousemove` updates `selection.start` or `selection.end` accordingly (same pixel-to-time math already in `hitTest()`)
- `mouseup` clears the flag

No new component needed; add to existing `timeline.component.ts`.

---

## Feature 3: Taller / Clearer Waveform

**What**: Increase the default track height so the waveform is easier to read and target.

### Implementation

**`timeline.component.ts:12`** — increase `TRACK_HEIGHT` constant from `88` to `128`.

**`waveform-canvas.component.ts`** — add an `@Input() amplitudeScale = 1.0` input. In `drawWaveform()`, multiply `min`/`max` peak values by `amplitudeScale` before computing canvas coordinates. This lets a future vertical-zoom control amplify quiet recordings visually.

**`track-header.component.ts`** — add a small vertical-scale slider (range 0.5–3×, default 1×) that passes the value to `amplitudeScale` on the waveform canvas. Label: "Gain" with an icon; styled like the existing volume slider.

---

## Feature 4: Keyboard Navigation for Precise Positioning

**What**: Arrow keys move the playhead, so the journalist can locate the exact start/end of a tic without clicking.

### Implementation

**`timeline.component.ts`** keydown handler — add:

| Key | Action |
|-----|--------|
| `ArrowLeft` | Seek playhead −0.1 s |
| `ArrowRight` | Seek playhead +0.1 s |
| `Shift+ArrowLeft` | Extend/shrink selection start by −0.1 s |
| `Shift+ArrowRight` | Extend/shrink selection end by +0.1 s |
| `Home` | Seek to 0 |

Reuse `project.setPlayheadPosition()` and `project.setSelection()` already called elsewhere.

---

## Feature 5: Right-Click Context Menu

**What**: Native browser context menu is suppressed everywhere on the timeline and replaced with a context-aware menu. Items change depending on what was right-clicked — selection, clip, empty track area, or track header.

### Implementation

**New component**: `context-menu.component.ts` (standalone, ~60 lines)
- Takes `@Input() items: ContextMenuItem[]` and `@Input() position: {x,y}`
- Renders a positioned `<ul>` with Material elevation shadow
- Closes on outside click (`@HostListener('document:click')`) or `Escape`
- `ContextMenuItem` type: `{ label, icon?, shortcut?, action: () => void, disabled?: boolean, separator?: boolean }`

**`timeline.component.ts`** — add `(contextmenu)="onContextMenu($event)"` on the `.timeline-root` div. `preventDefault()` to block the browser menu, then call `buildMenu(e)` to determine which items to show.

**`track-header.component.ts`** — add `(contextmenu)="onContextMenu($event)"` emitting an event so the parent can show the track-header menu.

---

### Menu contents by context

**Right-click on the selection overlay** (`selection !== null`):

| Item | Icon | Shortcut | Action |
|------|------|----------|--------|
| Delete region | content_cut | Ctrl+X | `toolbar.cutSelection()` (ripple delete) |
| Loop play | loop | L | loop playback inside selection |
| Export selection | save_alt | — | `api.cut()` + download dialog |
| *(separator)* | | | |
| Split at boundaries | call_split | — | split clip at both selection edges (creates up to 3 clips) |

**Right-click on a clip** (no active selection, or click lands outside it):

| Item | Icon | Shortcut | Action |
|------|------|----------|--------|
| Split at playhead | call_split | S | split clip at current playhead time |
| Delete clip | delete | Del | `project.removeClip()` |
| *(separator)* | | | |
| Auto-trim silence… | auto_fix_high | — | dialog → `api.trim()` |
| Noise gate… | graphic_eq | — | dialog → `api.noiseGate()` |
| Fade in / out | gradient | — | `api.fade(0.1, 0.1)` immediately |
| *(separator)* | | | |
| Rename… | edit | — | inline rename via small input |

**Right-click on empty track area** (no clip under cursor):

| Item | Icon | Action |
|------|------|--------|
| Import audio here | upload_file | open file picker, import at this time position |
| Add marker | bookmark | place a marker at clicked time |

**Right-click on track header**:

| Item | Icon | Action |
|------|------|--------|
| Rename track | edit | focus name input |
| Duplicate track | content_copy | clone track + all its clips |
| Delete track | delete | `project.removeTrack()` |

---

### Context detection logic

Inside `onContextMenu(e: MouseEvent)`:
1. `e.preventDefault()` — suppress browser menu
2. `hitTest(e)` to get `{ trackId, time }`
3. Check if `e.target` is inside `.sel-overlay` → show **selection menu**
4. Else check `clipAt(trackId, time)` → show **clip menu**
5. Else if `trackId` → show **empty-track menu**
6. Track header emits its own event → **track-header menu**

---

## Suggested New Features (for later sprints)

- **Loop selection playback** (`L` key, also in context menu above)
- **Markers**: place/name/jump-between colored markers on the ruler for important timestamps
- **Silence visualization**: shade sub-threshold regions on the waveform to help spot gaps at a glance

---

## Critical Files

| File | Change |
|------|--------|
| `frontend/src/app/features/editor/toolbar/toolbar.component.ts:264` | Rewrite `cutSelection()` → ripple delete |
| `frontend/src/app/features/editor/timeline/timeline.component.ts:12,383` | Track height constant; keyboard shortcuts; selection handle drag; context menu wiring |
| `frontend/src/app/features/editor/waveform/waveform-canvas.component.ts` | Add `amplitudeScale` input |
| `frontend/src/app/features/editor/track-header/track-header.component.ts` | Add amplitude scale slider; emit contextmenu event |
| `frontend/src/app/features/editor/context-menu/context-menu.component.ts` | **New** — positioned context menu, item list driven |

---

## Verification

1. Import a recording with verbal tics.
2. Select a tic region by dragging on the waveform; verify orange overlay appears.
3. Drag left/right handles to fine-tune the boundary.
4. Press `Ctrl+X` or `Delete` — verify the region disappears and audio clips together without a gap.
5. Press `Ctrl+Z` — verify the original clip is restored.
6. Right-click on the selection — verify the context menu appears with "Delete region" at the top.
7. Right-click on a clip (no selection) — verify clip menu with split/delete/noise-gate options.
8. Right-click on a track header — verify rename/duplicate/delete track options.
9. Use `ArrowLeft/Right` to nudge playhead; verify time display updates.
10. Increase the track amplitude slider — verify waveform peaks grow taller without affecting audio.
11. Run the test suite: `cd frontend && npm test`.
