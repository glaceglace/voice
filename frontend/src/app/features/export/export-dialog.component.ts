import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ProjectService } from '../../core/services/project.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule],
  template: `
    <div class="export-dialog">
      <div class="dlg-header">
        <i class="ph-light ph-export dlg-icon"></i>
        <div>
          <div class="dlg-title">Export Audio</div>
          <div class="dlg-sub">Download your project as a file</div>
        </div>
        <button class="dlg-close" (click)="cancel()" [disabled]="exporting" title="Close">
          <i class="ph-light ph-x"></i>
        </button>
      </div>

      <div class="dlg-body">
        <!-- format chips -->
        <div class="field-label">Output format</div>
        <div class="format-chips">
          @for (fmt of formats; track fmt.value) {
            <button class="fmt-chip"
              [class.active]="format === fmt.value"
              [disabled]="exporting"
              (click)="format = fmt.value">
              <span class="fmt-name">{{ fmt.label }}</span>
              <span class="fmt-desc">{{ fmt.desc }}</span>
            </button>
          }
        </div>

        <!-- progress -->
        @if (progress >= 0) {
          <div class="progress-wrap">
            <div class="progress-track">
              <div class="progress-fill" [style.width.%]="progress"></div>
            </div>
            <span class="status-text">{{ statusText }}</span>
          </div>
        }

        @if (error) {
          <div class="error-banner">
            <i class="ph-light ph-warning-circle"></i>
            {{ error }}
          </div>
        }
      </div>

      <div class="dlg-footer">
        <button class="btn-cancel" (click)="cancel()" [disabled]="exporting">Cancel</button>
        <button class="btn-export" (click)="startExport()" [disabled]="exporting">
          @if (exporting) {
            <i class="ph-light ph-spinner-gap spin-icon"></i>
            <span>Exporting…</span>
          } @else {
            <i class="ph-light ph-download-simple"></i>
            <span>Export</span>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host ::ng-deep .mat-mdc-dialog-container { --mdc-dialog-container-color: transparent; }

    .export-dialog {
      background: var(--panel-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      font-family: 'Instrument Sans', sans-serif;
      color: var(--text-primary);
      min-width: 380px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    }

    /* ── header ── */
    .dlg-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--border);
    }
    .dlg-icon {
      font-size: 22px;
      color: var(--accent);
      flex-shrink: 0;
    }
    .dlg-title {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.01em;
      color: var(--text-primary);
    }
    .dlg-sub {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .dlg-close {
      margin-left: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      border-radius: 5px;
      cursor: pointer;
      color: var(--text-muted);
      transition: background 0.1s, color 0.1s;
      i { font-size: 15px; }
      &:hover:not(:disabled) { background: var(--accent-glow); color: var(--text-secondary); }
      &:disabled { opacity: 0.3; cursor: default; }
    }

    /* ── body ── */
    .dlg-body {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .field-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    /* format chips */
    .format-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .fmt-chip {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 7px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--panel-bg2);
      cursor: pointer;
      transition: border-color 0.12s, background 0.12s;
      min-width: 72px;

      &:hover:not(:disabled) {
        border-color: rgba(192, 57, 43, 0.3);
        background: var(--accent-glow);
      }

      &.active {
        border-color: var(--accent);
        background: var(--accent-dim);
        .fmt-name { color: var(--accent); }
      }

      &:disabled { opacity: 0.4; cursor: default; }
    }
    .fmt-name {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: 0.06em;
    }
    .fmt-desc {
      font-size: 9px;
      color: var(--text-muted);
      margin-top: 2px;
      letter-spacing: 0.02em;
    }

    /* progress */
    .progress-wrap {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .progress-track {
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .status-text {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* error */
    .error-banner {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 9px 12px;
      background: var(--accent-dim);
      border: 1px solid rgba(192, 57, 43, 0.25);
      border-radius: 6px;
      font-size: 12px;
      color: var(--accent);
      i { font-size: 14px; flex-shrink: 0; }
    }

    /* ── footer ── */
    .dlg-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 20px;
      border-top: 1px solid var(--border);
    }
    .btn-cancel {
      padding: 0 16px;
      height: 34px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      font-family: 'Instrument Sans', sans-serif;
      font-size: 12px;
      cursor: pointer;
      transition: border-color 0.1s, color 0.1s;
      &:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-primary); }
      &:disabled { opacity: 0.3; cursor: default; }
    }
    .btn-export {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 20px;
      height: 34px;
      border: none;
      border-radius: 6px;
      background: var(--accent);
      color: #FFFFFF;
      font-family: 'Instrument Sans', sans-serif;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.12s, box-shadow 0.12s;
      i { font-size: 14px; }
      &:hover:not(:disabled) {
        background: var(--accent-hover);
        box-shadow: 0 2px 8px rgba(192, 57, 43, 0.25);
      }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin-icon { animation: spin 0.8s linear infinite; }
  `],
})
export class ExportDialogComponent {
  private api = inject(ApiService);
  private project = inject(ProjectService);
  private dialogRef = inject(MatDialogRef<ExportDialogComponent>);
  private cdr = inject(ChangeDetectorRef);

  format = 'mp3';
  progress = -1;
  exporting = false;
  statusText = '';
  error = '';

  readonly formats = [
    { value: 'mp3',  label: 'MP3',  desc: 'Compressed · universal' },
    { value: 'wav',  label: 'WAV',  desc: 'Lossless · large' },
    { value: 'flac', label: 'FLAC', desc: 'Lossless · compressed' },
    { value: 'ogg',  label: 'OGG',  desc: 'Open source' },
    { value: 'm4a',  label: 'M4A',  desc: 'Apple-friendly' },
  ];

  async startExport(): Promise<void> {
    const tracks = this.project.state().tracks;
    const segments = tracks
      .filter(t => !t.muted)
      .flatMap(t => t.clips.map(c => ({
        fileId: c.sourceFileId,
        startTime: c.startTime,
        volume: t.volume,
      })));

    if (!segments.length) {
      this.error = 'No audio to export. Add some clips first.';
      return;
    }

    this.exporting = true;
    this.progress = 0;
    this.error = '';
    this.statusText = 'Starting…';
    this.cdr.markForCheck();

    try {
      const jobRes = await firstValueFrom(this.api.startExport(segments, this.format));
      if (!jobRes?.jobId) throw new Error('No job ID returned from server');

      await this.waitForProgress(jobRes.jobId);

      this.statusText = 'Downloading…';
      this.cdr.markForCheck();
      const blob = await firstValueFrom(this.api.downloadExport(jobRes.jobId));
      if (!blob) throw new Error('No file returned from server');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voice-export.${this.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.dialogRef.close('exported');
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  private waitForProgress(jobId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let completed = false;
      const es = new EventSource(`${environment.apiBase}/audio/export/progress/${jobId}`);
      es.onmessage = (e: MessageEvent) => {
        const data = JSON.parse(e.data as string) as { progress: number; status: string };
        this.progress = Math.max(0, Math.min(100, data.progress));
        this.statusText = data.status === 'done'
          ? 'Done!'
          : `Processing… ${data.progress}%`;
        this.cdr.markForCheck();
        if (data.status === 'done') {
          completed = true;
          es.close();
          resolve();
        } else if (data.status === 'error') {
          completed = true;
          es.close();
          reject(new Error('Export failed on server'));
        }
      };
      es.onerror = () => {
        if (!completed) {
          es.close();
          reject(new Error('Lost connection to server during export'));
        }
      };
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
