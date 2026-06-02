import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
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
            <span class="dot"></span> Recording…
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
        <span>{{ project.totalDuration() | number:'1.1-1' }}s total</span>
        <span>{{ project.state().tracks.length }} track{{ project.state().tracks.length !== 1 ? 's' : '' }}</span>
        <span class="spacer"></span>
        <span>{{ project.state().zoom }}px/s</span>
        <span>44.1 kHz</span>
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

    .recording-overlay {
      height: 72px;
      flex-shrink: 0;
      background: #0a140a;
      border-bottom: 1px solid #1a3a1a;
      display: flex;
      align-items: stretch;
    }

    .rec-label {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 60px;
      font-size: 10px;
      font-weight: 600;
      color: #f44336;
      letter-spacing: 0.5px;
      border-right: 1px solid #1a3a1a;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f44336;
      animation: blink 0.8s infinite;
    }
    @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }

    .timeline-wrap {
      flex: 1;
      overflow: hidden;
    }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 16px;
      height: 24px;
      flex-shrink: 0;
      background: var(--panel-bg);
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-muted);
    }
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

  ngOnInit(): void {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
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
