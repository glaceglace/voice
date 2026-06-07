import { Component, EventEmitter, inject, Output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormatTimePipe } from '../../../shared/pipes/format-time.pipe';
import { ProjectService } from '../../../core/services/project.service';
import { RecorderService } from '../../../core/services/recorder.service';
import { PlaybackService } from '../../../core/services/playback.service';
import { EditActionsService } from '../../../core/services/edit-actions.service';
import { FileService } from '../../../core/services/file.service';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [MatTooltipModule, FormatTimePipe],
  template: `
    <div class="toolbar">

      <!-- wordmark -->
      <div class="wordmark">
        <i class="ph-light ph-wave-sine logo-icon"></i>
        <span class="wordmark-text">VOICE</span>
      </div>

      <div class="sep"></div>

      <!-- PHASE 1: CAPTURE — record is the hero action for journalists -->
      @if (recorder.state() === 'recording') {
        <button class="tb-pill rec-active-pill" matTooltip="Stop recording" (click)="stopRecording()">
          <i class="ph-light ph-stop-circle"></i>
          <span>STOP</span>
        </button>
      } @else {
        <button class="tb-pill rec-pill"
          matTooltip="Record from microphone"
          (click)="startRecording()"
          [disabled]="recorder.state() === 'processing' || playback.isPlaying()">
          <i class="ph-light ph-record"></i>
          <span>REC</span>
        </button>
      }

      <div class="sep"></div>

      <!-- PHASE 2: REVIEW — transport for listening back -->
      <div class="btn-group">
        <button class="tb-btn rewind-btn" matTooltip="Rewind to start" (click)="rewind()"
          [disabled]="recorder.state() === 'recording'">
          <i class="ph-light ph-skip-back"></i>
        </button>

        <button class="tb-btn play-btn"
          [matTooltip]="playback.isPlaying() ? 'Pause (Space)' : 'Play (Space)'"
          (click)="togglePlay()"
          [disabled]="recorder.state() === 'recording'">
          <i class="ph-light" [class.ph-pause]="playback.isPlaying()" [class.ph-play]="!playback.isPlaying()"></i>
        </button>

        <button class="tb-btn stop-btn" matTooltip="Stop" (click)="stop()"
          [disabled]="!playback.isPlaying()">
          <i class="ph-light ph-stop"></i>
        </button>
      </div>

      <div class="sep"></div>

      <!-- PHASE 3: EDIT — cut bad takes, undo mistakes -->
      <div class="btn-group">
        <button class="tb-btn cut-btn" matTooltip="Cut selected region (Ctrl+X)"
          (click)="cutSelection()"
          [disabled]="!project.state().selection">
          <i class="ph-light ph-scissors"></i>
        </button>
        <button class="tb-btn undo-btn" matTooltip="Undo (Ctrl+Z)"
          (click)="project.undo()"
          [disabled]="!project.canUndo()">
          <i class="ph-light ph-arrow-counter-clockwise"></i>
        </button>
      </div>

      <div class="sep"></div>

      <!-- project management: add track, new project -->
      <div class="btn-group">
        <button class="tb-btn add-track-btn" matTooltip="Add track" (click)="project.addTrack()">
          <i class="ph-light ph-plus"></i>
        </button>
        <button class="tb-btn danger-btn" matTooltip="New project — discard all changes" (click)="newProject()">
          <i class="ph-light ph-trash"></i>
        </button>
      </div>

      <div class="sep"></div>

      <!-- snap -->
      <button class="tb-btn snap-btn" [class.snap-on]="project.snapEnabled()"
        [matTooltip]="project.snapEnabled() ? 'Snap enabled — click to disable' : 'Snap disabled — click to enable'"
        (click)="project.toggleSnap()">
        <i class="ph-light" [class.ph-magnet]="project.snapEnabled()" [class.ph-magnet-straight]="!project.snapEnabled()"></i>
      </button>

      <div class="sep"></div>

      <!-- zoom -->
      <div class="zoom-group">
        <button class="tb-btn zoom-btn zoom-out-btn" matTooltip="Zoom out" (click)="zoomOut()">
          <i class="ph-light ph-magnifying-glass-minus"></i>
        </button>
        <span class="zoom-val">{{ project.state().zoom }}<small>px/s</small></span>
        <button class="tb-btn zoom-btn zoom-in-btn" matTooltip="Zoom in" (click)="zoomIn()">
          <i class="ph-light ph-magnifying-glass-plus"></i>
        </button>
      </div>

      <div class="spacer"></div>

      <!-- right cluster: status indicators + time + PHASE 4: EXPORT -->
      <div class="status-right">
        @if (recorder.state() === 'recording') {
          <span class="rec-badge">
            <span class="rec-dot"></span>
            <span class="rec-label">REC</span>
          </span>
        }
        @if (recorder.state() === 'processing') {
          <span class="processing">processing…</span>
        }
        <span class="time-display">{{ project.state().playheadPosition | formatTime }}</span>
        <div class="sep"></div>
        <button class="tb-pill export-pill" matTooltip="Export audio" (click)="exportOpen.emit()">
          <i class="ph-light ph-export"></i>
          <span>EXPORT</span>
        </button>
      </div>

    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      align-items: center;
      gap: 1px;
      padding: 0 14px;
      background: var(--panel-bg);
      border-bottom: 1px solid var(--border);
      height: 48px;
      flex-shrink: 0;
    }

    /* ── wordmark ── */
    .wordmark {
      display: flex;
      align-items: center;
      gap: 7px;
      padding-right: 6px;
    }
    .logo-icon {
      font-size: 18px;
      color: var(--accent);
    }
    .wordmark-text {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.16em;
      color: var(--text-secondary);
    }

    /* ── separator ── */
    .sep {
      width: 1px;
      height: 22px;
      background: var(--border);
      flex-shrink: 0;
      margin: 0 6px;
    }

    /* ── button groups ── */
    .btn-group {
      display: flex;
      align-items: center;
      gap: 1px;
    }

    /* ── base icon button ── */
    .tb-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      background: transparent;
      border-radius: 5px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: background 0.1s ease, color 0.1s ease;

      i { font-size: 16px; }

      &:hover:not(:disabled) {
        background: var(--accent-glow);
        color: var(--text-primary);
      }

      &:disabled {
        opacity: 0.28;
        cursor: default;
        pointer-events: none;
      }
    }

    /* ── pill buttons: hero actions ── */
    .tb-pill {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 0 13px;
      height: 30px;
      border-radius: 15px;
      cursor: pointer;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.13em;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      flex-shrink: 0;

      i { font-size: 13px; }

      span { line-height: 1; }

      &:disabled {
        opacity: 0.28;
        cursor: default;
        pointer-events: none;
      }
    }

    /* record pill — red, prominent */
    .rec-pill {
      background: rgba(192, 57, 43, 0.12);
      color: #e25c4c;
      border: 1px solid rgba(231, 76, 60, 0.28);

      &:hover:not(:disabled) {
        background: rgba(231, 76, 60, 0.22);
        border-color: rgba(231, 76, 60, 0.55);
        box-shadow: 0 0 14px rgba(231, 76, 60, 0.18);
        color: #e74c3c;
      }
    }

    /* recording active — pulsing */
    .rec-active-pill {
      background: rgba(231, 76, 60, 0.2);
      color: #e74c3c;
      border: 1px solid rgba(231, 76, 60, 0.45);
      animation: pulse-rec 1.4s ease-in-out infinite;
    }

    /* export pill — amber, matches accent */
    .export-pill {
      background: var(--accent-dim);
      color: var(--accent);
      border: 1px solid rgba(232, 168, 56, 0.28);

      &:hover {
        background: rgba(232, 168, 56, 0.2);
        border-color: rgba(232, 168, 56, 0.55);
        box-shadow: 0 0 14px rgba(232, 168, 56, 0.15);
        color: var(--accent-hover);
      }
    }

    /* ── specific icon button states ── */
    .play-btn:hover:not(:disabled) i { color: #4caf50; }
    .danger-btn:hover:not(:disabled) i { color: var(--warn); }

    .snap-on {
      background: var(--accent-dim);
      i { color: var(--accent); }
      &:hover { background: var(--accent-dim) !important; }
    }

    /* ── zoom ── */
    .zoom-group {
      display: flex;
      align-items: center;
    }
    .zoom-btn { width: 28px; }
    .zoom-val {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      min-width: 54px;
      text-align: center;
      small { font-size: 8px; opacity: 0.55; margin-left: 1px; }
    }

    .spacer { flex: 1; }

    /* ── right status cluster ── */
    .status-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .rec-badge {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .rec-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #e74c3c;
      animation: flash 0.9s ease-in-out infinite;
    }
    .rec-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.1em;
      color: #e74c3c;
    }

    .processing {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 11px;
      color: var(--text-muted);
      font-style: italic;
    }

    /* ── time clock ── */
    .time-display {
      font-family: 'DM Mono', monospace;
      font-size: 20px;
      font-weight: 300;
      color: var(--time-color);
      letter-spacing: 0.02em;
      min-width: 88px;
      text-align: right;
      line-height: 1;
    }

    @keyframes flash {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.15; }
    }

    @keyframes pulse-rec {
      0%, 100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.35); }
      50% { box-shadow: 0 0 0 5px rgba(231, 76, 60, 0); }
    }
  `],
})
export class ToolbarComponent {
  @Output() exportOpen = new EventEmitter<void>();

  readonly project = inject(ProjectService);
  readonly recorder = inject(RecorderService);
  readonly playback = inject(PlaybackService);

  private editActions = inject(EditActionsService);
  private fileService = inject(FileService);

  rewind(): void {
    this.playback.stop();
    this.project.setPlayhead(0);
  }

  togglePlay(): void {
    if (this.playback.isPlaying()) {
      this.playback.stop();
    } else {
      void this.playback.play();
    }
  }

  stop(): void {
    this.playback.stop();
  }

  zoomIn(): void {
    this.project.setZoom(Math.min(500, this.project.state().zoom + 20));
  }

  zoomOut(): void {
    this.project.setZoom(Math.max(20, this.project.state().zoom - 20));
  }

  async startRecording(): Promise<void> {
    const firstTrackId = this.project.state().tracks[0]?.id;
    if (!firstTrackId) return;
    await this.recorder.startRecording();
    this.recorder.recorded$.pipe(take(1)).subscribe(async ({ blob, mimeType }) => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      await this.fileService.importBlob(blob, `recording.${ext}`, firstTrackId);
      this.recorder.onProcessingDone();
    });
  }

  stopRecording(): void {
    this.recorder.stopRecording();
  }

  cutSelection(): Promise<void> {
    return this.editActions.cutSelection();
  }

  newProject(): void {
    if (window.confirm('Discard all work and start a new project?')) {
      this.playback.stop();
      this.project.reset();
    }
  }
}
