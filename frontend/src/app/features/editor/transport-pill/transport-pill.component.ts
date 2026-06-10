import { Component, Input, inject } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { take } from 'rxjs/operators';
import { FormatTimePipe } from '../../../shared/pipes/format-time.pipe';
import { ProjectService } from '../../../core/services/project.service';
import { RecorderService } from '../../../core/services/recorder.service';
import { PlaybackService } from '../../../core/services/playback.service';
import { FileService } from '../../../core/services/file.service';
import { WaveformRecorderComponent } from '../waveform/waveform-recorder.component';

@Component({
  selector: 'app-transport-pill',
  standalone: true,
  imports: [MatTooltipModule, FormatTimePipe, WaveformRecorderComponent],
  template: `
    @if (recorder.state() === 'recording') {
      <!-- live recording pill -->
      <div class="pill pill-recording">
        <span class="rec-dot"></span>
        <div class="rec-scope">
          <app-waveform-recorder [analyser]="recorder.analyserNode()" />
        </div>
        <span class="rec-elapsed">{{ recElapsed }}</span>
        <button class="stop-rec-btn" matTooltip="Stop recording" (click)="stopRecording()">
          <i class="ph-light ph-stop"></i>
          <span>Stop</span>
        </button>
      </div>
    } @else {
      <div class="pill">
        <button class="ghost-btn rewind-btn" matTooltip="Back to start" (click)="rewind()">
          <i class="ph-light ph-skip-back"></i>
        </button>

        <button class="play-btn"
          [matTooltip]="playback.isPlaying() ? 'Pause (Space)' : 'Play (Space)'"
          (click)="togglePlay()">
          <i class="ph-light" [class.ph-pause]="playback.isPlaying()" [class.ph-play]="!playback.isPlaying()"></i>
        </button>

        <span class="time-value">{{ project.state().playheadPosition | formatTime }}</span>

        <div class="pill-sep"></div>

        @if (recorder.state() === 'processing') {
          <span class="processing">saving take…</span>
        } @else {
          <button class="rec-btn"
            [matTooltip]="recTooltip()"
            (click)="startRecording()"
            [disabled]="playback.isPlaying()">
            <i class="ph-light ph-microphone"></i>
          </button>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      position: absolute;
      bottom: 26px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 60;
    }

    .pill {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: var(--panel-bg);
      border: 1px solid var(--border);
      border-radius: 999px;
      box-shadow:
        0 12px 32px rgba(26, 25, 21, 0.14),
        0 2px 8px rgba(26, 25, 21, 0.08);
    }

    /* ── ghost buttons (rewind) ── */
    .ghost-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent;
      cursor: pointer;
      color: var(--text-secondary);
      transition: background 0.12s, color 0.12s;
      i { font-size: 17px; }
      &:hover { background: var(--accent-glow); color: var(--text-primary); }
    }

    /* ── play: solid charcoal circle, the biggest target ── */
    .play-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 46px;
      height: 46px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--text-primary);
      color: #FFFFFF;
      cursor: pointer;
      transition: transform 0.1s, background 0.12s;
      i { font-size: 20px; }
      &:hover { background: #33302B; }
      &:active { transform: scale(0.94); }
    }

    .time-value {
      font-family: 'DM Mono', monospace;
      font-size: 17px;
      color: var(--time-color);
      letter-spacing: 0.03em;
      min-width: 76px;
      text-align: center;
    }

    .pill-sep {
      width: 1px;
      height: 24px;
      background: var(--border);
    }

    /* ── record: red circle ── */
    .rec-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--accent);
      color: #FFFFFF;
      cursor: pointer;
      transition: transform 0.1s, background 0.12s, box-shadow 0.15s;
      i { font-size: 18px; }
      &:hover:not(:disabled) {
        background: var(--accent-hover);
        box-shadow: 0 2px 12px rgba(192, 57, 43, 0.35);
      }
      &:active:not(:disabled) { transform: scale(0.94); }
      &:disabled { opacity: 0.32; cursor: default; }
    }

    .processing {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 12px;
      font-style: italic;
      color: var(--text-muted);
      padding: 0 8px;
      white-space: nowrap;
    }

    /* ── recording state ── */
    .pill-recording {
      background: #FFF8F7;
      border-color: rgba(192, 57, 43, 0.35);
      animation: pulse-rec 1.6s ease-in-out infinite;
    }

    .rec-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
      margin-left: 6px;
      animation: flash 0.9s ease-in-out infinite;
    }

    .rec-scope {
      width: 150px;
      height: 36px;
      border-radius: 8px;
      overflow: hidden;
    }

    .rec-elapsed {
      font-family: 'DM Mono', monospace;
      font-size: 16px;
      color: var(--accent);
      min-width: 56px;
      text-align: center;
    }

    .stop-rec-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 16px;
      height: 38px;
      border: none;
      border-radius: 999px;
      background: var(--accent);
      color: #FFFFFF;
      cursor: pointer;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      transition: background 0.12s, transform 0.1s;
      i { font-size: 15px; }
      &:hover { background: var(--accent-hover); }
      &:active { transform: scale(0.97); }
    }

    @keyframes flash { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
    @keyframes pulse-rec {
      0%, 100% { box-shadow: 0 12px 32px rgba(192, 57, 43, 0.18), 0 0 0 0 rgba(192, 57, 43, 0.25); }
      50% { box-shadow: 0 12px 32px rgba(192, 57, 43, 0.18), 0 0 0 6px rgba(192, 57, 43, 0); }
    }
  `],
})
export class TransportPillComponent {
  @Input() recElapsed = '00:00';

  readonly project = inject(ProjectService);
  readonly recorder = inject(RecorderService);
  readonly playback = inject(PlaybackService);

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

  recTooltip(): string {
    const armed = this.project.armedTrackId();
    if (armed) {
      const track = this.project.state().tracks.find(t => t.id === armed);
      return `Record to ${track?.name ?? 'armed track'}`;
    }
    return 'Record from microphone';
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
}
