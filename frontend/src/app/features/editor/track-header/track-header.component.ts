import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProjectService } from '../../../core/services/project.service';
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
      min-height: 128px;
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
      padding: 6px 8px 4px 6px;
      gap: 2px;
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
      margin-left: -6px;
    }

    .ctrl-btn {
      width: 28px !important;
      height: 28px !important;
      line-height: 28px !important;
      mat-icon {
        font-size: 16px !important;
        width: 16px !important;
        height: 16px !important;
        color: var(--text-muted);
      }
    }

    .ctrl-btn.muted mat-icon { color: #ff9800; }
    .ctrl-btn.solo mat-icon { color: #4caf50; }
    .delete-btn { opacity: 0; transition: opacity 0.15s; }
    .track-header:hover .delete-btn { opacity: 1; }
    .delete-btn mat-icon { color: #f44336 !important; }

    .volume-row, .gain-row {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .vol-icon {
      font-size: 14px !important;
      width: 14px !important;
      height: 14px !important;
      color: var(--text-muted);
    }

    .vol-slider {
      flex: 1;
      height: 20px !important;
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

  toggleMute(): void { this.project.setTrackMute(this.track.id, !this.track.muted); }
  toggleSolo(): void { this.project.setTrackSolo(this.track.id, !this.track.solo); }
  setVolume(value: number): void { this.project.setTrackVolume(this.track.id, value); }
  deleteTrack(): void { this.project.removeTrack(this.track.id); }

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
