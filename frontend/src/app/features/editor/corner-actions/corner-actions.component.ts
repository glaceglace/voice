import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProjectService } from '../../../core/services/project.service';
import { PlaybackService } from '../../../core/services/playback.service';
import { ContextMenuComponent, type ContextMenuItem } from '../context-menu/context-menu.component';

@Component({
  selector: 'app-corner-actions',
  standalone: true,
  imports: [MatTooltipModule, ContextMenuComponent],
  template: `
    <div class="cluster">
      @if (project.canUndo()) {
        <button class="chip undo-btn" matTooltip="Undo (Ctrl+Z)" (click)="project.undo()">
          <i class="ph-light ph-arrow-counter-clockwise"></i>
          <span>Undo</span>
        </button>
      }

      <button class="chip more-btn" matTooltip="More options" (click)="openMenu($event)">
        <i class="ph-light ph-dots-three"></i>
      </button>

      <button class="export-btn" matTooltip="Export your audio" (click)="exportOpen.emit()">
        <i class="ph-light ph-export"></i>
        <span>Export</span>
      </button>
    </div>

    @if (menuVisible()) {
      <app-context-menu
        [items]="menuItems"
        [position]="menuPosition"
        (closed)="menuVisible.set(false)"
      />
    }
  `,
  styles: [`
    :host {
      position: absolute;
      top: 18px;
      right: 20px;
      z-index: 60;
    }

    .cluster {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chip {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 36px;
      padding: 0 13px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--panel-bg);
      cursor: pointer;
      color: var(--text-secondary);
      font-family: 'Instrument Sans', sans-serif;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 4px 14px rgba(26, 25, 21, 0.08);
      transition: background 0.12s, color 0.12s, transform 0.1s;
      i { font-size: 15px; }
      &:hover { background: var(--panel-bg2); color: var(--text-primary); }
      &:active { transform: scale(0.96); }
    }

    .more-btn {
      padding: 0;
      width: 36px;
      justify-content: center;
    }

    .export-btn {
      display: flex;
      align-items: center;
      gap: 7px;
      height: 38px;
      padding: 0 18px;
      border: none;
      border-radius: 999px;
      background: var(--accent);
      color: #FFFFFF;
      cursor: pointer;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      box-shadow: 0 4px 14px rgba(192, 57, 43, 0.25);
      transition: background 0.12s, box-shadow 0.15s, transform 0.1s;
      i { font-size: 15px; }
      &:hover { background: var(--accent-hover); box-shadow: 0 4px 18px rgba(192, 57, 43, 0.38); }
      &:active { transform: scale(0.97); }
    }
  `],
})
export class CornerActionsComponent {
  @Output() exportOpen = new EventEmitter<void>();

  readonly project = inject(ProjectService);
  private playback = inject(PlaybackService);

  readonly menuVisible = signal(false);
  menuPosition = { x: 0, y: 0 };
  menuItems: ContextMenuItem[] = [];

  openMenu(e: MouseEvent): void {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.menuPosition = { x: Math.max(8, rect.right - 200), y: rect.bottom + 8 };
    this.menuItems = this.buildMenu();
    this.menuVisible.set(true);
    e.stopPropagation();
  }

  private buildMenu(): ContextMenuItem[] {
    return [
      { label: 'Add a layer', icon: 'rows-plus-bottom', action: () => this.project.addTrack() },
      {
        label: this.project.snapEnabled() ? 'Snapping on' : 'Snapping off',
        icon: this.project.snapEnabled() ? 'magnet' : 'magnet-straight',
        action: () => this.project.toggleSnap(),
      },
      { separator: true, label: '', action: () => {} },
      { label: 'Start over…', icon: 'trash', action: () => this.startOver() },
    ];
  }

  startOver(): void {
    if (window.confirm('Discard all work and start a new project?')) {
      this.playback.stop();
      this.project.reset();
    }
  }
}
