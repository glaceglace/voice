export interface Track {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  clips: Clip[];
}

export interface Clip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  sourceFileId: string;
  sourceOffset: number;
  peakData: PeakSample[] | null;
  isLoading: boolean;
}

export interface PeakSample {
  min: number;
  max: number;
}

export interface SelectionRange {
  clipId: string;
  start: number;
  end: number;
}

export interface ProjectState {
  tracks: Track[];
  playheadPosition: number;
  zoom: number;
  selection: SelectionRange | null;
  isPlaying: boolean;
  isRecording: boolean;
}

export function defaultProjectState(): ProjectState {
  return {
    tracks: [
      { id: 'track-1', name: 'Track 1', volume: 1, muted: false, solo: false, armed: false, clips: [] },
    ],
    playheadPosition: 0,
    zoom: 100,
    selection: null,
    isPlaying: false,
    isRecording: false,
  };
}
