import {
  AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit,
  ViewChild, computed, effect, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ProjectService } from '../../../core/services/project.service';
import { EditActionsService } from '../../../core/services/edit-actions.service';
import { FileService } from '../../../core/services/file.service';
import { TimelineRulerComponent } from './timeline-ruler.component';
import { WaveformCanvasComponent } from '../waveform/waveform-canvas.component';
import { TrackHeaderComponent } from '../track-header/track-header.component';
import { ContextMenuComponent, type ContextMenuItem } from '../context-menu/context-menu.component';
import type { Clip } from '../../../core/models/project.model';

interface ClipDragState {
  clipId: string;
  sourceTrackId: string;
  duration: number;
  grabOffsetTime: number;
  previewStartTime: number;
  previewTrackId: string;
  snapIndicatorX: number | null;
  displacedClips: { id: string; newStart: number }[];
}

const SNAP_PX = 12;

export const TRACK_COLORS = [
  '#1a73e8', '#e8710a', '#0f9d58', '#d93025', '#9334e6', '#00796b',
  '#f57c00', '#0277bd', '#558b2f', '#6a1b9a',
];

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, MatIconModule, TimelineRulerComponent, WaveformCanvasComponent, TrackHeaderComponent, ContextMenuComponent],
  template: `
    <!-- ruler lives outside the scroll container so it never moves with content -->
    <div class="ruler-row">
      <div class="header-spacer" #headerSpacer></div>
      <div class="ruler-wrap">
        <app-timeline-ruler
          [zoom]="project.state().zoom"
          [scrollLeft]="scrollLeft()"
          [totalDuration]="project.totalDuration()"
        />
      </div>
    </div>

    <div class="timeline-root" #container
      [class.alt-active]="altKeyDown()"
      (scroll)="onScroll($event)"
      (mousedown)="onMouseDown($event)"
      (mousemove)="onMouseMove($event)"
      (mouseup)="onMouseUp($event)"
      (mouseleave)="onMouseUp($event)"
      (contextmenu)="onContextMenu($event)"
      (dragover)="$event.preventDefault()"
      (drop)="onDrop($event)"
    >

      <!-- track rows -->
      @for (track of project.state().tracks; track track.id; let i = $index) {
        <div class="track-row" [style.min-width.px]="headerWidth() + timelineWidth()">

          <!-- sticky track header -->
          <div class="track-header-wrap">
            <app-track-header
              [track]="track"
              [color]="trackColor(i)"
              [trackIndex]="i"
              (amplitudeScaleChange)="setAmplitudeScale(track.id, $event)"
              (headerContextMenu)="onTrackHeaderContextMenu($event, track.id)"
            />
          </div>

          <!-- clips area -->
          <div class="clips-area" [style.min-width.px]="timelineWidth()">

            @if (!track.clips.length) {
              <div class="empty-hint">Drop audio here</div>
            }

            @for (clip of track.clips; track clip.id) {
              <div class="clip-block"
                [class.selected]="isSelected(clip)"
                [class.is-dragging]="clipDrag?.clipId === clip.id"
                [class.is-displaced]="isDisplaced(clip.id)"
                [style.left.px]="getClipDisplayStart(clip, track.id) * project.state().zoom"
                [style.width.px]="clip.duration * project.state().zoom"
                [style.--track-color]="trackColor(i)"
              >
                <app-waveform-canvas
                  [peaks]="clip.peakData"
                  [loading]="clip.isLoading"
                  [color]="trackColor(i)"
                  [amplitudeScale]="getAmplitudeScale(track.id)"
                />
                <div class="clip-label">{{ clipLabel(clip) }}</div>
                <button class="clip-delete-btn" (click)="deleteClip($event, clip.id)" title="Delete clip">×</button>
                @if (altKeyDown()) {
                  <div class="alt-drag-hint"><mat-icon>open_with</mat-icon></div>
                }
              </div>
            }

            <!-- clip drag ghost -->
            @if (clipDrag && clipDrag.previewTrackId === track.id) {
              <div class="clip-drag-ghost"
                [style.left.px]="clipDrag.previewStartTime * project.state().zoom"
                [style.width.px]="clipDrag.duration * project.state().zoom"
                [style.--track-color]="trackColor(i)"
              ></div>
              @if (clipDrag.snapIndicatorX !== null) {
                <div class="snap-indicator" [style.left.px]="clipDrag.snapIndicatorX"></div>
              }
            }

            <!-- selection overlay -->
            @if (selectionOverlay?.trackId === track.id) {
              <div class="selection-overlay"
                [style.left.px]="selectionOverlay!.x"
                [style.width.px]="selectionOverlay!.w"
              >
                <div class="sel-handle sel-handle-left" (mousedown)="startHandleDrag($event, 'start')"></div>
                <div class="sel-handle sel-handle-right" (mousedown)="startHandleDrag($event, 'end')"></div>
                @if (selectionDuration > 0) {
                  <span class="selection-label">{{ selectionDuration.toFixed(2) }}s</span>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- empty full-page hint if no tracks have clips -->
      @if (allEmpty()) {
        <div class="full-empty">
          <mat-icon style="font-size:48px;width:48px;height:48px;color:#555">music_note</mat-icon>
          <p>Drag &amp; drop audio files here or click <strong>Import</strong></p>
        </div>
      }

      <!-- playhead line -->
      <div class="playhead" [style.left.px]="headerWidth() + playheadPx()"></div>
    </div>

    <!-- custom horizontal scrollbar (outside the scroll container so it never affects layout) -->
    <div class="h-scrollbar" (mousedown)="onHScrollTrackClick($event)">
      <div class="h-scrollbar-thumb"
        [style.width.px]="hScrollThumbWidth()"
        [style.left.px]="hScrollThumbLeft()"
        (mousedown)="onHScrollThumbMousedown($event)"
      ></div>
    </div>

    <!-- context menu -->
    @if (contextMenuVisible) {
      <app-context-menu
        [items]="contextMenuItems"
        [position]="contextMenuPosition"
        (closed)="contextMenuVisible = false"
      />
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      position: relative;
    }

    .timeline-root {
      flex: 1;
      min-height: 0;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow-x: scroll;
      overflow-y: auto;
      background: var(--editor-bg);
      cursor: default;
      user-select: none;
      /* hide native horizontal scrollbar (replaced by custom); show styled vertical */
      &::-webkit-scrollbar { width: 6px; height: 0; }
      &::-webkit-scrollbar-thumb { background: #3a4055; border-radius: 3px; }
      &::-webkit-scrollbar-thumb:hover { background: #4a5068; }
      scrollbar-color: #3a4055 transparent;
      scrollbar-width: thin;
    }

    /* ── ruler ── */
    .ruler-row {
      display: flex;
      flex-shrink: 0;
      background: var(--panel-bg);
      border-bottom: 1px solid var(--border);
      z-index: 20;
    }
    .header-spacer {
      width: clamp(140px, 13vw, 220px);
      min-width: clamp(140px, 13vw, 220px);
      flex-shrink: 0;
      background: var(--panel-bg);
    }
    .ruler-wrap { flex: 1; overflow: hidden; }

    /* ── track rows ── */
    .track-row {
      display: flex;
      flex: 1;
      min-height: 12%;
      border-bottom: 1px solid var(--border);
      &:hover .clips-area { background: rgba(255,255,255,0.01); }
    }

    .track-header-wrap {
      width: clamp(140px, 13vw, 220px);
      min-width: clamp(140px, 13vw, 220px);
      flex-shrink: 0;
      position: sticky;
      left: 0;
      z-index: 10;
      background: var(--panel-bg);
      border-right: 1px solid var(--border);
    }

    /* ── clips ── */
    .clips-area {
      position: relative;
      flex: 1;
      overflow: visible;
    }

    .empty-hint {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 11px;
      color: #3a4055;
      pointer-events: none;
      white-space: nowrap;
    }

    .clip-block {
      position: absolute;
      top: 4px;
      height: calc(100% - 8px);
      background: rgba(26, 115, 232, 0.15);
      border: 1px solid var(--track-color, #1a73e8);
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      /* box-shadow hover instead of border-width change — avoids layout reflow */
      transition: box-shadow 0.1s;

      &:hover { box-shadow: 0 0 0 1px var(--track-color, #1a73e8); }
      &.selected {
        border-color: #ff9800;
        box-shadow: 0 0 0 1px rgba(255,152,0,0.4);
      }
      &.is-dragging { opacity: 0.35; }
      &.is-displaced { opacity: 0.55; outline: 1px dashed var(--track-color, #1a73e8); }
    }

    /* Alt-hold cursor & move hint */
    .alt-active .clip-block { cursor: grab; }
    .alt-active .clip-block:active { cursor: grabbing; }

    .alt-drag-hint {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.45);
      border-radius: 50%;
      width: 26px;
      height: 26px;
      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: rgba(255,255,255,0.9);
      }
    }

    /* Drag ghost (target position preview) */
    .clip-drag-ghost {
      position: absolute;
      top: 4px;
      height: calc(100% - 8px);
      border: 2px dashed var(--track-color, #1a73e8);
      border-radius: 4px;
      background: rgba(26, 115, 232, 0.18);
      pointer-events: none;
      z-index: 15;
    }

    /* Snap indicator — vertical line at snap target */
    .snap-indicator {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--accent);
      pointer-events: none;
      z-index: 20;
      &::before {
        content: '';
        position: absolute;
        top: -5px;
        left: -4px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--accent);
      }
    }

    .clip-label {
      position: absolute;
      top: 2px;
      left: 5px;
      font-size: 10px;
      color: rgba(255,255,255,0.6);
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      max-width: calc(100% - 24px);
    }

    .clip-delete-btn {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 16px;
      height: 16px;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: rgba(0,0,0,0.4);
      color: rgba(255,255,255,0.7);
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 5;
      &:hover { background: rgba(244,67,54,0.8); color: #fff; }
    }
    .clip-block:hover .clip-delete-btn { opacity: 1; }

    .selection-overlay {
      position: absolute;
      top: 0;
      height: 100%;
      background: var(--selection);
      border: 1px solid #ff9800;
      border-radius: 2px;
      pointer-events: none;
    }

    .sel-handle {
      position: absolute;
      top: 0;
      height: 100%;
      width: 10px;
      cursor: ew-resize;
      pointer-events: auto;
      z-index: 2;
      &:hover { background: rgba(255,152,0,0.35); }
    }
    .sel-handle-left { left: 0; }
    .sel-handle-right { right: 0; }

    .selection-label {
      position: absolute;
      bottom: 3px;
      left: 14px;
      font-size: 10px;
      color: #ff9800;
      white-space: nowrap;
    }

    /* ── full empty state ── */
    .full-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 14px;
      p { margin: 0; }
      strong { color: var(--accent); }
    }

    /* ── playhead ── */
    .playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--playhead);
      pointer-events: none;
      z-index: 30;
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: -4px;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 8px solid var(--playhead);
      }
    }

    /* ── custom horizontal scrollbar ── */
    .h-scrollbar {
      flex-shrink: 0;
      height: clamp(12px, 1.8vh, 20px);
      background: var(--panel-bg);
      border-top: 1px solid var(--border);
      position: relative;
      cursor: pointer;
      user-select: none;
    }

    .h-scrollbar-thumb {
      position: absolute;
      top: 3px;
      bottom: 3px;
      min-width: 30px;
      border-radius: 4px;
      background: rgba(255,255,255,0.28);
      cursor: grab;
      transition: background 0.1s;
      &:hover { background: rgba(255,255,255,0.44); }
      &:active { cursor: grabbing; background: rgba(255,255,255,0.60); }
    }
  `],
})
export class TimelineComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('headerSpacer') headerSpacerRef!: ElementRef<HTMLDivElement>;

  readonly project = inject(ProjectService);
  private editActions = inject(EditActionsService);
  private fileService = inject(FileService);

  readonly scrollLeft = signal(0);
  readonly headerWidth = signal(168);
  readonly altKeyDown = signal(false);
  selectionOverlay: { trackId: string; x: number; w: number } | null = null;
  clipDrag: ClipDragState | null = null;

  contextMenuVisible = false;
  contextMenuPosition = { x: 0, y: 0 };
  contextMenuItems: ContextMenuItem[] = [];

  amplitudeScales: Record<string, number> = {};

  // Viewport width fed by ResizeObserver — drives the scrollbar computeds.
  readonly viewportWidth = signal(0);
  private resizeObserver?: ResizeObserver;

  readonly hScrollThumbWidth = computed(() => {
    const viewW = this.viewportWidth();
    const contentW = this.headerWidth() + this.timelineWidth();
    if (viewW <= 0 || contentW <= viewW) return Math.max(viewW, 0);
    return Math.max(30, viewW * viewW / contentW);
  });

  readonly hScrollThumbLeft = computed(() => {
    const viewW = this.viewportWidth();
    const contentW = this.headerWidth() + this.timelineWidth();
    if (viewW <= 0 || contentW <= viewW) return 0;
    const thumbW = this.hScrollThumbWidth();
    const maxScroll = contentW - viewW;
    return Math.max(0, Math.min((this.scrollLeft() / maxScroll) * (viewW - thumbW), viewW - thumbW));
  });

  private hThumbDragStartX = 0;
  private hThumbDragStartScroll = 0;
  private readonly hThumbOnMove = (e: MouseEvent) => this.onHThumbMove(e);
  private readonly hThumbOnUp = () => this.onHThumbUp();

  private selectStart: { x: number; trackId: string; timeStart: number } | null = null;
  private handleDragSide: 'start' | 'end' | null = null;
  private rafId: number | null = null;

  private readonly autoScrollEffect = effect(() => {
    if (!this.project.state().isPlaying) return;
    const container = this.containerRef?.nativeElement;
    if (!container) return;
    const playheadAbs = this.project.state().playheadPosition * this.project.state().zoom;
    const viewWidth = container.clientWidth - this.headerWidth();
    const sl = container.scrollLeft;
    if (playheadAbs - sl > viewWidth - 80) {
      container.scrollLeft = playheadAbs - viewWidth * 0.3;
      this.scrollLeft.set(container.scrollLeft);
    }
  });

  readonly timelineWidth = computed(() =>
    Math.max(this.project.totalDuration() * this.project.state().zoom + 400, 1200)
  );

  // Content-coordinate position of the playhead (no scroll subtraction — the
  // container's own scroll already shifts absolute children in the viewport).
  readonly playheadPx = computed(() =>
    this.project.state().playheadPosition * this.project.state().zoom
  );

  readonly allEmpty = computed(() =>
    this.project.state().tracks.every(t => t.clips.length === 0)
  );

  get selectionDuration(): number {
    if (!this.selectionOverlay) return 0;
    return this.selectionOverlay.w / this.project.state().zoom;
  }

  trackColor(index: number): string {
    return TRACK_COLORS[index % TRACK_COLORS.length];
  }

  getAmplitudeScale(trackId: string): number {
    return this.amplitudeScales[trackId] ?? 1;
  }

  setAmplitudeScale(trackId: string, scale: number): void {
    this.amplitudeScales = { ...this.amplitudeScales, [trackId]: scale };
  }

  ngOnInit(): void {
    this.rafId = requestAnimationFrame(this.noop.bind(this));
  }

  ngAfterViewInit(): void {
    const container = this.containerRef.nativeElement;
    const spacer = this.headerSpacerRef.nativeElement;
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === container) this.viewportWidth.set(container.clientWidth);
        if (entry.target === spacer) this.headerWidth.set(spacer.offsetWidth);
      }
    });
    this.resizeObserver.observe(container);
    this.resizeObserver.observe(spacer);
    // Microtask defers past dev-mode double-check so setting signals
    // on the first frame doesn't trigger NG0100.
    Promise.resolve().then(() => {
      this.viewportWidth.set(container.clientWidth);
      this.headerWidth.set(spacer.offsetWidth);
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    window.removeEventListener('mousemove', this.hThumbOnMove);
    window.removeEventListener('mouseup', this.hThumbOnUp);
  }

  onScroll(e: Event): void {
    this.scrollLeft.set((e.target as HTMLElement).scrollLeft);
  }

  onHScrollTrackClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('h-scrollbar-thumb')) return;
    const container = this.containerRef?.nativeElement;
    if (!container) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const viewW = this.viewportWidth();
    const contentW = this.headerWidth() + this.timelineWidth();
    const thumbW = this.hScrollThumbWidth();
    const trackW = viewW - thumbW;
    if (trackW <= 0) return;
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (clickX - thumbW / 2) / trackW));
    container.scrollLeft = ratio * (contentW - viewW);
    this.scrollLeft.set(container.scrollLeft);
  }

  onHScrollThumbMousedown(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.hThumbDragStartX = e.clientX;
    this.hThumbDragStartScroll = this.scrollLeft();
    window.addEventListener('mousemove', this.hThumbOnMove);
    window.addEventListener('mouseup', this.hThumbOnUp);
  }

  private onHThumbMove(e: MouseEvent): void {
    const container = this.containerRef?.nativeElement;
    if (!container) return;
    const viewW = this.viewportWidth();
    const contentW = this.headerWidth() + this.timelineWidth();
    const thumbW = this.hScrollThumbWidth();
    const trackW = viewW - thumbW;
    if (trackW <= 0) return;
    const dx = e.clientX - this.hThumbDragStartX;
    const maxScroll = contentW - viewW;
    const newScroll = this.hThumbDragStartScroll + (dx / trackW) * maxScroll;
    container.scrollLeft = Math.max(0, Math.min(newScroll, maxScroll));
    this.scrollLeft.set(container.scrollLeft);
  }

  private onHThumbUp(): void {
    window.removeEventListener('mousemove', this.hThumbOnMove);
    window.removeEventListener('mouseup', this.hThumbOnUp);
  }

  onMouseDown(e: MouseEvent): void {
    if (e.altKey) {
      const { trackId, time } = this.hitTest(e);
      if (trackId) {
        const clipId = this.clipAt(trackId, time);
        if (clipId) {
          const clip = this.project.getClipById(clipId);
          if (clip) {
            this.clipDrag = {
              clipId,
              sourceTrackId: trackId,
              duration: clip.duration,
              grabOffsetTime: time - clip.startTime,
              previewStartTime: clip.startTime,
              previewTrackId: trackId,
              snapIndicatorX: null,
              displacedClips: [],
            };
            e.preventDefault();
          }
        }
      }
      return;
    }

    const { trackId, time } = this.hitTest(e);
    if (!trackId) return;

    this.project.setPlayhead(time);

    const clipId = this.clipAt(trackId, time);
    if (clipId) {
      const sel = this.project.state().selection;
      if (sel && !(sel.clipId === clipId && time >= sel.start && time <= sel.end)) {
        this.project.setSelection(null);
        this.selectionOverlay = null;
      }
      this.selectStart = { x: time * this.project.state().zoom, trackId, timeStart: time };
    } else {
      this.project.setSelection(null);
      this.selectionOverlay = null;
    }
  }

  onMouseMove(e: MouseEvent): void {
    if (!(e.buttons & 1)) {
      this.handleDragSide = null;
      return;
    }

    if (this.clipDrag) {
      const { trackId, time } = this.hitTest(e);
      const targetTrackId = trackId ?? this.clipDrag.previewTrackId;
      let newStart = Math.max(0, time - this.clipDrag.grabOffsetTime);
      let snappedTo: number | null = null;
      if (this.project.snapEnabled()) {
        snappedTo = this.findSnapTarget(this.clipDrag.clipId, newStart, this.clipDrag.duration);
        if (snappedTo !== null) newStart = snappedTo;
      }
      const { resolvedStart, displaced } = this.resolveWithRipple(
        this.clipDrag.clipId, targetTrackId, newStart, this.clipDrag.duration,
      );
      const snapIndicatorX = snappedTo !== null && resolvedStart === snappedTo
        ? resolvedStart * this.project.state().zoom
        : null;
      this.clipDrag = {
        ...this.clipDrag,
        previewStartTime: resolvedStart,
        previewTrackId: targetTrackId,
        snapIndicatorX,
        displacedClips: displaced,
      };
      return;
    }

    const { time } = this.hitTest(e);

    if (this.handleDragSide) {
      // Handle-resize drag: update selection boundaries only (playhead does not follow)
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

    if (this.selectStart) {
      // Selection drag: update overlay only — no setPlayhead to avoid signal churn on every mousemove
      const zoom = this.project.state().zoom;
      const x0 = this.selectStart.timeStart * zoom;
      const x1 = time * zoom;
      this.selectionOverlay = {
        trackId: this.selectStart.trackId,
        x: Math.min(x0, x1),
        w: Math.abs(x1 - x0),
      };
      return;
    }

    // Free drag on empty area: navigator follows the mouse
    this.project.setPlayhead(time);
  }

  onMouseUp(e: MouseEvent): void {
    this.handleDragSide = null;

    if (this.clipDrag) {
      const { clipId, previewTrackId, previewStartTime, duration } = this.clipDrag;
      this.clipDrag = null;
      const { resolvedStart, displaced } = this.resolveWithRipple(
        clipId, previewTrackId, previewStartTime, duration,
      );
      this.project.batchMove(
        { clipId, newTrackId: previewTrackId, newStartTime: resolvedStart },
        displaced.map(d => ({ clipId: d.id, newStartTime: d.newStart })),
      );
      return;
    }

    if (this.selectStart) {
      const { time } = this.hitTest(e);
      if (Math.abs(time - this.selectStart.timeStart) > 0.05) {
        const clipId = this.clipAt(this.selectStart.trackId, this.selectStart.timeStart)
          ?? this.clipAt(this.selectStart.trackId, time);
        if (clipId) {
          const start = Math.min(this.selectStart.timeStart, time);
          const end = Math.max(this.selectStart.timeStart, time);
          this.project.setSelection({ clipId, start, end });
        }
      }
      this.selectStart = null;
    }
  }

  startHandleDrag(e: MouseEvent, side: 'start' | 'end'): void {
    e.stopPropagation();
    this.handleDragSide = side;
  }

  onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const { trackId, time } = this.hitTest(e);
    this.contextMenuItems = this.buildMenuItems(trackId, time);
    if (this.contextMenuItems.length === 0) return;
    this.contextMenuPosition = { x: e.clientX, y: e.clientY };
    this.contextMenuVisible = true;
  }

  onTrackHeaderContextMenu(e: MouseEvent, trackId: string): void {
    this.contextMenuItems = this.buildTrackHeaderMenu(trackId);
    this.contextMenuPosition = { x: e.clientX, y: e.clientY };
    this.contextMenuVisible = true;
  }

  async onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    const event = new CustomEvent('ve-drop', { detail: { files }, bubbles: true });
    (e.target as HTMLElement).dispatchEvent(event);
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Alt') {
      e.preventDefault(); // belt-and-suspenders: stops Firefox menu on keyup too
      this.altKeyDown.set(false);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Alt') {
      e.preventDefault(); // tell the browser Alt is consumed → suppresses menu bar in Firefox/Edge
      this.altKeyDown.set(true);
      return;
    }
    if ((e.target as HTMLElement)?.closest('input, textarea')) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      this.project.undo();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      if (this.project.state().selection) {
        e.preventDefault();
        void this.editActions.cutSelection();
        this.selectionOverlay = null;
      }
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = this.project.state().selection;
      if (sel) {
        e.preventDefault();
        void this.editActions.cutSelection();
        this.selectionOverlay = null;
      }
      return;
    }

    const step = 0.1;

    if (e.key === 'ArrowLeft' && !e.shiftKey) {
      e.preventDefault();
      this.project.setPlayhead(this.project.state().playheadPosition - step);
      return;
    }

    if (e.key === 'ArrowRight' && !e.shiftKey) {
      e.preventDefault();
      this.project.setPlayhead(this.project.state().playheadPosition + step);
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      this.project.setPlayhead(0);
      return;
    }

    if (e.key === 'ArrowLeft' && e.shiftKey) {
      e.preventDefault();
      const sel = this.project.state().selection;
      if (sel) {
        const newStart = Math.max(0, sel.start - step);
        this.project.setSelection({ ...sel, start: newStart });
        if (this.selectionOverlay) {
          const zoom = this.project.state().zoom;
          this.selectionOverlay = { ...this.selectionOverlay, x: newStart * zoom, w: (sel.end - newStart) * zoom };
        }
      }
      return;
    }

    if (e.key === 'ArrowRight' && e.shiftKey) {
      e.preventDefault();
      const sel = this.project.state().selection;
      if (sel) {
        const newEnd = sel.end + step;
        this.project.setSelection({ ...sel, end: newEnd });
        if (this.selectionOverlay) {
          const zoom = this.project.state().zoom;
          this.selectionOverlay = { ...this.selectionOverlay, w: (newEnd - sel.start) * zoom };
        }
      }
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
    }
  }

  deleteClip(e: MouseEvent, clipId: string): void {
    e.stopPropagation();
    this.project.removeClip(clipId);
    if (this.project.state().selection?.clipId === clipId) {
      this.project.setSelection(null);
      this.selectionOverlay = null;
    }
  }

  isSelected(clip: Clip): boolean {
    return this.project.state().selection?.clipId === clip.id;
  }

  clipLabel(clip: Clip): string {
    return clip.name ? `${clip.name}  ${clip.duration.toFixed(1)}s` : `${clip.duration.toFixed(1)}s`;
  }

  getClipDisplayStart(clip: Clip, trackId: string): number {
    if (!this.clipDrag || this.clipDrag.previewTrackId !== trackId) return clip.startTime;
    const d = this.clipDrag.displacedClips.find(dc => dc.id === clip.id);
    return d ? d.newStart : clip.startTime;
  }

  isDisplaced(clipId: string): boolean {
    return this.clipDrag?.displacedClips.some(d => d.id === clipId) ?? false;
  }

  private buildMenuItems(trackId: string | null, time: number): ContextMenuItem[] {
    const sel = this.project.state().selection;

    if (sel && this.selectionOverlay?.trackId === trackId && time >= sel.start && time <= sel.end) {
      return [
        { label: 'Delete region', icon: 'content_cut', shortcut: 'Ctrl+X', action: () => { void this.editActions.cutSelection(); this.selectionOverlay = null; } },
        { separator: true, label: '', action: () => {} },
        { label: 'Split at boundaries', icon: 'call_split', action: () => {} },
      ];
    }

    const clipId = trackId ? this.clipAt(trackId, time) : null;
    if (clipId) {
      return [
        { label: 'Split at playhead', icon: 'call_split', shortcut: 'S', disabled: true, action: () => {} },
        { label: 'Delete clip', icon: 'delete', action: () => { this.project.removeClip(clipId); this.project.setSelection(null); this.selectionOverlay = null; } },
        { separator: true, label: '', action: () => {} },
        { label: 'Fade in / out', icon: 'gradient', action: () => {} },
      ];
    }

    if (trackId) {
      return [
        {
          label: 'Import audio here', icon: 'upload_file', action: () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.mp3,.wav,.aac,.flac,.ogg,.m4a,.mp4,.webm';
            input.onchange = (ev) => {
              const file = (ev.target as HTMLInputElement).files?.[0];
              if (file && trackId) void this.fileService.importFile(file, trackId);
            };
            input.click();
          },
        },
      ];
    }

    return [];
  }

  private buildTrackHeaderMenu(trackId: string): ContextMenuItem[] {
    return [
      { label: 'Rename track', icon: 'edit', disabled: true, action: () => {} },
      { label: 'Duplicate track', icon: 'content_copy', disabled: true, action: () => {} },
      { separator: true, label: '', action: () => {} },
      { label: 'Delete track', icon: 'delete', action: () => { this.project.removeTrack(trackId); } },
    ];
  }

  private hitTest(e: MouseEvent): { trackId: string | null; time: number } {
    const container = this.containerRef?.nativeElement;
    if (!container) return { trackId: null, time: 0 };
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + this.scrollLeft() - this.headerWidth();
    const y = e.clientY - rect.top + container.scrollTop;
    const time = Math.max(0, x / this.project.state().zoom);
    const trackIndex = Math.floor(y / this.getTrackHeight());
    const tracks = this.project.state().tracks;
    if (trackIndex < 0 || trackIndex >= tracks.length) return { trackId: null, time };
    return { trackId: tracks[trackIndex].id, time };
  }

  private getTrackHeight(): number {
    const row = this.containerRef.nativeElement.querySelector<HTMLElement>(':scope > .track-row');
    return row ? row.getBoundingClientRect().height : 120;
  }

  findSnapTarget(draggingClipId: string, startTime: number, duration: number): number | null {
    const snapThreshold = SNAP_PX / this.project.state().zoom;
    let bestDelta = snapThreshold;
    let snapTo: number | null = null;

    const check = (candidate: number) => {
      const d = Math.abs(startTime - candidate);
      if (d < bestDelta) { bestDelta = d; snapTo = candidate; }
    };
    const checkEnd = (candidate: number) => {
      const d = Math.abs((startTime + duration) - candidate);
      if (d < bestDelta) { bestDelta = d; snapTo = candidate - duration; }
    };

    // Snap to timeline start
    check(0);

    for (const track of this.project.state().tracks) {
      for (const clip of track.clips) {
        if (clip.id === draggingClipId) continue;
        const clipEnd = clip.startTime + clip.duration;
        check(clip.startTime);
        check(clipEnd);
        checkEnd(clip.startTime);
        checkEnd(clipEnd);
      }
    }

    return snapTo !== null ? Math.max(0, snapTo) : null;
  }

  private resolveWithRipple(
    excludeId: string,
    targetTrackId: string,
    desiredStart: number,
    duration: number,
  ): { resolvedStart: number; displaced: { id: string; newStart: number }[] } {
    const track = this.project.state().tracks.find(t => t.id === targetTrackId);
    if (!track) return { resolvedStart: desiredStart, displaced: [] };

    const others = track.clips
      .filter(c => c.id !== excludeId)
      .map(c => ({ id: c.id, start: c.startTime, dur: c.duration }))
      .sort((a, b) => a.start - b.start);

    // Left-side blockers: clips that start before desiredStart but extend into it.
    // We can't push them left reliably, so we push the dragged clip past them instead.
    let resolvedStart = desiredStart;
    for (const c of others) {
      if (c.start < resolvedStart && c.start + c.dur > resolvedStart) {
        resolvedStart = c.start + c.dur;
      }
    }

    // Right-side clips: clips whose start falls within [resolvedStart, resolvedStart+duration).
    // Push them right, then cascade so no two displaced clips overlap each other.
    const mutable = others.map(c => ({ id: c.id, start: c.start, dur: c.dur, newStart: c.start }));
    const requiredEnd = resolvedStart + duration;

    for (const c of mutable) {
      if (c.start >= resolvedStart && c.start < requiredEnd) {
        c.newStart = requiredEnd;
      }
    }

    // Cascade rightward to fix any chain of overlaps created by the initial push.
    mutable.sort((a, b) => a.newStart - b.newStart);
    for (let i = 1; i < mutable.length; i++) {
      const prev = mutable[i - 1];
      const curr = mutable[i];
      if (curr.newStart < prev.newStart + prev.dur) {
        curr.newStart = prev.newStart + prev.dur;
      }
    }

    const displaced = mutable
      .filter(c => Math.abs(c.newStart - c.start) > 0.001)
      .map(c => ({ id: c.id, newStart: c.newStart }));

    return { resolvedStart, displaced };
  }

  private clipAt(trackId: string, time: number): string | null {
    const track = this.project.state().tracks.find(t => t.id === trackId);
    return track?.clips.find(c => c.startTime <= time && time < c.startTime + c.duration)?.id ?? null;
  }

  private noop(): void {}
}
