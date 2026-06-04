import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProjectService } from '../../../core/services/project.service';
import { FileService } from '../../../core/services/file.service';
import type { Track } from '../../../core/models/project.model';

@Component({
  selector: 'app-track-header',
  standalone: true,
  imports: [MatSliderModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="track-header" [style.--color]="color" (contextmenu)="onHeaderContextMenu($event)">
      <div class="color-stripe"></div>
      <div class="header-content">
        <div class="track-name">{{ track.name }}</div>
        <div class="controls">
          <button mat-icon-button class="ctrl-btn"
            [class.muted]="track.muted"
            (click)="toggleMute()"
            [matTooltip]="track.muted ? 'Unmute' : 'Mute'">
            <mat-icon>{{ track.muted ? 'volume_off' : 'volume_up' }}</mat-icon>
          </button>
          <button mat-icon-button class="ctrl-btn"
            [class.solo]="track.solo"
            (click)="toggleSolo()"
            matTooltip="Solo">
            <mat-icon>headphones</mat-icon>
          </button>
          <button mat-icon-button class="ctrl-btn import-btn"
            (click)="importFile()"
            matTooltip="Import audio file">
            <mat-icon>upload_file</mat-icon>
          </button>
          <button mat-icon-button class="ctrl-btn delete-btn"
            (click)="deleteTrack()"
            matTooltip="Delete track">
            <mat-icon>delete_outline</mat-icon>
          </button>
        </div>
        <div class="volume-row">
          <mat-icon class="vol-icon">volume_down</mat-icon>
          <mat-slider min="0" max="2" step="0.05" class="vol-slider" [disabled]="track.muted">
            <input matSliderThumb [value]="track.volume" (valueChange)="setVolume($event)" />
          </mat-slider>
        </div>
        <div class="gain-row">
          <mat-icon class="vol-icon" matTooltip="Visual gain">show_chart</mat-icon>
          <mat-slider min="0.5" max="3" step="0.1" class="vol-slider">
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
      width: 3px;
      flex-shrink: 0;
      background: var(--color, #1a73e8);
    }

    .header-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 6px 8px 4px 4px;
      gap: 2px;
      overflow: hidden;
    }

    .track-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .controls {
      display: flex;
      gap: 0;
    }

    .ctrl-btn {
      --mdc-icon-button-state-layer-size: 32px;
      --mdc-icon-button-icon-size: 18px;
      mat-icon { color: var(--text-muted); }
    }

    .ctrl-btn.muted mat-icon { color: #ff9800; }
    .ctrl-btn.solo mat-icon { color: #4caf50; }
    .import-btn mat-icon { color: var(--accent); }
    .delete-btn { opacity: 0.3; transition: opacity 0.15s; }
    .track-header:hover .delete-btn { opacity: 1; }
    .delete-btn mat-icon { color: #f44336; }

    .volume-row, .gain-row {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .vol-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      color: var(--text-muted);
    }

    .vol-slider {
      flex: 1;
      --mat-slider-active-track-height: 2px;
      --mat-slider-inactive-track-height: 2px;
    }
  `],
})
export class TrackHeaderComponent {
  @Input({ required: true }) track!: Track;
  @Input() color = '#1a73e8';
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
