import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProjectService } from '../../../core/services/project.service';
import { FileService } from '../../../core/services/file.service';
import type { Track } from '../../../core/models/project.model';

@Component({
  selector: 'app-track-header',
  standalone: true,
  imports: [MatSliderModule, MatTooltipModule],
  template: `
    <div class="track-header" [style.--color]="color" (contextmenu)="onHeaderContextMenu($event)">
      <div class="color-stripe"></div>
      <div class="header-body">

        <div class="top-row">
          <span class="track-name">{{ track.name }}</span>
          <div class="controls">
            <button class="ctrl-btn" [class.muted]="track.muted"
              [matTooltip]="track.muted ? 'Unmute' : 'Mute'"
              (click)="toggleMute()">
              <i class="ph-light" [class.ph-speaker-slash]="track.muted" [class.ph-speaker-high]="!track.muted"></i>
            </button>
            <button class="ctrl-btn" [class.solo]="track.solo"
              matTooltip="Solo"
              (click)="toggleSolo()">
              <i class="ph-light ph-headphones"></i>
            </button>
            <button class="ctrl-btn import-btn"
              matTooltip="Import audio file"
              (click)="importFile()">
              <i class="ph-light ph-upload-simple"></i>
            </button>
            <button class="ctrl-btn delete-btn"
              matTooltip="Delete track"
              (click)="deleteTrack()">
              <i class="ph-light ph-trash-simple"></i>
            </button>
          </div>
        </div>

        <div class="slider-row">
          <i class="ph-light ph-speaker-low row-icon" matTooltip="Volume"></i>
          <mat-slider min="0" max="2" step="0.05" class="track-slider" [disabled]="track.muted">
            <input matSliderThumb [value]="track.volume" (valueChange)="setVolume($event)" />
          </mat-slider>
        </div>

        <div class="slider-row">
          <i class="ph-light ph-chart-line-up row-icon" matTooltip="Visual gain"></i>
          <mat-slider min="0.5" max="3" step="0.1" class="track-slider">
            <input matSliderThumb [value]="amplitudeScale" (valueChange)="onAmplitudeScale($event)" />
          </mat-slider>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .track-header {
      display: flex;
      height: 100%;
      background: var(--panel-bg);
    }

    .color-stripe {
      width: 2px;
      flex-shrink: 0;
      background: var(--color, var(--accent));
      opacity: 0.75;
      transition: opacity 0.15s;
    }
    .track-header:hover .color-stripe { opacity: 1; }

    .header-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 5px 6px 5px 8px;
      gap: 2px;
      overflow: hidden;
      min-width: 0;
    }

    /* ── top row: name + controls ── */
    .top-row {
      display: flex;
      align-items: center;
      gap: 2px;
      min-width: 0;
    }

    .track-name {
      font-family: 'Instrument Sans', sans-serif;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }

    .controls {
      display: flex;
      gap: 0;
      flex-shrink: 0;
    }

    /* ── icon buttons ── */
    .ctrl-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      background: transparent;
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-muted);
      transition: background 0.1s, color 0.1s;

      i { font-size: 13px; }

      &:hover {
        background: var(--accent-glow);
        color: var(--text-primary);
      }
    }

    .ctrl-btn.muted i { color: var(--accent); }
    .ctrl-btn.solo i  { color: var(--ok); }

    .import-btn {
      color: rgba(232, 168, 56, 0.5);
      &:hover { color: var(--accent); background: var(--accent-glow); }
    }

    .delete-btn {
      opacity: 0;
      color: var(--warn);
      transition: opacity 0.15s, background 0.1s, color 0.1s;
    }
    .track-header:hover .delete-btn { opacity: 0.5; }
    .track-header:hover .delete-btn:hover { opacity: 1; background: rgba(192, 57, 43, 0.12); }

    /* ── sliders ── */
    .slider-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .row-icon {
      font-size: 11px;
      color: var(--text-muted);
      flex-shrink: 0;
      width: 12px;
    }

    .track-slider {
      flex: 1;
      min-width: 0;
    }
  `],
})
export class TrackHeaderComponent {
  @Input({ required: true }) track!: Track;
  @Input() color = '#e8a838';
  @Input() trackIndex = 0;

  @Output() amplitudeScaleChange = new EventEmitter<number>();
  @Output() headerContextMenu = new EventEmitter<MouseEvent>();

  amplitudeScale = 1;

  private project = inject(ProjectService);
  private fileService = inject(FileService);

  toggleMute(): void { this.project.setTrackMute(this.track.id, !this.track.muted); }
  toggleSolo(): void { this.project.setTrackSolo(this.track.id, !this.track.solo); }
  setVolume(value: number): void { this.project.setTrackVolume(this.track.id, value); }

  deleteTrack(): void {
    if (window.confirm(`Delete "${this.track.name}"?`)) {
      this.project.removeTrack(this.track.id);
    }
  }

  importFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav,.aac,.flac,.ogg,.m4a,.mp4,.webm';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void this.fileService.importFile(file, this.track.id);
    };
    input.click();
  }

  onAmplitudeScale(value: number): void {
    this.amplitudeScale = value;
    this.amplitudeScaleChange.emit(value);
  }

  onHeaderContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.headerContextMenu.emit(e);
  }
}
