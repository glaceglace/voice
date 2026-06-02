import { TestBed } from '@angular/core/testing';
import { AudioContextService } from './audio-context.service';

describe('AudioContextService', () => {
  let svc: AudioContextService;

  function stubAudioContext(state: AudioContextState = 'running') {
    const resumeFn = vi.fn().mockResolvedValue(undefined);
    // Must use `function` keyword so Vitest accepts `new` calls
    function MockCtx(this: any) {
      this.state = state;
      this.resume = resumeFn;
    }
    vi.stubGlobal('AudioContext', MockCtx);
    return { resumeFn };
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('getOrCreate creates a new AudioContext on first call', () => {
    stubAudioContext();
    svc = TestBed.inject(AudioContextService);
    const result = svc.getOrCreate();
    expect(result).toBeTruthy();
    expect(svc.context()).toBe(result);
  });

  it('getOrCreate returns the same context on subsequent calls', () => {
    stubAudioContext();
    svc = TestBed.inject(AudioContextService);
    const r1 = svc.getOrCreate();
    const r2 = svc.getOrCreate();
    expect(r1).toBe(r2);
  });

  it('getOrCreate resumes a suspended context', () => {
    const { resumeFn } = stubAudioContext('suspended');
    svc = TestBed.inject(AudioContextService);
    svc.getOrCreate();
    expect(resumeFn).toHaveBeenCalled();
  });

  it('resume calls resume when context is suspended', () => {
    const { resumeFn } = stubAudioContext('suspended');
    svc = TestBed.inject(AudioContextService);
    svc.getOrCreate(); // creates the context
    resumeFn.mockClear();
    svc.resume();
    expect(resumeFn).toHaveBeenCalled();
  });

  it('resume does nothing when context is running', () => {
    const { resumeFn } = stubAudioContext('running');
    svc = TestBed.inject(AudioContextService);
    svc.getOrCreate();
    resumeFn.mockClear();
    svc.resume();
    expect(resumeFn).not.toHaveBeenCalled();
  });

  it('resume does nothing when no context exists', () => {
    stubAudioContext();
    svc = TestBed.inject(AudioContextService);
    expect(() => svc.resume()).not.toThrow();
  });
});
