export interface ImportResult {
  fileId: string;
  originalName: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  format: string;
}

export interface PeakSample {
  min: number;
  max: number;
}

export interface PeakData {
  fileId: string;
  peaks: PeakSample[];
  resolution: number;
}

export interface OpResult {
  fileId: string;
  durationSeconds: number;
}

export interface InternalOpResult {
  outputPath: string;
  durationSeconds: number;
}

export interface CutRequest {
  fileId: string;
  start: number;
  end: number;
  resolution?: number;
}

export interface TrimRequest {
  fileId: string;
  silenceThreshold: number;
  minSilenceDuration: number;
}

export interface MergeRequest {
  fileIds: string[];
  crossfadeDuration?: number;
}

export interface FadeRequest {
  fileId: string;
  fadeInDuration: number;
  fadeOutDuration: number;
  curve?: 'linear' | 'logarithmic';
}

export interface NoiseGateRequest {
  fileId: string;
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
}

export interface ExportSegment {
  fileId: string;
  startTime: number;
  volume: number;
}

export interface ExportRequest {
  segments: ExportSegment[];
  format: 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a' | 'aac';
  sampleRate?: number;
  bitrate?: number;
}

export interface ExportJob {
  jobId: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  outputPath?: string;
  format?: string;
  error?: string;
}

export interface FileMetadata {
  fileId: string;
  filePath: string;
  originalName: string;
  createdAt: number;
  lastAccessedAt: number;
}
