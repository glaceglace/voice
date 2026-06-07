import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProjectService } from './project.service';
import { ApiService } from './api.service';
import type { Clip, PeakSample } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class EditActionsService {
  private project = inject(ProjectService);
  private api = inject(ApiService);

  private peakResolution(duration: number): number {
    const pixelWidth = this.project.state().zoom * Math.max(duration, 1);
    return Math.min(Math.max(Math.ceil(pixelWidth), 200), 10000);
  }

  private slicePeaks(clip: Clip, startFraction: number, endFraction: number): PeakSample[] | null {
    if (!clip.peakData?.length) return null;
    const n = clip.peakData.length;
    return clip.peakData.slice(Math.floor(startFraction * n), Math.ceil(endFraction * n));
  }

  private async finalizePeaks(
    clip: Clip,
    newClipId: string,
    result: { fileId: string; durationSeconds: number; peaks?: { min: number; max: number }[] },
  ): Promise<void> {
    if (result.peaks) {
      this.project.setClipPeaks(newClipId, result.peaks);
      return;
    }
    const data = await firstValueFrom(this.api.getPeaks(result.fileId, this.peakResolution(result.durationSeconds)));
    if (data) this.project.setClipPeaks(newClipId, data.peaks);
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

    // Fractions within the clip's peak array for each surviving portion
    const leftEndFrac   = (sel.start - clip.startTime) / clip.duration;
    const rightStartFrac = (sel.end  - clip.startTime) / clip.duration;

    // Case B: both sides remain — split into two clips
    if (hasLeft && hasRight) {
      const leftDuration  = fileStart - clip.sourceOffset;
      const rightDuration = clipEnd   - fileEnd;

      // Fire both cuts in parallel; peaks are extracted from the original file on the backend
      const [left, right] = await Promise.all([
        firstValueFrom(this.api.cut(clip.sourceFileId, clip.sourceOffset, fileStart, this.peakResolution(leftDuration))),
        firstValueFrom(this.api.cut(clip.sourceFileId, fileEnd, clipEnd,             this.peakResolution(rightDuration))),
      ]);

      const leftClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime,
        duration: left.durationSeconds,
        sourceFileId: left.fileId,
        sourceOffset: 0,
        peakData: left.peaks ?? this.slicePeaks(clip, 0, leftEndFrac),
        isLoading: false,
      };
      const rightClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime + left.durationSeconds,
        duration: right.durationSeconds,
        sourceFileId: right.fileId,
        sourceOffset: 0,
        peakData: right.peaks ?? this.slicePeaks(clip, rightStartFrac, 1),
        isLoading: false,
      };

      this.project.replaceClip(sel.clipId, [leftClip, rightClip]);
      this.project.setSelection(null);
      this.project.setPlayhead(rightClip.startTime);

      // Refine peaks only if the backend didn't return them already
      if (!left.peaks || !right.peaks) {
        await Promise.all([
          left.peaks  ? Promise.resolve() : this.finalizePeaks(clip, leftClip.id,  left),
          right.peaks ? Promise.resolve() : this.finalizePeaks(clip, rightClip.id, right),
        ]);
      }
      return;
    }

    // Case C: only left portion remains — optimistic update first, then cut in background.
    // Use the original sourceFileId + sourceOffset so playback is correct during the wait.
    if (hasLeft) {
      const leftDuration = fileStart - clip.sourceOffset;
      const derivedPeaks = this.slicePeaks(clip, 0, leftEndFrac);
      const newClip: Clip = {
        id: crypto.randomUUID(),
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime,
        duration: leftDuration,
        sourceFileId: clip.sourceFileId,
        sourceOffset: clip.sourceOffset,
        peakData: derivedPeaks,
        isLoading: !derivedPeaks,
      };
      this.project.replaceClip(sel.clipId, [newClip]);
      this.project.setSelection(null);
      this.project.setPlayhead(newClip.startTime + newClip.duration);

      const result = await firstValueFrom(
        this.api.cut(clip.sourceFileId, clip.sourceOffset, fileStart, this.peakResolution(leftDuration)),
      );
      this.project.updateClipFile(newClip.id, result.fileId, result.durationSeconds);
      await this.finalizePeaks(clip, newClip.id, result);
      return;
    }

    // Case D: only right portion remains — optimistic update first, then cut in background.
    // Point sourceOffset at the right portion of the original file so playback starts at the right place.
    const rightDuration = clipEnd - fileEnd;
    const derivedPeaks = this.slicePeaks(clip, rightStartFrac, 1);
    const newClip: Clip = {
      id: crypto.randomUUID(),
      trackId: clip.trackId,
      name: clip.name,
      startTime: clip.startTime,
      duration: rightDuration,
      sourceFileId: clip.sourceFileId,
      sourceOffset: fileEnd,
      peakData: derivedPeaks,
      isLoading: !derivedPeaks,
    };
    this.project.replaceClip(sel.clipId, [newClip]);
    this.project.setSelection(null);
    this.project.setPlayhead(newClip.startTime);

    const result = await firstValueFrom(
      this.api.cut(clip.sourceFileId, fileEnd, clipEnd, this.peakResolution(rightDuration)),
    );
    this.project.updateClipFile(newClip.id, result.fileId, result.durationSeconds);
    await this.finalizePeaks(clip, newClip.id, result);
  }
}
