import { Component, HostListener, OnDestroy, OnInit, ViewChild, computed, inject, signal, effect } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TimelineComponent } from './timeline/timeline.component';
import { TransportPillComponent } from './transport-pill/transport-pill.component';
import { CornerActionsComponent } from './corner-actions/corner-actions.component';
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
    TimelineComponent,
    TransportPillComponent,
    CornerActionsComponent,
  ],
  template: `
    <div class="editor-root"
      (click)="onInteraction()"
      (ve-drop)="onVeDrop($event)"
    >
      <!-- the canvas is the whole screen -->
      <div class="timeline-wrap">
        <app-timeline />
      </div>

      <!-- floating wordmark -->
      <div class="wordmark-chip">
        <i class="ph-light ph-wave-sine"></i>
        <span>VOICE</span>
      </div>

      <!-- hero empty state: one big action -->
      @if (showHero()) {
        <div class="hero">
          <button class="hero-rec" (click)="startFirstRecording()">
            <span class="hero-rec-ring"></span>
            <i class="ph-light ph-microphone"></i>
          </button>
          <p class="hero-title">Tap to record</p>
          <p class="hero-sub">
            …or drop an audio file anywhere —
            <button class="browse-link" (click)="browse()">browse</button>
          </p>
        </div>
      }

      <!-- floating corner actions (only once there is content) -->
      @if (!isEmpty()) {
        <app-corner-actions (exportOpen)="openExport()" />
      }

      <!-- floating transport pill — rises in once there is something to control -->
      <app-transport-pill
        [recElapsed]="recElapsedFormatted()"
        [class.pill-parked]="showHero()"
      />
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; }

    .editor-root {
      position: relative;
      height: 100%;
      background: var(--editor-bg);
      color: var(--text-primary);
    }

    .timeline-wrap {
      position: absolute;
      inset: 0;
    }

    /* ── floating wordmark ── */
    .wordmark-chip {
      position: absolute;
      bottom: 26px;
      left: 20px;
      z-index: 60;
      display: flex;
      align-items: center;
      gap: 7px;
      height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      background: var(--panel-bg);
      border: 1px solid var(--border);
      box-shadow: 0 4px 14px rgba(26, 25, 21, 0.06);
      pointer-events: none;

      i { font-size: 17px; color: var(--accent); }
      span {
        font-family: 'Instrument Sans', sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.18em;
        color: var(--text-primary);
      }
    }

    /* ── hero empty state ── */
    .hero {
      position: absolute;
      inset: 0;
      z-index: 50;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      background: var(--editor-bg);
    }

    .hero-rec {
      position: relative;
      width: 96px;
      height: 96px;
      border: none;
      border-radius: 50%;
      background: var(--accent);
      color: #FFFFFF;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 16px 40px rgba(192, 57, 43, 0.32);
      transition: transform 0.15s ease, background 0.15s, box-shadow 0.2s;

      i { font-size: 38px; }

      &:hover {
        background: var(--accent-hover);
        transform: scale(1.05);
        box-shadow: 0 18px 48px rgba(192, 57, 43, 0.42);
      }
      &:active { transform: scale(0.97); }
    }

    .hero-rec-ring {
      position: absolute;
      inset: -10px;
      border-radius: 50%;
      border: 2px solid rgba(192, 57, 43, 0.30);
      animation: hero-ripple 2.2s ease-out infinite;
      pointer-events: none;
    }

    @keyframes hero-ripple {
      0%   { transform: scale(1);    opacity: 1; }
      70%  { transform: scale(1.35); opacity: 0; }
      100% { transform: scale(1.35); opacity: 0; }
    }

    .hero-title {
      margin: 8px 0 0;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: var(--text-primary);
    }

    .hero-sub {
      margin: 0;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 13px;
      color: var(--text-muted);
    }

    .browse-link {
      border: none;
      background: none;
      padding: 0;
      font: inherit;
      color: var(--accent);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
      &:hover { color: var(--accent-hover); }
    }

    /* ── transport pill parked (hidden) during hero ── */
    app-transport-pill {
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    app-transport-pill.pill-parked {
      opacity: 0;
      pointer-events: none;
      transform: translateX(-50%) translateY(20px);
    }
  `],
})
export class EditorComponent implements OnInit, OnDestroy {
  @ViewChild(TransportPillComponent) pill?: TransportPillComponent;

  readonly project = inject(ProjectService);
  readonly recorder = inject(RecorderService);
  private audioCtx = inject(AudioContextService);
  private dialog = inject(MatDialog);
  private api = inject(ApiService);
  private fileService = inject(FileService);
  private playback = inject(PlaybackService);

  readonly isEmpty = computed(() =>
    this.project.state().tracks.every(t => t.clips.length === 0)
  );

  readonly showHero = computed(() =>
    this.isEmpty() && this.recorder.state() === 'idle'
  );

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

  startFirstRecording(): void {
    void this.pill?.startRecording();
  }

  browse(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav,.aac,.flac,.ogg,.m4a,.mp4,.webm';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void this.fileService.importFile(file);
    };
    input.click();
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
