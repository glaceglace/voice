# Plan: Wave Graph & Interaction Refactor

## Context

Three UX problems to fix:
1. **Zooming stretches the waveform** — peaks are only fetched once at import time. Zooming in/out never re-fetches, so each peak bar just gets wider/narrower pixels.
2. **Cut merges instead of splits** — selecting a region and pressing Delete/Ctrl+X removes the audio and glues the two remnants into **one** merged clip. The user wants two separate clips with the playhead placed at their junction.
3. **Navigator doesn't follow mouse** — the playhead only moves when clicking on *empty* track area. Clicking or dragging on a clip only creates a selection zone; the playhead stays put. The user wants the playhead to always track the mouse while any mouse button is held.

---

## Change 1 of 3 — Zoom-Reactive Peaks

**File**: `frontend/src/app/core/services/file.service.ts`

### Step 1.1 — Update the import on line 1

Replace:
```typescript
import { Injectable } from '@angular/core';
```
With:
```typescript
import { Injectable, effect } from '@angular/core';
```

### Step 1.2 — Add a `lastTier` field and wire up the effect in the constructor

Replace the entire constructor block (lines 14–18):
```typescript
  constructor(
    private api: ApiService,
    private project: ProjectService,
    private dialog: MatDialog,
  ) {}
```
With:
```typescript
  private lastTier = 0;

  constructor(
    private api: ApiService,
    private project: ProjectService,
    private dialog: MatDialog,
  ) {
    this.lastTier = this.peakResolution(this.project.state().zoom, 0);
    effect(() => {
      const tier = this.peakResolution(this.project.state().zoom, 0);
      if (tier !== this.lastTier) {
        this.lastTier = tier;
        void this.refreshAllPeaks();
      }
    });
  }
```

**How the effect works**: Angular runs this callback once immediately (setting `lastTier` to the initial tier, no-op since it already matches), then re-runs it any time `project.state()` changes. The `tier !== this.lastTier` guard makes sure `refreshAllPeaks()` is only called when zoom crosses a resolution boundary (< 50 → 500 samples, 50–199 → 2000 samples, ≥ 200 → 8000 samples).

### Step 1.3 — Add the `refreshAllPeaks()` private method

Insert this new method immediately **after** the existing `fetchPeaks()` method (after line 71, before `private peakResolution`):

```typescript
  private async refreshAllPeaks(): Promise<void> {
    const zoom = this.project.state().zoom;
    const resolution = this.peakResolution(zoom, 0);
    const clips = this.project.state().tracks.flatMap(t => t.clips);
    await Promise.all(
      clips.map(async (clip) => {
        const data = await firstValueFrom(this.api.getPeaks(clip.sourceFileId, resolution));
        this.project.setClipPeaks(clip.id, data.peaks);
      }),
    );
  }
```

No other changes to `file.service.ts`.

---

## Change 2 of 3 — Cut Produces Two Clips Instead of One Merged Clip

**File**: `frontend/src/app/core/services/edit-actions.service.ts`

### Complete rewrite of the file

Replace the **entire file** with the following. The key logic changes are:
- `hasLeft && hasRight` now creates **two separate Clip objects** placed adjacently (right clip starts at `clip.startTime + left.durationSeconds`, closing the gap), then calls `project.replaceClip(sel.clipId, [leftClip, rightClip])`.
- After any cut, `project.setPlayhead(junctionTime)` is called so the navigator lands at the connection point.
- `computeMerged()` is deleted (replaced by inline logic).
- The `hasLeft`-only and `hasRight`-only cases also position the playhead.

```typescript
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProjectService } from './project.service';
import { ApiService } from './api.service';
import type { Clip } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class EditActionsService {
  private project = inject(ProjectService);
  private api = inject(ApiService);

  async cutSelection(): Promise<void> {
    const sel = this.project.state().selection;
    if (!sel) return;
    const clip = this.project.getClipById(sel.clipId);
    if (!clip) return;

    // Convert timeline selection times to offsets within the source file
    const fileStart = sel.start - clip.startTime + clip.sourceOffset;
    const fileEnd   = sel.end   - clip.startTime + clip.sourceOffset;
    const clipEnd   = clip.sourceOffset + clip.duration;

    const hasLeft  = fileStart > clip.sourceOffset + 0.001;
    const hasRight = fileEnd   < clipEnd            - 0.001;

    // Case A: entire clip is selected — just remove it
    if (!hasLeft && !hasRight) {
      this.project.removeClip(sel.clipId);
      this.project.setSelection(null);
      this.project.setPlayhead(sel.start);
      return;
    }

    // Case B: both sides remain — split into two clips
    if (hasLeft && hasRight) {
      const [left, right] = await Promise.all([
        firstValueFrom(this.api.cut(clip.sourceFileId, clip.sourceOffset, fileStart)),
        firstValueFrom(this.api.cut(clip.sourceFileId, fileEnd, clipEnd)),
      ]);

      const leftClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime,
        duration: left.durationSeconds,
        sourceFileId: left.fileId,
        sourceOffset: 0,
        peakData: null,
        isLoading: true,
      };

      // Right clip starts immediately after the left clip (no gap — ripple delete)
      const rightClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime + left.durationSeconds,
        duration: right.durationSeconds,
        sourceFileId: right.fileId,
        sourceOffset: 0,
        peakData: null,
        isLoading: true,
      };

      this.project.replaceClip(sel.clipId, [leftClip, rightClip]);
      this.project.setSelection(null);
      // Place navigator at the junction between the two clips
      this.project.setPlayhead(rightClip.startTime);

      const [leftPeaks, rightPeaks] = await Promise.all([
        firstValueFrom(this.api.getPeaks(left.fileId, 1000)),
        firstValueFrom(this.api.getPeaks(right.fileId, 1000)),
      ]);
      if (leftPeaks)  this.project.setClipPeaks(leftClip.id,  leftPeaks.peaks);
      if (rightPeaks) this.project.setClipPeaks(rightClip.id, rightPeaks.peaks);
      return;
    }

    // Case C: only left portion remains
    if (hasLeft) {
      const result = await firstValueFrom(
        this.api.cut(clip.sourceFileId, clip.sourceOffset, fileStart),
      );
      const newClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime,
        duration: result.durationSeconds,
        sourceFileId: result.fileId,
        sourceOffset: 0,
        peakData: null,
        isLoading: true,
      };
      this.project.replaceClip(sel.clipId, [newClip]);
      this.project.setSelection(null);
      this.project.setPlayhead(newClip.startTime + newClip.duration);
      const peaks = await firstValueFrom(this.api.getPeaks(result.fileId, 1000));
      if (peaks) this.project.setClipPeaks(newClip.id, peaks.peaks);
      return;
    }

    // Case D: only right portion remains
    const result = await firstValueFrom(
      this.api.cut(clip.sourceFileId, fileEnd, clipEnd),
    );
    const newClip: Clip = {
      id: crypto.randomUUID(),
      trackId: clip.trackId,
      name: clip.name,
      startTime: clip.startTime,
      duration: result.durationSeconds,
      sourceFileId: result.fileId,
      sourceOffset: 0,
      peakData: null,
      isLoading: true,
    };
    this.project.replaceClip(sel.clipId, [newClip]);
    this.project.setSelection(null);
    this.project.setPlayhead(newClip.startTime);
    const peaks = await firstValueFrom(this.api.getPeaks(result.fileId, 1000));
    if (peaks) this.project.setClipPeaks(newClip.id, peaks.peaks);
  }
}
```

---

## Change 3 of 3 — Navigator Always Follows Mouse

**File**: `frontend/src/app/features/editor/timeline/timeline.component.ts`

Only three methods need to change: `onMouseDown`, `onMouseMove`, and `onMouseUp` (lines 376–441). Everything else stays the same.

### Step 3.1 — Replace `onMouseDown` (lines 376–388)

Replace:
```typescript
  onMouseDown(e: MouseEvent): void {
    const { trackId, time } = this.hitTest(e);
    if (!trackId) return;

    const clipId = this.clipAt(trackId, time);
    if (clipId) {
      this.selectStart = { x: time * this.project.state().zoom, trackId, timeStart: time };
    } else {
      this.project.setPlayhead(time);
      this.project.setSelection(null);
      this.selectionOverlay = null;
    }
  }
```
With:
```typescript
  onMouseDown(e: MouseEvent): void {
    const { trackId, time } = this.hitTest(e);
    if (!trackId) return;

    // Navigator always follows the press position
    this.project.setPlayhead(time);

    const clipId = this.clipAt(trackId, time);
    if (clipId) {
      // If there is an active selection and the click is outside it, clear it
      const sel = this.project.state().selection;
      if (sel && !(sel.clipId === clipId && time >= sel.start && time <= sel.end)) {
        this.project.setSelection(null);
        this.selectionOverlay = null;
      }
      // Begin drag-to-select tracking
      this.selectStart = { x: time * this.project.state().zoom, trackId, timeStart: time };
    } else {
      // Click on empty area always clears selection
      this.project.setSelection(null);
      this.selectionOverlay = null;
    }
  }
```

### Step 3.2 — Replace `onMouseMove` (lines 390–424)

Replace:
```typescript
  onMouseMove(e: MouseEvent): void {
    if (!(e.buttons & 1)) {
      this.handleDragSide = null;
      return;
    }

    if (this.handleDragSide) {
      const { time } = this.hitTest(e);
      const sel = this.project.state().selection;
      if (!sel || !this.selectionOverlay) { this.handleDragSide = null; return; }
      const zoom = this.project.state().zoom;

      if (this.handleDragSide === 'start') {
        const newStart = Math.min(time, sel.end - 0.05);
        this.project.setSelection({ ...sel, start: newStart });
        this.selectionOverlay = { ...this.selectionOverlay, x: newStart * zoom, w: (sel.end - newStart) * zoom };
      } else {
        const newEnd = Math.max(time, sel.start + 0.05);
        this.project.setSelection({ ...sel, end: newEnd });
        this.selectionOverlay = { ...this.selectionOverlay, w: (newEnd - sel.start) * zoom };
      }
      return;
    }

    if (!this.selectStart) return;
    const { time } = this.hitTest(e);
    const zoom = this.project.state().zoom;
    const x0 = this.selectStart.timeStart * zoom;
    const x1 = time * zoom;
    this.selectionOverlay = {
      trackId: this.selectStart.trackId,
      x: Math.min(x0, x1),
      w: Math.abs(x1 - x0),
    };
  }
```
With:
```typescript
  onMouseMove(e: MouseEvent): void {
    if (!(e.buttons & 1)) {
      this.handleDragSide = null;
      return;
    }

    if (this.handleDragSide) {
      // Handle-resize drag: update selection boundaries only (playhead does not follow)
      const { time } = this.hitTest(e);
      const sel = this.project.state().selection;
      if (!sel || !this.selectionOverlay) { this.handleDragSide = null; return; }
      const zoom = this.project.state().zoom;

      if (this.handleDragSide === 'start') {
        const newStart = Math.min(time, sel.end - 0.05);
        this.project.setSelection({ ...sel, start: newStart });
        this.selectionOverlay = { ...this.selectionOverlay, x: newStart * zoom, w: (sel.end - newStart) * zoom };
      } else {
        const newEnd = Math.max(time, sel.start + 0.05);
        this.project.setSelection({ ...sel, end: newEnd });
        this.selectionOverlay = { ...this.selectionOverlay, w: (newEnd - sel.start) * zoom };
      }
      return;
    }

    // Normal drag: navigator follows the mouse position
    const { time } = this.hitTest(e);
    this.project.setPlayhead(time);

    if (!this.selectStart) return;
    const zoom = this.project.state().zoom;
    const x0 = this.selectStart.timeStart * zoom;
    const x1 = time * zoom;
    this.selectionOverlay = {
      trackId: this.selectStart.trackId,
      x: Math.min(x0, x1),
      w: Math.abs(x1 - x0),
    };
  }
```

### Step 3.3 — `onMouseUp` (lines 426–441): no change needed

The `onMouseUp` method finalises the `SelectionRange` when the drag exceeds a 0.05 s threshold. It does not need modification.

---

## Files Modified Summary

| File | Lines changed | What changed |
|---|---|---|
| `frontend/src/app/core/services/file.service.ts` | Line 1, lines 14–18, after line 71 | Add `effect` import; add `lastTier` field + effect in constructor; add `refreshAllPeaks()` |
| `frontend/src/app/core/services/edit-actions.service.ts` | Entire file | Replace `cutSelection()` + delete `computeMerged()`; now produces 2 clips and positions playhead |
| `frontend/src/app/features/editor/timeline/timeline.component.ts` | Lines 376–424 | `onMouseDown`: always move playhead, clear selection on miss; `onMouseMove`: playhead follows drag |

No new files. No backend changes. No model/interface changes.

---

## Verification

1. **Zoom-reactive peaks**: Import any audio file. Zoom in past 200 px/s using the toolbar — all clip waveforms should briefly show their loading state, then re-render with finer detail (narrower bars). Zoom back below 50 px/s — waveforms simplify again.
2. **Cut → two clips**: Import a clip. Drag to select a region in the middle of it. Press Delete or Ctrl+X. Confirm: (a) the selected audio is removed, (b) two separate clip blocks appear side by side on the same track, (c) the playhead (orange vertical line) moves to the boundary between them. Press Ctrl+Z — single original clip is restored.
3. **Navigator follows mouse**: Click anywhere on a clip — the playhead moves there immediately. Hold mouse button and drag across a clip — the playhead tracks the cursor in real time. With a selection active, click outside the selection zone — the selection is cleared. Press Play — audio starts from wherever the playhead is.
