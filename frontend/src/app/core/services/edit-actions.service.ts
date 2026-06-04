import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProjectService } from './project.service';
import { ApiService } from './api.service';
import type { Clip } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class EditActionsService {
  private project = inject(ProjectService);
  private api = inject(ApiService);

  private peakResolution(duration: number): number {
    const pixelWidth = this.project.state().zoom * Math.max(duration, 1);
    return Math.min(Math.max(Math.ceil(pixelWidth), 200), 10000);
  }

  async cutSelection(): Promise<void> {
    const sel = this.project.state().selection;
    if (!sel) return;
    const clip = this.project.getClipById(sel.clipId);
    if (!clip) return;

    // Convert timeline selection times to offsets within the source file
    const fileStart = sel.start - clip.startTime + clip.sourceOffset;
    const fileEnd   = sel.end   - clip.startTime + clip.sourceOffset;
    const clipEnd   = clip.sourceOffset + clip.duration;

    const hasLeft  = fileStart > clip.sourceOffset + 0.001;
    const hasRight = fileEnd   < clipEnd            - 0.001;

    // Case A: entire clip is selected — just remove it
    if (!hasLeft && !hasRight) {
      this.project.removeClip(sel.clipId);
      this.project.setSelection(null);
      this.project.setPlayhead(sel.start);
      return;
    }

    // Case B: both sides remain — split into two clips
    if (hasLeft && hasRight) {
      const [left, right] = await Promise.all([
        firstValueFrom(this.api.cut(clip.sourceFileId, clip.sourceOffset, fileStart)),
        firstValueFrom(this.api.cut(clip.sourceFileId, fileEnd, clipEnd)),
      ]);

      const leftClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime,
        duration: left.durationSeconds,
        sourceFileId: left.fileId,
        sourceOffset: 0,
        peakData: null,
        isLoading: true,
      };

      // Right clip starts immediately after the left clip (no gap — ripple delete)
      const rightClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime + left.durationSeconds,
        duration: right.durationSeconds,
        sourceFileId: right.fileId,
        sourceOffset: 0,
        peakData: null,
        isLoading: true,
      };

      this.project.replaceClip(sel.clipId, [leftClip, rightClip]);
      this.project.setSelection(null);
      // Place navigator at the junction between the two clips
      this.project.setPlayhead(rightClip.startTime);

      const [leftPeaks, rightPeaks] = await Promise.all([
        firstValueFrom(this.api.getPeaks(left.fileId, this.peakResolution(left.durationSeconds))),
        firstValueFrom(this.api.getPeaks(right.fileId, this.peakResolution(right.durationSeconds))),
      ]);
      if (leftPeaks)  this.project.setClipPeaks(leftClip.id,  leftPeaks.peaks);
      if (rightPeaks) this.project.setClipPeaks(rightClip.id, rightPeaks.peaks);
      return;
    }

    // Case C: only left portion remains
    if (hasLeft) {
      const result = await firstValueFrom(
        this.api.cut(clip.sourceFileId, clip.sourceOffset, fileStart),
      );
      const newClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime,
        duration: result.durationSeconds,
        sourceFileId: result.fileId,
        sourceOffset: 0,
        peakData: null,
        isLoading: true,
      };
      this.project.replaceClip(sel.clipId, [newClip]);
      this.project.setSelection(null);
      this.project.setPlayhead(newClip.startTime + newClip.duration);
      const peaks = await firstValueFrom(this.api.getPeaks(result.fileId, this.peakResolution(result.durationSeconds)));
      if (peaks) this.project.setClipPeaks(newClip.id, peaks.peaks);
      return;
    }

    // Case D: only right portion remains
    const result = await firstValueFrom(
      this.api.cut(clip.sourceFileId, fileEnd, clipEnd),
    );
    const newClip: Clip = {
      id: crypto.randomUUID(),
      trackId: clip.trackId,
      name: clip.name,
      startTime: clip.startTime,
      duration: result.durationSeconds,
      sourceFileId: result.fileId,
      sourceOffset: 0,
      peakData: null,
      isLoading: true,
    };
    this.project.replaceClip(sel.clipId, [newClip]);
    this.project.setSelection(null);
    this.project.setPlayhead(newClip.startTime);
    const peaks = await firstValueFrom(this.api.getPeaks(result.fileId, this.peakResolution(result.durationSeconds)));
    if (peaks) this.project.setClipPeaks(newClip.id, peaks.peaks);
  }
}
