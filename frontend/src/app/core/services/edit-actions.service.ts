import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProjectService } from './project.service';
import { ApiService } from './api.service';
import type { Clip } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class EditActionsService {
  private project = inject(ProjectService);
  private api = inject(ApiService);

  async cutSelection(): Promise<void> {
    const sel = this.project.state().selection;
    if (!sel) return;
    const clip = this.project.getClipById(sel.clipId);
    if (!clip) return;

    const fileStart = sel.start - clip.startTime + clip.sourceOffset;
    const fileEnd = sel.end - clip.startTime + clip.sourceOffset;
    const clipEnd = clip.sourceOffset + clip.duration;

    const hasLeft = fileStart > clip.sourceOffset + 0.001;
    const hasRight = fileEnd < clipEnd - 0.001;

    if (!hasLeft && !hasRight) {
      this.project.removeClip(sel.clipId);
      this.project.setSelection(null);
      return;
    }

    const merged = await this.computeMerged(clip, fileStart, fileEnd, clipEnd, hasLeft, hasRight);
    if (!merged) return;

    const mergedClip: Clip = {
      id: crypto.randomUUID(),
      trackId: clip.trackId,
      name: clip.name,
      startTime: clip.startTime,
      duration: merged.durationSeconds,
      sourceFileId: merged.fileId,
      sourceOffset: 0,
      peakData: null,
      isLoading: true,
    };

    this.project.replaceClip(sel.clipId, [mergedClip]);
    this.project.setSelection(null);

    const peaks = await firstValueFrom(this.api.getPeaks(merged.fileId, 1000));
    if (peaks) this.project.setClipPeaks(mergedClip.id, peaks.peaks);
  }

  private async computeMerged(
    clip: Clip,
    fileStart: number,
    fileEnd: number,
    clipEnd: number,
    hasLeft: boolean,
    hasRight: boolean,
  ): Promise<{ fileId: string; durationSeconds: number }> {
    if (hasLeft && hasRight) {
      const [left, right] = await Promise.all([
        firstValueFrom(this.api.cut(clip.sourceFileId, clip.sourceOffset, fileStart)),
        firstValueFrom(this.api.cut(clip.sourceFileId, fileEnd, clipEnd)),
      ]);
      return firstValueFrom(this.api.merge([left.fileId, right.fileId], 0));
    }
    if (hasLeft) {
      return firstValueFrom(this.api.cut(clip.sourceFileId, clip.sourceOffset, fileStart));
    }
    return firstValueFrom(this.api.cut(clip.sourceFileId, fileEnd, clipEnd));
  }
}
