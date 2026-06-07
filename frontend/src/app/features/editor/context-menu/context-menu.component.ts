import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

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
  template: `
    <ul class="ctx-menu" [style.left.px]="position.x" [style.top.px]="position.y">
      @for (item of items; track $index) {
        @if (item.separator) {
          <li class="separator"></li>
        } @else {
          <li class="item" [class.disabled]="item.disabled" (click)="invoke(item)">
            @if (item.icon) {
              <i class="ph-light item-icon" [class]="'ph-' + item.icon"></i>
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
      background: var(--panel-bg2);
      border: 1px solid var(--border-strong);
      border-radius: 6px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
      min-width: 200px;
    }

    .item {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 14px;
      cursor: pointer;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 13px;
      color: var(--text-primary);
      transition: background 0.08s;

      &:hover { background: var(--accent-glow); }

      &.disabled {
        opacity: 0.3;
        cursor: default;
        pointer-events: none;
      }
    }

    .item-icon {
      font-size: 14px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .item-label { flex: 1; }

    .item-shortcut {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
    }

    .separator {
      height: 1px;
      background: var(--border);
      margin: 3px 0;
    }
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
