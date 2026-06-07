import { Component, HostListener, OnDestroy, OnInit, inject, signal, effect } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { ToolbarComponent } from './toolbar/toolbar.component';
import { TimelineComponent } from './timeline/timeline.component';
import { WaveformRecorderComponent } from './waveform/waveform-recorder.component';
import { ProjectService } from '../../core/services/project.service';
import { AudioContextService } from '../../core/services/audio-context.service';
import { RecorderService } from '../../core/services/recorder.service';
import { ApiService } from '../../core/services/api.service';
import { FileService } from '../../core/services/file.service';
import { PlaybackService } from '../../core/services/playback.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [
    DecimalPipe,
    ToolbarComponent,
    TimelineComponent,
    WaveformRecorderComponent,
  ],
  template: `
    <div class="editor-root"
      (click)="onInteraction()"
      (ve-drop)="onVeDrop($event)"
    >
      <app-toolbar (exportOpen)="openExport()" />

      <!-- live recording oscilloscope -->
      @if (recorder.state() === 'recording') {
        <div class="recording-overlay">
          <div class="rec-label">
            <span class="dot"></span>
            <span class="rec-text">RECORDING</span>
            <span class="rec-timer">{{ recElapsedFormatted() }}</span>
          </div>
          <app-waveform-recorder [analyser]="recorder.analyserNode()" />
        </div>
      }

      <!-- timeline (includes track headers internally) -->
      <div class="timeline-wrap">
        <app-timeline />
      </div>

      <!-- status bar -->
      <div class="status-bar">
        <span class="stat-item"><span class="stat-label">Duration</span>{{ project.totalDuration() | number:'1.1-1' }}s</span>
        <span class="stat-sep">·</span>
        <span class="stat-item"><span class="stat-label">tracks</span>{{ project.state().tracks.length }}</span>
        <span class="spacer"></span>
        <span class="stat-item"><span class="stat-label">Zoom</span>{{ project.state().zoom }}px/s</span>
        <span class="stat-sep">·</span>
        <span class="stat-item">44.1 kHz</span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; }

    .editor-root {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--editor-bg);
      color: var(--text-primary);
    }

    /* ── recording oscilloscope strip ── */
    .recording-overlay {
      height: 72px;
      flex-shrink: 0;
      background: #FFF8F7;
      border-left: 4px solid var(--accent);
      border-bottom: 1px solid rgba(192, 57, 43, 0.15);
      display: flex;
      align-items: stretch;
    }

    .rec-label {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      width: 180px;
      flex-shrink: 0;
      border-right: 1px solid rgba(192, 57, 43, 0.12);
      padding: 0 16px;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
      animation: flash 0.9s ease-in-out infinite;
    }

    .rec-text {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: var(--accent);
    }

    .rec-timer {
      font-family: 'DM Mono', monospace;
      font-size: 18px;
      font-weight: 500;
      letter-spacing: 0.02em;
      color: var(--accent);
      margin-left: auto;
    }

    @keyframes flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }

    .timeline-wrap {
      flex: 1;
      overflow: hidden;
    }

    /* ── status bar ── */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 16px;
      height: 36px;
      flex-shrink: 0;
      background: var(--panel-bg);
      border-top: 1px solid var(--border);
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      color: var(--text-secondary);
      letter-spacing: 0.02em;
    }
    .stat-label {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-right: 5px;
    }
    .stat-item { display: flex; align-items: center; }
    .stat-sep { color: var(--border-strong); }
    .spacer { flex: 1; }
  `],
})
export class EditorComponent implements OnInit, OnDestroy {
  readonly project = inject(ProjectService);
  readonly recorder = inject(RecorderService);
  private audioCtx = inject(AudioContextService);
  private dialog = inject(MatDialog);
  private api = inject(ApiService);
  private fileService = inject(FileService);
  private playback = inject(PlaybackService);

  private recStartMs = 0;
  private recIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly recElapsed = signal(0);

  private readonly recTimerEffect = effect(() => {
    const isRec = this.recorder.state() === 'recording';
    if (isRec) {
      this.recStartMs = Date.now();
      this.recElapsed.set(0);
      this.recIntervalId = setInterval(() => {
        this.recElapsed.set(Math.floor((Date.now() - this.recStartMs) / 1000));
      }, 1000);
    } else {
      if (this.recIntervalId !== null) {
        clearInterval(this.recIntervalId);
        this.recIntervalId = null;
      }
      this.recElapsed.set(0);
    }
  });

  recElapsedFormatted(): string {
    const s = this.recElapsed();
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  ngOnInit(): void {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    if (this.recIntervalId !== null) clearInterval(this.recIntervalId);
  }

  @HostListener('click')
  onInteraction(): void {
    this.audioCtx.resume();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (e.key === ' ' && !(e.target as HTMLElement)?.closest('input, textarea, mat-slider')) {
      e.preventDefault();
      if (this.playback.isPlaying()) {
        this.playback.stop();
      } else {
        void this.playback.play();
      }
    }
  }

  async onVeDrop(e: Event): Promise<void> {
    const files = (e as CustomEvent<{ files: FileList }>).detail.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file) await this.fileService.importFile(file);
    }
  }

  async openExport(): Promise<void> {
    const { ExportDialogComponent } = await import('../export/export-dialog.component');
    this.dialog.open(ExportDialogComponent, { width: '420px' });
  }

  private onBeforeUnload = (): void => {
    this.api.sessionCleanup().subscribe();
  };
}
