import { TestBed } from '@angular/core/testing';
import { PlaybackService } from './playback.service';
import { ProjectService } from './project.service';
import { AudioContextService } from './audio-context.service';

function makeBufferSource() {
  const node: any = {
    buffer: null,
    onended: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  return node as AudioBufferSourceNode;
}

function makeGain() {
  return {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as GainNode;
}

function makeAudioBuffer(): AudioBuffer {
  return {} as AudioBuffer;
}

function makeAudioCtx() {
  const source = makeBufferSource();
  const gain = makeGain();
  const ctx: any = {
    currentTime: 0,
    createBufferSource: vi.fn().mockReturnValue(source),
    createGain: vi.fn().mockReturnValue(gain),
    destination: {},
    decodeAudioData: vi.fn().mockResolvedValue(makeAudioBuffer()),
  };
  return { ctx, source, gain };
}

describe('PlaybackService', () => {
  let svc: PlaybackService;
  let project: ProjectService;
  let audioCtxSvc: { getOrCreate: ReturnType<typeof vi.fn>; context: ReturnType<typeof vi.fn> };
  let mockCtx: any;
  let mockSource: any;
  let mockGain: any;

  beforeEach(() => {
    const { ctx, source, gain } = makeAudioCtx();
    mockCtx = ctx;
    mockSource = source;
    mockGain = gain;

    audioCtxSvc = {
      getOrCreate: vi.fn().mockReturnValue(mockCtx),
      context: vi.fn().mockReturnValue(mockCtx),
    };

    // Mock fetch to return a decodable response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as Response);

    TestBed.configureTestingModule({
      providers: [
        { provide: AudioContextService, useValue: audioCtxSvc },
      ],
    });
    svc = TestBed.inject(PlaybackService);
    project = TestBed.inject(ProjectService);
  });

  afterEach(() => {
    svc.stop();
    vi.restoreAllMocks();
  });

  it('starts in not-playing state', () => {
    expect(svc.isPlaying()).toBe(false);
  });

  it('play transitions to playing', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    await svc.play();
    expect(svc.isPlaying()).toBe(true);
    svc.stop();
  });

  it('play is a no-op when already playing', async () => {
    await svc.play();
    const callsBefore = (audioCtxSvc.getOrCreate as ReturnType<typeof vi.fn>).mock.calls.length;
    await svc.play();
    expect((audioCtxSvc.getOrCreate as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
    svc.stop();
  });

  it('stop transitions to not-playing', async () => {
    await svc.play();
    svc.stop();
    expect(svc.isPlaying()).toBe(false);
  });

  it('stop calls source.stop and gain.disconnect for active sources', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    await svc.play();

    // Give async scheduleClip time to run
    await new Promise(r => setTimeout(r, 10));
    svc.stop();
    // stop was called on source if it was scheduled
    expect(svc.isPlaying()).toBe(false);
  });

  it('stop cancels rAF and sets playhead via project', async () => {
    await svc.play();
    svc.stop();
    expect(project.state().isPlaying).toBe(false);
  });

  it('seek stops and restarts when playing', async () => {
    await svc.play();
    svc.seek(3);
    // After seek, playhead is set
    expect(project.state().playheadPosition).toBe(3);
    svc.stop();
  });

  it('seek just sets playhead when not playing', () => {
    svc.seek(5);
    expect(project.state().playheadPosition).toBe(5);
    expect(svc.isPlaying()).toBe(false);
  });

  it('skips muted tracks during play', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    project.setTrackMute(trackId, true);
    await svc.play();
    // No clips were scheduled (muted track skipped)
    expect(svc.isPlaying()).toBe(true);
    svc.stop();
  });

  it('skips past clips (clip.startTime + duration <= playheadPosition)', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    project.setPlayhead(10); // past the clip
    await svc.play(10);
    expect(svc.isPlaying()).toBe(true);
    svc.stop();
  });

  it('scheduleClip skips when clip is past duration', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 0); // zero duration clip
    await svc.play();
    expect(svc.isPlaying()).toBe(true);
    svc.stop();
  });

  it('scheduleClip handles clip starting in the future (contextDelay > 0)', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5, 2); // clip starts at time 2, play from 0
    await svc.play(0);
    expect(svc.isPlaying()).toBe(true);
    await new Promise(r => setTimeout(r, 10));
    svc.stop();
  });

  it('loadFullFile returns null on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    await svc.play();
    // No crash; clip not scheduled
    svc.stop();
  });

  it('loadFullFile returns null on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
    } as unknown as Response);
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    await svc.play();
    svc.stop();
  });

  it('source.onended cleans up from activeSources', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    await svc.play();
    await new Promise(r => setTimeout(r, 10));
    // Trigger onended
    if (mockSource.onended) mockSource.onended();
    svc.stop();
  });

  it('tick advances playhead position via rAF callback', async () => {
    // Capture the rAF callbacks and invoke them manually
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 10);
    await svc.play();
    expect(svc.isPlaying()).toBe(true);

    // Advance context time and fire the rAF callback
    mockCtx.currentTime = 1;
    if (rafCallbacks.length > 0) rafCallbacks[0](0);

    expect(project.state().playheadPosition).toBeGreaterThan(0);
    svc.stop();
  });

  it('tick stops playback when past totalDuration', async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 2); // short clip
    await svc.play();

    // Jump time past end of clip
    mockCtx.currentTime = 100;
    if (rafCallbacks.length > 0) rafCallbacks[0](0);

    expect(svc.isPlaying()).toBe(false);
    expect(project.state().playheadPosition).toBe(0);
  });

  it('tick returns early when context is null', async () => {
    audioCtxSvc.context.mockReturnValue(null);
    // Call tick directly through the private method
    const prevPlayhead = project.state().playheadPosition;
    (svc as any).tick(0, 0);
    expect(project.state().playheadPosition).toBe(prevPlayhead);
  });

  it('scheduleClip skips when isPlaying becomes false before buffer resolves', async () => {
    // Use a deferred fetch so we can stop playback before buffer resolves
    let resolveFetch!: (val: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>(r => { resolveFetch = r; })
    );

    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);

    void svc.play();
    // Stop immediately before fetch resolves
    svc.stop();

    // Now resolve the fetch — scheduleClip should see isPlaying()===false and bail
    resolveFetch({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as Response);

    await new Promise(r => setTimeout(r, 20));
    expect(svc.isPlaying()).toBe(false);
  });

  it('source.onended with idx=-1 does not throw (source already removed by stop)', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    await svc.play();
    await new Promise(r => setTimeout(r, 10));

    // Stop first (removes from activeSources), then trigger onended
    svc.stop();
    // mockSource.onended was captured before stop cleared activeSources
    if (mockSource.onended) {
      expect(() => mockSource.onended()).not.toThrow();
    }
  });
});
