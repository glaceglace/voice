import { Injectable, signal } from '@angular/core';
import { ProjectService } from './project.service';
import { AudioContextService } from './audio-context.service';
import type { Clip } from '../models/project.model';
import { environment } from '../../../environments/environment';

interface ActiveSource {
  node: AudioBufferSourceNode;
  gainNode: GainNode;
  clipId: string;
}

@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private activeSources: ActiveSource[] = [];
  private rafId: number | null = null;

  readonly isPlaying = signal(false);

  constructor(
    private audioCtx: AudioContextService,
    private project: ProjectService,
  ) {}

  async play(fromPosition?: number): Promise<void> {
    if (this.isPlaying()) return;

    const ctx = this.audioCtx.getOrCreate();
    const position = fromPosition ?? this.project.state().playheadPosition;

    const state = this.project.state();
    const clips = state.tracks
      .filter(t => !t.muted)
      .flatMap(t => t.clips.map(c => ({ clip: c, volume: t.volume })));

    const active = clips.filter(({ clip }) => clip.startTime + clip.duration > position);

    this.isPlaying.set(true);
    this.project.setPlaying(true);
    const startTime = ctx.currentTime;

    for (const { clip, volume } of active) {
      void this.scheduleClip(ctx, clip, volume, position, startTime);
    }

    this.rafId = requestAnimationFrame(this.tick.bind(this, startTime, position));
  }

  stop(): void {
    for (const src of this.activeSources) {
      try { src.node.stop(); } catch { /* already stopped */ }
      src.gainNode.disconnect();
    }
    this.activeSources = [];
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.isPlaying.set(false);
    this.project.setPlaying(false);
  }

  seek(position: number): void {
    const wasPlaying = this.isPlaying();
    if (wasPlaying) this.stop();
    this.project.setPlayhead(position);
    if (wasPlaying) void this.play(position);
  }

  private tick(startTime: number, startPosition: number): void {
    const ctx = this.audioCtx.context();
    if (!ctx) return;
    const elapsed = ctx.currentTime - startTime;
    const position = startPosition + elapsed;
    this.project.setPlayhead(position);

    const total = this.project.totalDuration();
    if (position >= total) {
      this.stop();
      this.project.setPlayhead(0);
      return;
    }

    this.rafId = requestAnimationFrame(this.tick.bind(this, startTime, startPosition));
  }

  private async scheduleClip(
    ctx: AudioContext,
    clip: Clip,
    volume: number,
    playheadPos: number,
    startTime: number,
  ): Promise<void> {
    const clipOffset = Math.max(0, playheadPos - clip.startTime);
    const contextDelay = Math.max(0, clip.startTime - playheadPos);

    if (clip.duration - clipOffset <= 0) return;

    const buffer = await this.loadFullFile(ctx, clip.sourceFileId);
    if (!buffer || !this.isPlaying()) return;

    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    gainNode.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(startTime + contextDelay, clipOffset);

    source.onended = () => {
      gainNode.disconnect();
      const idx = this.activeSources.findIndex(s => s.node === source);
      if (idx !== -1) this.activeSources.splice(idx, 1);
    };

    this.activeSources.push({ node: source, gainNode, clipId: clip.id });
  }

  private async loadFullFile(ctx: AudioContext, fileId: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(`${environment.apiBase}/audio/file/${fileId}/raw`);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return ctx.decodeAudioData(buf);
    } catch {
      return null;
    }
  }
}
