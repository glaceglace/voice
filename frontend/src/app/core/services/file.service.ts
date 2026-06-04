import { Injectable, effect } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { ProjectService } from './project.service';

const WARN_SIZE = 256 * 1024 * 1024;
const MAX_SIZE = 500 * 1024 * 1024;

const ALLOWED_EXTS = new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.mp4', '.webm']);

@Injectable({ providedIn: 'root' })
export class FileService {
  private lastTier = 0;

  constructor(
    private api: ApiService,
    private project: ProjectService,
    private dialog: MatDialog,
  ) {
    this.lastTier = this.zoomTier(this.project.state().zoom);
    effect(() => {
      const tier = this.zoomTier(this.project.state().zoom);
      if (tier !== this.lastTier) {
        this.lastTier = tier;
        void this.refreshAllPeaks();
      }
    });
  }

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

  private async refreshAllPeaks(): Promise<void> {
    const zoom = this.project.state().zoom;
    const clips = this.project.state().tracks.flatMap(t => t.clips);
    await Promise.all(
      clips.map(async (clip) => {
        const resolution = this.peakResolution(zoom, clip.duration);
        const data = await firstValueFrom(this.api.getPeaks(clip.sourceFileId, resolution));
        this.project.setClipPeaks(clip.id, data.peaks);
      }),
    );
  }

  private peakResolution(zoom: number, duration: number): number {
    // Request ~1 peak per pixel so each pixel column has its own min/max bar.
    // Cap at 10 000 to avoid excessively large responses for very long clips.
    const pixelWidth = zoom * Math.max(duration, 1);
    return Math.min(Math.max(Math.ceil(pixelWidth), 200), 10000);
  }

  private zoomTier(zoom: number): number {
    if (zoom < 50) return 0;
    if (zoom < 200) return 1;
    return 2;
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
