import {
  Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, inject
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

const TRACK_HEIGHT = 128;
const HEADER_WIDTH = 168;

export const TRACK_COLORS = [
  '#1a73e8', '#e8710a', '#0f9d58', '#d93025', '#9334e6', '#00796b',
  '#f57c00', '#0277bd', '#558b2f', '#6a1b9a',
];

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [CommonModule, MatIconModule, TimelineRulerComponent, WaveformCanvasComponent, TrackHeaderComponent, ContextMenuComponent],
  template: `
    <div class="timeline-root" #container
      (scroll)="onScroll($event)"
      (mousedown)="onMouseDown($event)"
      (mousemove)="onMouseMove($event)"
      (mouseup)="onMouseUp($event)"
      (mouseleave)="onMouseUp($event)"
      (contextmenu)="onContextMenu($event)"
      (dragover)="$event.preventDefault()"
      (drop)="onDrop($event)"
    >
      <!-- sticky ruler row -->
      <div class="ruler-row" #rulerRow>
        <div class="header-spacer"></div>
        <div class="ruler-wrap">
          <app-timeline-ruler
            [zoom]="project.state().zoom"
            [scrollLeft]="scrollLeft"
            [totalDuration]="project.totalDuration()"
          />
        </div>
      </div>

      <!-- track rows -->
      @for (track of project.state().tracks; track track.id; let i = $index) {
        <div class="track-row" [style.height.px]="TRACK_HEIGHT">

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
                [style.left.px]="clip.startTime * project.state().zoom"
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
              </div>
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
      <div class="playhead" [style.left.px]="HEADER_WIDTH + playheadPx()"></div>
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
    :host { display: block; height: 100%; }

    .timeline-root {
      position: relative;
      overflow: auto;
      background: var(--editor-bg);
      height: 100%;
      cursor: default;
      user-select: none;
    }

    /* ── ruler ── */
    .ruler-row {
      display: flex;
      position: sticky;
      top: 0;
      z-index: 20;
      background: var(--panel-bg);
      border-bottom: 1px solid var(--border);
    }
    .header-spacer {
      width: ${HEADER_WIDTH}px;
      min-width: ${HEADER_WIDTH}px;
      flex-shrink: 0;
    }
    .ruler-wrap { flex: 1; overflow: hidden; }

    /* ── track rows ── */
    .track-row {
      display: flex;
      border-bottom: 1px solid var(--border);
      &:hover .clips-area { background: rgba(255,255,255,0.01); }
    }

    .track-header-wrap {
      width: ${HEADER_WIDTH}px;
      min-width: ${HEADER_WIDTH}px;
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
      transition: border-color 0.1s;

      &:hover { border-width: 2px; }
      &.selected {
        border-color: #ff9800;
        box-shadow: 0 0 0 1px rgba(255,152,0,0.4);
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
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 48px 0;
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
  `],
})
export class TimelineComponent implements OnInit, OnDestroy {
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;

  readonly project = inject(ProjectService);
  private editActions = inject(EditActionsService);
  private fileService = inject(FileService);

  readonly TRACK_HEIGHT = TRACK_HEIGHT;
  readonly HEADER_WIDTH = HEADER_WIDTH;

  scrollLeft = 0;
  selectionOverlay: { trackId: string; x: number; w: number } | null = null;

  contextMenuVisible = false;
  contextMenuPosition = { x: 0, y: 0 };
  contextMenuItems: ContextMenuItem[] = [];

  amplitudeScales: Record<string, number> = {};

  private selectStart: { x: number; trackId: string; timeStart: number } | null = null;
  private handleDragSide: 'start' | 'end' | null = null;
  private rafId: number | null = null;

  readonly timelineWidth = computed(() =>
    Math.max(this.project.totalDuration() * this.project.state().zoom + 400, 1200)
  );

  readonly playheadPx = computed(() =>
    this.project.state().playheadPosition * this.project.state().zoom - this.scrollLeft
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

  ngOnDestroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  onScroll(e: Event): void {
    this.scrollLeft = (e.target as HTMLElement).scrollLeft;
  }

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

  onMouseUp(e: MouseEvent): void {
    this.handleDragSide = null;
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

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
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
    const x = e.clientX - rect.left + this.scrollLeft - HEADER_WIDTH;
    const y = e.clientY - rect.top + container.scrollTop;
    const time = Math.max(0, x / this.project.state().zoom);
    const rulerH = 24;
    const trackIndex = Math.floor((y - rulerH) / TRACK_HEIGHT);
    const tracks = this.project.state().tracks;
    if (trackIndex < 0 || trackIndex >= tracks.length) return { trackId: null, time };
    return { trackId: tracks[trackIndex].id, time };
  }

  private clipAt(trackId: string, time: number): string | null {
    const track = this.project.state().tracks.find(t => t.id === trackId);
    return track?.clips.find(c => c.startTime <= time && time < c.startTime + c.duration)?.id ?? null;
  }

  private noop(): void {}
}
