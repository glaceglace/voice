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

      <!-- RECORD — hero action, solid red -->
      @if (recorder.state() === 'recording') {
        <button class="hero-btn stop-rec-btn" matTooltip="Stop recording" (click)="stopRecording()">
          <i class="ph-light ph-stop-circle"></i>
          <span>STOP</span>
        </button>
      } @else {
        <button class="hero-btn rec-btn"
          [matTooltip]="recTooltip()"
          (click)="startRecording()"
          [disabled]="recorder.state() === 'processing' || playback.isPlaying()">
          <i class="ph-light ph-record"></i>
          <span>RECORD</span>
        </button>
      }

      <div class="sep"></div>

      <!-- TRANSPORT -->
      <div class="transport-group">
        <button class="transport-btn rewind-btn" matTooltip="Rewind to start" (click)="rewind()"
          [disabled]="recorder.state() === 'recording'">
          <i class="ph-light ph-skip-back"></i>
          <span class="transport-label">Rewind</span>
        </button>
        <button class="transport-btn play-btn"
          [matTooltip]="playback.isPlaying() ? 'Pause (Space)' : 'Play (Space)'"
          (click)="togglePlay()"
          [disabled]="recorder.state() === 'recording'">
          <i class="ph-light" [class.ph-pause]="playback.isPlaying()" [class.ph-play]="!playback.isPlaying()"></i>
          <span class="transport-label">{{ playback.isPlaying() ? 'Pause' : 'Play' }}</span>
        </button>
        <button class="transport-btn" matTooltip="Stop" (click)="stop()"
          [disabled]="!playback.isPlaying()">
          <i class="ph-light ph-stop"></i>
          <span class="transport-label">Stop</span>
        </button>
      </div>

      <!-- TIME DISPLAY — centered, prominent -->
      <div class="time-display">
        <span class="time-value">{{ project.state().playheadPosition | formatTime }}</span>
        @if (recorder.state() === 'processing') {
          <span class="processing processing-label">processing…</span>
        }
      </div>

      <div class="sep"></div>

      <!-- EDIT -->
      <div class="edit-group">
        <button class="edit-btn cut-btn" matTooltip="Cut selected region (Ctrl+X)"
          (click)="cutSelection()"
          [disabled]="!project.state().selection">
          <i class="ph-light ph-scissors"></i>
          <span class="edit-label">CUT</span>
        </button>
        <button class="edit-btn undo-btn" matTooltip="Undo (Ctrl+Z)"
          (click)="project.undo()"
          [disabled]="!project.canUndo()">
          <i class="ph-light ph-arrow-counter-clockwise"></i>
          <span class="edit-label">UNDO</span>
        </button>
      </div>

      <div class="sep"></div>

      <!-- PROJECT -->
      <div class="project-group">
        <button class="tb-btn" matTooltip="Add track" (click)="project.addTrack()">
          <i class="ph-light ph-plus"></i>
        </button>
        <button class="tb-btn danger-btn" matTooltip="New project — discard all changes" (click)="newProject()">
          <i class="ph-light ph-trash"></i>
        </button>
      </div>

      <div class="spacer"></div>

      <!-- EXPORT — solid red, right-aligned -->
      <button class="hero-btn export-btn" matTooltip="Export audio" (click)="exportOpen.emit()">
        <i class="ph-light ph-export"></i>
        <span>EXPORT</span>
      </button>

    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 0 16px;
      background: var(--panel-bg);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      height: 64px;
      flex-shrink: 0;
      z-index: 10;
    }

    /* ── wordmark ── */
    .wordmark {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-right: 4px;
    }
    .logo-icon {
      font-size: 20px;
      color: var(--accent);
    }
    .wordmark-text {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: var(--text-primary);
    }

    /* ── separator ── */
    .sep {
      width: 1px;
      height: 28px;
      background: var(--border);
      flex-shrink: 0;
      margin: 0 8px;
    }

    /* ── hero buttons (RECORD / EXPORT) ── */
    .hero-btn {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 0 18px;
      height: 40px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.10em;
      transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
      flex-shrink: 0;

      i { font-size: 15px; }

      &:disabled {
        opacity: 0.32;
        cursor: default;
        pointer-events: none;
      }

      &:active:not(:disabled) { transform: scale(0.97); }
    }

    /* RECORD button — solid red when idle */
    .rec-btn {
      background: var(--accent);
      color: #FFFFFF;

      &:hover:not(:disabled) {
        background: var(--accent-hover);
        box-shadow: 0 2px 10px rgba(192, 57, 43, 0.30);
      }
    }

    /* STOP button — pulsing outline */
    .stop-rec-btn {
      background: rgba(192, 57, 43, 0.10);
      color: var(--accent);
      border: 2px solid var(--accent);
      animation: pulse-rec 1.4s ease-in-out infinite;
    }

    /* EXPORT button — solid red */
    .export-btn {
      background: var(--accent);
      color: #FFFFFF;

      &:hover {
        background: var(--accent-hover);
        box-shadow: 0 2px 10px rgba(192, 57, 43, 0.30);
      }
    }

    /* ── transport group ── */
    .transport-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .transport-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      width: 52px;
      height: 48px;
      padding: 0;
      border: none;
      background: transparent;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: background 0.12s ease, color 0.12s ease;

      i { font-size: 18px; }

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

    .play-btn:hover:not(:disabled) { color: #2E7D32; }

    .transport-label {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: inherit;
      line-height: 1;
    }

    /* ── time display — centered, prominent ── */
    .time-display {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 6px 16px;
      background: var(--panel-bg2);
      border-radius: 6px;
      border: 1px solid var(--border);
      min-width: 168px;
      margin: 0 4px;
      gap: 2px;
    }

    .time-value {
      font-family: 'DM Mono', monospace;
      font-size: 24px;
      font-weight: 400;
      color: var(--time-color);
      letter-spacing: 0.03em;
      line-height: 1;
    }

    .processing-label {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 10px;
      color: var(--text-muted);
      font-style: italic;
    }

    /* ── edit group ── */
    .edit-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .edit-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      width: 52px;
      height: 48px;
      padding: 0;
      border: none;
      background: transparent;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: background 0.12s ease, color 0.12s ease;

      i { font-size: 17px; }

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

    .edit-label {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: inherit;
      line-height: 1;
    }

    /* ── project group ── */
    .project-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    /* ── base icon button ── */
    .tb-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      background: transparent;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: background 0.12s ease, color 0.12s ease;

      i { font-size: 17px; }

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

    .danger-btn:hover:not(:disabled) {
      background: rgba(192, 57, 43, 0.08);
      color: var(--accent);
    }

    .spacer { flex: 1; }

    @keyframes pulse-rec {
      0%, 100% { box-shadow: 0 0 0 0 rgba(192, 57, 43, 0.30); }
      50% { box-shadow: 0 0 0 5px rgba(192, 57, 43, 0); }
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

  recTooltip(): string {
    const armed = this.project.armedTrackId();
    if (armed) {
      const track = this.project.state().tracks.find(t => t.id === armed);
      return `Record to ${track?.name ?? 'armed track'}`;
    }
    const first = this.project.state().tracks[0];
    return first ? `Record to ${first.name} (arm a track to change target)` : 'Record from microphone';
  }

  async startRecording(): Promise<void> {
    const targetTrackId = this.project.armedTrackId() ?? this.project.state().tracks[0]?.id;
    if (!targetTrackId) return;
    await this.recorder.startRecording();
    this.recorder.recorded$.pipe(take(1)).subscribe(async ({ blob, mimeType }) => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      await this.fileService.importBlob(blob, `recording.${ext}`, targetTrackId);
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
