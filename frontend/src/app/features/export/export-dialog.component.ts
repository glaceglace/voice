import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ProjectService } from '../../core/services/project.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatSelectModule, MatProgressBarModule, MatIconModule, FormsModule],
  template: `
    <div mat-dialog-title class="dialog-title">
      <mat-icon>save_alt</mat-icon>
      Export Audio
    </div>

    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width:100%;margin-top:8px">
        <mat-label>Output format</mat-label>
        <mat-select [(ngModel)]="format">
          <mat-option value="mp3">MP3 — Compressed, universal</mat-option>
          <mat-option value="wav">WAV — Lossless, large</mat-option>
          <mat-option value="flac">FLAC — Lossless, compressed</mat-option>
          <mat-option value="ogg">OGG Vorbis — Open source</mat-option>
          <mat-option value="m4a">M4A / AAC — Apple-friendly</mat-option>
        </mat-select>
      </mat-form-field>

      @if (progress >= 0) {
        <mat-progress-bar
          mode="determinate"
          [value]="progress"
          style="margin-top:4px;border-radius:2px"
        />
        <p class="status-text">{{ statusText }}</p>
      }

      @if (error) {
        <p class="error-text">
          <mat-icon style="font-size:14px;width:14px;height:14px;vertical-align:middle">error</mat-icon>
          {{ error }}
        </p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="exporting">Cancel</button>
      <button mat-flat-button color="primary" (click)="startExport()" [disabled]="exporting">
        <mat-icon>download</mat-icon>
        Export
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-title {
      display: flex;
      align-items: center;
      gap: 8px;
      mat-icon { color: var(--accent); }
    }
    .status-text { font-size: 12px; color: var(--text-muted); margin: 6px 0 0; }
    .error-text { font-size: 12px; color: #f44336; margin: 8px 0 0; display: flex; align-items: center; gap: 4px; }
  `],
})
export class ExportDialogComponent {
  private api = inject(ApiService);
  private project = inject(ProjectService);
  private dialogRef = inject(MatDialogRef<ExportDialogComponent>);

  format = 'mp3';
  progress = -1;
  exporting = false;
  statusText = '';
  error = '';

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

    try {
      const jobRes = await firstValueFrom(this.api.startExport(segments, this.format));
      if (!jobRes?.jobId) throw new Error('No job ID returned from server');

      await this.waitForProgress(jobRes.jobId);

      this.statusText = 'Downloading…';
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
