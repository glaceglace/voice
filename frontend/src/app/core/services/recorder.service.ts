import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AudioContextService } from './audio-context.service';

export type RecordingState = 'idle' | 'recording' | 'processing';

@Injectable({ providedIn: 'root' })
export class RecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  readonly state = signal<RecordingState>('idle');
  readonly analyserNode = signal<AnalyserNode | null>(null);

  // emits the recorded blob when recording stops
  readonly recorded$ = new Subject<{ blob: Blob; mimeType: string }>();

  constructor(private audioCtx: AudioContextService) {}

  async startRecording(): Promise<void> {
    if (this.state() === 'recording') return;

    const ctx = this.audioCtx.getOrCreate();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // wire analyser for live waveform
    const source = ctx.createMediaStreamSource(this.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    this.analyserNode.set(analyser);

    const mimeType = this.preferredMime();
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];
      this.state.set('processing');
      this.recorded$.next({ blob, mimeType });
      this.stopStream();
    };

    this.mediaRecorder.start(100);
    this.state.set('recording');
  }

  stopRecording(): void {
    if (this.state() !== 'recording') return;
    this.mediaRecorder?.stop();
  }

  onProcessingDone(): void {
    this.state.set('idle');
    this.analyserNode.set(null);
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  private preferredMime(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return candidates.find(m => MediaRecorder.isTypeSupported(m)) ?? '';
  }
}
