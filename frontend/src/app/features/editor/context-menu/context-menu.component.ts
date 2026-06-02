import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
}

@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <ul class="ctx-menu" [style.left.px]="position.x" [style.top.px]="position.y">
      @for (item of items; track $index) {
        @if (item.separator) {
          <li class="separator"></li>
        } @else {
          <li class="item" [class.disabled]="item.disabled" (click)="invoke(item)">
            @if (item.icon) {
              <mat-icon class="item-icon">{{ item.icon }}</mat-icon>
            }
            <span class="item-label">{{ item.label }}</span>
            @if (item.shortcut) {
              <span class="item-shortcut">{{ item.shortcut }}</span>
            }
          </li>
        }
      }
    </ul>
  `,
  styles: [`
    .ctx-menu {
      position: fixed;
      z-index: 1000;
      margin: 0;
      padding: 4px 0;
      list-style: none;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      min-width: 200px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      cursor: pointer;
      font-size: 13px;
      color: rgba(255,255,255,0.87);
      &:hover { background: rgba(255,255,255,0.08); }
      &.disabled { opacity: 0.4; cursor: default; pointer-events: none; }
    }
    .item-icon {
      font-size: 16px !important;
      width: 16px !important;
      height: 16px !important;
      color: rgba(255,255,255,0.5);
    }
    .item-label { flex: 1; }
    .item-shortcut { font-size: 11px; color: rgba(255,255,255,0.4); }
    .separator { height: 1px; background: #444; margin: 4px 0; }
  `],
})
export class ContextMenuComponent {
  @Input() items: ContextMenuItem[] = [];
  @Input() position: { x: number; y: number } = { x: 0, y: 0 };
  @Output() closed = new EventEmitter<void>();

  invoke(item: ContextMenuItem): void {
    if (!item.disabled) {
      item.action();
      this.closed.emit();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!(e.target as Element).closest('.ctx-menu')) {
      this.closed.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
