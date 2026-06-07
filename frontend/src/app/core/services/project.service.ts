import { Injectable, effect, signal, computed } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import type { ProjectState, Track, Clip, SelectionRange, PeakSample } from '../models/project.model';
import { defaultProjectState } from '../models/project.model';

const MAX_HISTORY = 50;
const STORAGE_KEY = 'voice-editor-project';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private _state = signal<ProjectState>(this.loadFromStorage() ?? defaultProjectState());
  private _history: ProjectState[] = [];
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly snapEnabled = signal(true);
  toggleSnap(): void { this.snapEnabled.update(v => !v); }

  constructor() {
    // Persist on every state change, debounced so rapid mutations don't thrash storage.
    effect(() => {
      const state = this._state();
      if (this._saveTimer !== null) clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.persist(state), 300);
    });
  }

  readonly state = this._state.asReadonly();

  readonly totalDuration = computed(() => {
    const all = this._state().tracks.flatMap(t => t.clips.map(c => c.startTime + c.duration));
    return all.length ? Math.max(...all) : 0;
  });

  readonly selectedClip = computed<Clip | null>(() => {
    const sel = this._state().selection;
    if (!sel) return null;
    return this._state().tracks.flatMap(t => t.clips).find(c => c.id === sel.clipId) ?? null;
  });

  readonly activeTracks = computed(() => this._state().tracks.filter(t => !t.muted));

  private save(): void {
    this._history = [...this._history.slice(-(MAX_HISTORY - 1)), structuredClone(this._state())];
  }

  private mutate(updater: (s: ProjectState) => ProjectState): void {
    this.save();
    this._state.update(updater);
  }

  // --- tracks ---

  readonly armedTrackId = computed(() =>
    this._state().tracks.find(t => t.armed)?.id ?? null
  );

  addTrack(): void {
    this.mutate(s => ({
      ...s,
      tracks: [...s.tracks, {
        id: uuidv4(), name: `Track ${s.tracks.length + 1}`,
        volume: 1, muted: false, solo: false, armed: false, clips: [],
      }],
    }));
  }

  removeTrack(trackId: string): void {
    this.mutate(s => ({ ...s, tracks: s.tracks.filter(t => t.id !== trackId) }));
  }

  setTrackVolume(trackId: string, volume: number): void {
    this._state.update(s => ({
      ...s,
      tracks: s.tracks.map(t => t.id === trackId ? { ...t, volume } : t),
    }));
  }

  setTrackMute(trackId: string, muted: boolean): void {
    this._state.update(s => ({
      ...s,
      tracks: s.tracks.map(t => t.id === trackId ? { ...t, muted } : t),
    }));
  }

  setTrackSolo(trackId: string, solo: boolean): void {
    this._state.update(s => ({
      ...s,
      tracks: s.tracks.map(t => t.id === trackId ? { ...t, solo } : t),
    }));
  }

  setTrackArmed(trackId: string, armed: boolean): void {
    this._state.update(s => ({
      ...s,
      tracks: s.tracks.map(t => ({ ...t, armed: t.id === trackId ? armed : false })),
    }));
  }

  // --- clips ---

  addClip(trackId: string, sourceFileId: string, duration: number, startTime?: number, name?: string): Clip {
    const clip: Clip = {
      id: uuidv4(),
      trackId,
      name: name ?? sourceFileId.slice(0, 8),
      startTime: startTime ?? this.trackEndTime(trackId),
      duration,
      sourceFileId,
      sourceOffset: 0,
      peakData: null,
      isLoading: true,
    };
    this.mutate(s => ({
      ...s,
      tracks: s.tracks.map(t => t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t),
    }));
    return clip;
  }

  removeClip(clipId: string): void {
    this.mutate(s => ({
      ...s,
      tracks: s.tracks.map(t => ({ ...t, clips: t.clips.filter(c => c.id !== clipId) })),
    }));
  }

  updateClipFile(clipId: string, sourceFileId: string, duration: number): void {
    this._state.update(s => ({
      ...s,
      tracks: s.tracks.map(t => ({
        ...t,
        clips: t.clips.map(c =>
          c.id === clipId ? { ...c, sourceFileId, sourceOffset: 0, duration } : c
        ),
      })),
    }));
  }

  setClipPeaks(clipId: string, peakData: PeakSample[]): void {
    this._state.update(s => ({
      ...s,
      tracks: s.tracks.map(t => ({
        ...t,
        clips: t.clips.map(c => c.id === clipId ? { ...c, peakData, isLoading: false } : c),
      })),
    }));
  }

  replaceClip(clipId: string, newClips: Clip[]): void {
    this.mutate(s => ({
      ...s,
      tracks: s.tracks.map(t => {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx === -1) return t;
        const clips = [...t.clips];
        clips.splice(idx, 1, ...newClips);
        return { ...t, clips };
      }),
    }));
  }

  moveClip(clipId: string, newStartTime: number): void {
    this.mutate(s => ({
      ...s,
      tracks: s.tracks.map(t => ({
        ...t,
        clips: t.clips.map(c => c.id === clipId ? { ...c, startTime: Math.max(0, newStartTime) } : c),
      })),
    }));
  }

  batchMove(
    primary: { clipId: string; newTrackId: string; newStartTime: number },
    shifts: { clipId: string; newStartTime: number }[],
  ): void {
    this.mutate(s => {
      let primaryClip: Clip | null = null;
      const withoutPrimary = s.tracks.map(t => {
        const idx = t.clips.findIndex(c => c.id === primary.clipId);
        if (idx === -1) return t;
        primaryClip = {
          ...t.clips[idx],
          startTime: Math.max(0, primary.newStartTime),
          trackId: primary.newTrackId,
        };
        return { ...t, clips: t.clips.filter(c => c.id !== primary.clipId) };
      });
      if (!primaryClip) return s;

      const shiftMap = new Map(shifts.map(sh => [sh.clipId, sh.newStartTime]));
      return {
        ...s,
        tracks: withoutPrimary.map(t => {
          let clips = t.clips.map(c => {
            const ns = shiftMap.get(c.id);
            return ns !== undefined ? { ...c, startTime: Math.max(0, ns) } : c;
          });
          if (t.id === primary.newTrackId) clips = [...clips, primaryClip!];
          return { ...t, clips };
        }),
      };
    });
  }

  moveClipToTrack(clipId: string, newTrackId: string, newStartTime: number): void {
    this.mutate(s => {
      let movedClip: Clip | null = null;
      const withoutClip = s.tracks.map(t => {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx === -1) return t;
        movedClip = { ...t.clips[idx], startTime: Math.max(0, newStartTime), trackId: newTrackId };
        return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
      });
      if (!movedClip) return s;
      return {
        ...s,
        tracks: withoutClip.map(t =>
          t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip!] } : t
        ),
      };
    });
  }

  // --- playback/transport ---

  setPlayhead(position: number): void {
    this._state.update(s => ({ ...s, playheadPosition: Math.max(0, position) }));
  }

  setPlaying(isPlaying: boolean): void {
    this._state.update(s => ({ ...s, isPlaying }));
  }

  setRecording(isRecording: boolean): void {
    this._state.update(s => ({ ...s, isRecording }));
  }

  setZoom(zoom: number): void {
    this._state.update(s => ({ ...s, zoom: Math.max(20, Math.min(500, zoom)) }));
  }

  setSelection(selection: SelectionRange | null): void {
    this._state.update(s => ({ ...s, selection }));
  }

  // --- undo ---

  undo(): void {
    const prev = this._history.pop();
    if (prev) this._state.set(prev);
  }

  canUndo(): boolean {
    return this._history.length > 0;
  }

  reset(): void {
    this._history = [];
    this._state.set(defaultProjectState());
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  // --- persistence ---

  private loadFromStorage(): ProjectState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw) as ProjectState;
      // Migrate: older saved states lack `armed` on tracks
      state.tracks = state.tracks.map(t => ({ ...t, armed: (t as { armed?: boolean }).armed ?? false }));
      return state;
    } catch {
      return null;
    }
  }

  private persist(state: ProjectState): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* quota exceeded or private browsing */ }
  }

  // --- helpers ---

  private trackEndTime(trackId: string): number {
    const track = this._state().tracks.find(t => t.id === trackId);
    if (!track?.clips.length) return 0;
    return Math.max(...track.clips.map(c => c.startTime + c.duration));
  }

  getClipById(clipId: string): Clip | undefined {
    return this._state().tracks.flatMap(t => t.clips).find(c => c.id === clipId);
  }
}
