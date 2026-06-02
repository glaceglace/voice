import { TestBed } from '@angular/core/testing';
import { RecorderService } from './recorder.service';
import { AudioContextService } from './audio-context.service';

// ---- Mock Web Audio API ----
class MockAnalyserNode { fftSize = 2048; }
class MockSourceNode { connect = vi.fn(); }
class MockAudioCtx {
  state: AudioContextState = 'running';
  createAnalyser = vi.fn().mockReturnValue(new MockAnalyserNode());
  createMediaStreamSource = vi.fn().mockReturnValue(new MockSourceNode());
  resume = vi.fn();
}

// ---- Mock MediaRecorder ----
interface MockMR {
  mimeType: string;
  ondataavailable: ((e: BlobEvent) => void) | null;
  onstop: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

let lastMR: MockMR;

class MockMediaRecorder implements MockMR {
  mimeType: string;
  ondataavailable: ((e: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  static isTypeSupported = vi.fn((m: string) => m === 'audio/webm;codecs=opus');

  constructor(_stream: MediaStream, opts?: MediaRecorderOptions) {
    this.mimeType = opts?.mimeType ?? '';
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastMR = this;
  }
}

// ---- Mock MediaStream ----
function makeStream(): MediaStream {
  const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
  return { getTracks: vi.fn().mockReturnValue([track]) } as unknown as MediaStream;
}

describe('RecorderService', () => {
  let svc: RecorderService;
  let stream: MediaStream;

  beforeEach(() => {
    stream = makeStream();
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    // Stub mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AudioContextService,
          useValue: { getOrCreate: vi.fn().mockReturnValue(new MockAudioCtx()) },
        },
      ],
    });
    svc = TestBed.inject(RecorderService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts in idle state', () => {
    expect(svc.state()).toBe('idle');
    expect(svc.analyserNode()).toBeNull();
  });

  it('startRecording transitions to recording and sets analyser', async () => {
    await svc.startRecording();
    expect(svc.state()).toBe('recording');
    expect(svc.analyserNode()).not.toBeNull();
    expect(lastMR.start).toHaveBeenCalledWith(100);
  });

  it('startRecording is a no-op when already recording', async () => {
    await svc.startRecording();
    const callsBefore = (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length;
    await svc.startRecording();
    expect((navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('stopRecording is no-op when idle', () => {
    svc.stopRecording();
    // no error
  });

  it('stopRecording calls MediaRecorder.stop() when recording', async () => {
    await svc.startRecording();
    svc.stopRecording();
    expect(lastMR.stop).toHaveBeenCalled();
  });

  it('ondataavailable pushes non-empty chunks', async () => {
    await svc.startRecording();
    const ondata = lastMR.ondataavailable!;
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    expect(() => ondata({ data: blob } as BlobEvent)).not.toThrow();
  });

  it('ondataavailable ignores zero-size chunks', async () => {
    await svc.startRecording();
    const ondata = lastMR.ondataavailable!;
    expect(() => ondata({ data: new Blob([]) } as BlobEvent)).not.toThrow();
  });

  it('onstop emits recorded blob and transitions to processing', async () => {
    const recorded: { blob: Blob; mimeType: string }[] = [];
    svc.recorded$.subscribe(v => recorded.push(v));

    await svc.startRecording();
    lastMR.ondataavailable!({ data: new Blob(['audio'], { type: 'audio/webm' }) } as BlobEvent);
    lastMR.onstop!();

    expect(svc.state()).toBe('processing');
    expect(recorded).toHaveLength(1);
  });

  it('onProcessingDone resets to idle and clears analyser', async () => {
    await svc.startRecording();
    lastMR.onstop!();
    svc.onProcessingDone();
    expect(svc.state()).toBe('idle');
    expect(svc.analyserNode()).toBeNull();
  });

  it('preferredMime falls back to empty string when no MIME supported', async () => {
    MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(false);
    await svc.startRecording(); // should not throw
    expect(svc.state()).toBe('recording');
  });
});
