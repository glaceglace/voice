import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { ProjectService } from './project.service';

const WARN_SIZE = 256 * 1024 * 1024;
const MAX_SIZE = 500 * 1024 * 1024;

const ALLOWED_EXTS = new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.mp4', '.webm']);

@Injectable({ providedIn: 'root' })
export class FileService {
  constructor(
    private api: ApiService,
    private project: ProjectService,
    private dialog: MatDialog,
  ) {}

  async importFile(file: File, targetTrackId?: string): Promise<void> {
    const ext = this.ext(file.name);
    if (!ALLOWED_EXTS.has(ext)) {
      throw new Error(`Unsupported format: ${ext}`);
    }

    if (file.size > MAX_SIZE) {
      throw new Error('File exceeds 500 MB limit.');
    }

    if (file.size > WARN_SIZE) {
      const confirmed = await this.showSizeWarning(file.name);
      if (!confirmed) return;
    }

    const trackId = targetTrackId ?? this.project.state().tracks[0]?.id;
    if (!trackId) throw new Error('No track available');

    let lastProgress = 0;
    const events$ = this.api.uploadFile(file);

    for await (const event of this.toAsyncIterable(events$)) {
      if ('progress' in event) {
        lastProgress = event.progress;
        void lastProgress;
      } else {
        const { fileId, durationSeconds, originalName } = event;
        const clip = this.project.addClip(trackId, fileId, durationSeconds, undefined, originalName ?? file.name);
        await this.fetchPeaks(clip.id, fileId, durationSeconds);
      }
    }
  }

  async importBlob(blob: Blob, filename: string, trackId: string): Promise<void> {
    const events$ = this.api.uploadFile(blob, filename);

    for await (const event of this.toAsyncIterable(events$)) {
      if ('progress' in event) {
        // progress update
      } else {
        const { fileId, durationSeconds, originalName } = event;
        const clip = this.project.addClip(trackId, fileId, durationSeconds, undefined, originalName ?? filename);
        await this.fetchPeaks(clip.id, fileId, durationSeconds);
      }
    }
  }

  private async fetchPeaks(clipId: string, fileId: string, duration: number): Promise<void> {
    const resolution = this.peakResolution(this.project.state().zoom, duration);
    const data = await firstValueFrom(this.api.getPeaks(fileId, resolution));
    this.project.setClipPeaks(clipId, data.peaks);
  }

  private peakResolution(zoom: number, _duration: number): number {
    if (zoom < 50) return 500;
    if (zoom < 200) return 2000;
    return 8000;
  }

  private ext(name: string): string {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx).toLowerCase() : '';
  }

  private async showSizeWarning(filename: string): Promise<boolean> {
    const { FileSizeWarningDialogComponent } = await import('../../shared/components/file-size-warning-dialog.component');
    const ref = this.dialog.open(FileSizeWarningDialogComponent, {
      data: { filename },
      width: '400px',
    });
    return firstValueFrom(ref.afterClosed()) as Promise<boolean>;
  }

  private toAsyncIterable<T>(obs: import('rxjs').Observable<T>): AsyncIterable<T> {
    return {
      [Symbol.asyncIterator]() {
        const queue: T[] = [];
        let done = false;
        let resolve: (() => void) | null = null;

        const sub = obs.subscribe({
          next: val => { queue.push(val); resolve?.(); resolve = null; },
          error: err => { done = true; resolve?.(); void err; },
          complete: () => { done = true; resolve?.(); },
        });

        return {
          async next(): Promise<IteratorResult<T>> {
            while (!queue.length && !done) {
              await new Promise<void>(r => { resolve = r; });
            }
            if (queue.length) return { value: queue.shift()!, done: false };
            sub.unsubscribe();
            return { value: undefined as unknown as T, done: true };
          },
          async return(): Promise<IteratorResult<T>> {
            sub.unsubscribe();
            return { value: undefined as unknown as T, done: true };
          },
        };
      },
    };
  }
}
