import { Component, EventEmitter, inject, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
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
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, MatDividerModule, FormatTimePipe],
  template: `
    <div class="toolbar">

      <!-- app name -->
      <span class="app-name">
        <mat-icon class="logo-icon">graphic_eq</mat-icon>
        Voice Editor
      </span>

      <mat-divider vertical class="divider" />

      <!-- transport group -->
      <div class="btn-group">
        <button mat-icon-button matTooltip="Rewind to start" (click)="rewind()"
          [disabled]="recorder.state() === 'recording'">
          <mat-icon>skip_previous</mat-icon>
        </button>

        <button mat-icon-button class="play-btn"
          [matTooltip]="playback.isPlaying() ? 'Pause' : 'Play'"
          (click)="togglePlay()"
          [disabled]="recorder.state() === 'recording'">
          <mat-icon>{{ playback.isPlaying() ? 'pause' : 'play_arrow' }}</mat-icon>
        </button>

        <button mat-icon-button matTooltip="Stop" (click)="stop()"
          [disabled]="!playback.isPlaying()">
          <mat-icon>stop</mat-icon>
        </button>

        @if (recorder.state() === 'recording') {
          <button mat-icon-button class="rec-active" matTooltip="Stop Recording"
            (click)="stopRecording()">
            <mat-icon>stop</mat-icon>
          </button>
        } @else {
          <button mat-icon-button class="rec-btn"
            matTooltip="Record from microphone"
            (click)="startRecording()"
            [disabled]="recorder.state() === 'processing' || playback.isPlaying()">
            <mat-icon>fiber_manual_record</mat-icon>
          </button>
        }
      </div>

      <mat-divider vertical class="divider" />

      <!-- edit group -->
      <div class="btn-group">
        <button mat-icon-button matTooltip="Cut selected region (Ctrl+X)"
          (click)="cutSelection()"
          [disabled]="!project.state().selection">
          <mat-icon>content_cut</mat-icon>
        </button>

        <button mat-icon-button matTooltip="Undo (Ctrl+Z)"
          (click)="project.undo()"
          [disabled]="!project.canUndo()">
          <mat-icon>undo</mat-icon>
        </button>
      </div>

      <mat-divider vertical class="divider" />

      <!-- file group -->
      <div class="btn-group">
        <button mat-icon-button matTooltip="Export audio" (click)="exportOpen.emit()">
          <mat-icon>save_alt</mat-icon>
        </button>

        <button mat-icon-button matTooltip="Add track" (click)="project.addTrack()">
          <mat-icon>library_add</mat-icon>
        </button>

        <button mat-icon-button class="new-project-btn" matTooltip="New project — discard all changes" (click)="newProject()">
          <mat-icon>delete_forever</mat-icon>
        </button>
      </div>

      <mat-divider vertical class="divider" />

      <!-- snap toggle -->
      <button mat-icon-button
        [class.snap-active]="project.snapEnabled()"
        [matTooltip]="project.snapEnabled() ? 'Snap enabled — click to disable' : 'Snap disabled — click to enable'"
        (click)="project.toggleSnap()">
        <mat-icon>{{ project.snapEnabled() ? 'grid_on' : 'grid_off' }}</mat-icon>
      </button>

      <mat-divider vertical class="divider" />

      <!-- zoom group -->
      <div class="btn-group zoom-group">
        <button mat-icon-button matTooltip="Zoom out" (click)="zoomOut()">
          <mat-icon>zoom_out</mat-icon>
        </button>
        <span class="zoom-val">{{ project.state().zoom }}px/s</span>
        <button mat-icon-button matTooltip="Zoom in" (click)="zoomIn()">
          <mat-icon>zoom_in</mat-icon>
        </button>
      </div>

      <div class="spacer"></div>

      <!-- status right side -->
      <div class="status-right">
        @if (recorder.state() === 'recording') {
          <span class="rec-indicator">
            <mat-icon class="blink">fiber_manual_record</mat-icon>
            REC
          </span>
        }
        @if (recorder.state() === 'processing') {
          <span class="processing">Processing…</span>
        }
        <span class="time">{{ project.state().playheadPosition | formatTime }}</span>
      </div>

    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 0 12px;
      background: var(--panel-bg);
      border-bottom: 1px solid var(--border);
      height: 56px;
      flex-shrink: 0;
    }

    .app-name {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      padding-right: 4px;
    }
    .logo-icon { color: var(--accent); font-size: 20px; width: 20px; height: 20px; }

    .divider {
      height: 32px !important;
      margin: 0 8px;
      border-color: var(--border) !important;
    }

    .btn-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .zoom-group { gap: 0; }
    .zoom-val {
      font-size: 11px;
      color: var(--text-muted);
      min-width: 56px;
      text-align: center;
    }

    .snap-active mat-icon { color: var(--accent); }

    .play-btn mat-icon { color: #4caf50; }
    .rec-btn mat-icon { color: #f44336; }
    .rec-active mat-icon { color: #f44336; animation: pulse 0.8s infinite; }
    .new-project-btn mat-icon { color: #f44336; }

    @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }

    .spacer { flex: 1; }

    .status-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .rec-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #f44336;
      font-size: 12px;
      font-weight: 500;
    }
    .rec-indicator mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .blink { animation: pulse 0.8s infinite; }

    .processing {
      font-size: 12px;
      color: var(--text-muted);
    }

    .time {
      font-family: 'Roboto Mono', 'Courier New', monospace;
      font-size: 16px;
      font-weight: 500;
      color: #4caf50;
      min-width: 90px;
      text-align: right;
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

    // take(1) ensures we only subscribe to the next event, preventing memory leaks
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
