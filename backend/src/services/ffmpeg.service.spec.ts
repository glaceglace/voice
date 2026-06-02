jest.mock('fluent-ffmpeg', () => {
  const fn: any = jest.fn();
  fn.ffprobe = jest.fn();
  fn.setFfmpegPath = jest.fn();
  return fn;
});

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('test-uuid') }));
jest.mock('./storage.service', () => ({ sessionDir: jest.fn().mockReturnValue('/tmp') }));
jest.mock('../config', () => ({ config: { ffmpegPath: '' } }));

import ffmpeg from 'fluent-ffmpeg';
import * as svc from './ffmpeg.service';

// ---------------------------------------------------------------------------
// Test that setFfmpegPath is called when ffmpegPath is configured
// ---------------------------------------------------------------------------
describe('module init: setFfmpegPath', () => {
  afterEach(() => {
    jest.resetModules();
    // Restore original mocks so subsequent tests use the file-level ones
    jest.doMock('fluent-ffmpeg', () => {
      const fn: any = jest.fn();
      fn.ffprobe = jest.fn();
      fn.setFfmpegPath = jest.fn();
      return fn;
    });
  });

  it('calls setFfmpegPath when config.ffmpegPath is non-empty', () => {
    jest.resetModules();
    const setFfmpegPath = jest.fn();
    jest.doMock('fluent-ffmpeg', () => {
      const fn: any = jest.fn();
      fn.ffprobe = jest.fn();
      fn.setFfmpegPath = setFfmpegPath;
      return fn;
    });
    jest.doMock('../config', () => ({ config: { ffmpegPath: '/usr/local/bin/ffmpeg' } }));
    jest.doMock('./storage.service', () => ({ sessionDir: jest.fn().mockReturnValue('/tmp') }));
    jest.doMock('uuid', () => ({ v4: jest.fn().mockReturnValue('x') }));
    require('./ffmpeg.service');
    expect(setFfmpegPath).toHaveBeenCalledWith('/usr/local/bin/ffmpeg');
  });
});

const mockFfmpeg = ffmpeg as unknown as jest.Mock & {
  ffprobe: jest.Mock;
  setFfmpegPath: jest.Mock;
};

// ---------------------------------------------------------------------------
// Helper: build a mock command that resolves or rejects on .run()
// Optionally pipes data+end to a captured PassThrough target.
// ---------------------------------------------------------------------------
type CmdOpts = {
  fail?: boolean;
  error?: Error;
  passthroughData?: Buffer;
  passthroughError?: Error;
  progressPercent?: number;
};

function makeCmd(opts: CmdOpts = {}) {
  const handlers: Record<string, (...a: any[]) => void> = {};
  let capturedTarget: any = null;

  const cmd: any = {};
  for (const m of [
    'input', 'setStartTime', 'setDuration', 'format', 'audioChannels',
    'audioFrequency', 'outputOptions', 'audioFilters', 'complexFilter',
  ]) {
    cmd[m] = jest.fn().mockReturnValue(cmd);
  }
  cmd.output = jest.fn().mockImplementation((target: any) => {
    if (target && typeof target === 'object' && typeof (target as any).on === 'function') {
      capturedTarget = target;
    }
    return cmd;
  });
  cmd.on = jest.fn().mockImplementation((event: string, cb: (...a: any[]) => void) => {
    handlers[event] = cb;
    return cmd;
  });
  cmd.run = jest.fn().mockImplementation(() => {
    if (capturedTarget) {
      // extractPeaks path — interact via the PassThrough
      if (opts.fail) {
        handlers['error']?.(opts.error ?? new Error('cmd error'));
      } else if (opts.passthroughError) {
        capturedTarget.emit('error', opts.passthroughError);
      } else {
        if (opts.passthroughData) capturedTarget.emit('data', opts.passthroughData);
        capturedTarget.emit('end');
      }
    } else {
      // regular runFfmpeg path
      if (opts.fail) {
        handlers['error']?.(opts.error ?? new Error('cmd error'));
      } else {
        if (opts.progressPercent !== undefined) {
          handlers['progress']?.({ percent: opts.progressPercent });
        }
        handlers['end']?.();
      }
    }
  });
  return cmd;
}

// Default probe meta
function defaultMeta(overrides: Partial<{ fmtDuration: string; streamDuration: string; channels: number; sampleRate: string }> = {}) {
  return {
    format: {
      duration: overrides.fmtDuration ?? '5.0',
      format_name: 'wav,wave',
    },
    streams: [{
      codec_type: 'audio',
      duration: overrides.streamDuration ?? '5.0',
      sample_rate: overrides.sampleRate ?? '44100',
      channels: overrides.channels ?? 2,
    }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFfmpeg.mockReturnValue(makeCmd());
  mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) => cb(null, defaultMeta()));
});

// ---------------------------------------------------------------------------
// probeDuration
// ---------------------------------------------------------------------------
describe('probeDuration', () => {
  it('uses format.duration when present and positive', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, defaultMeta({ fmtDuration: '3.5' }))
    );
    const result = await svc.probeDuration('/in.wav');
    expect(result.durationSeconds).toBe(3.5);
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(2);
    expect(result.format).toBe('wav');
  });

  it('falls back to stream.duration when format duration is NaN', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, defaultMeta({ fmtDuration: 'N/A', streamDuration: '4.2' }))
    );
    const result = await svc.probeDuration('/in.webm');
    expect(result.durationSeconds).toBeCloseTo(4.2);
  });

  it('returns 0 when both durations are missing', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, { format: { duration: undefined, format_name: 'webm' }, streams: [] })
    );
    const result = await svc.probeDuration('/in.webm');
    expect(result.durationSeconds).toBe(0);
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(1);
    expect(result.format).toBe('webm');
  });

  it('uses defaults when no audio stream is present', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, { format: { duration: '2.0', format_name: 'wav' }, streams: [] })
    );
    const result = await svc.probeDuration('/in.wav');
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toBe(1);
  });

  it('rejects on ffprobe error', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(new Error('probe failed'), null)
    );
    await expect(svc.probeDuration('/in.wav')).rejects.toThrow('probe failed');
  });

  it('uses unknown as format fallback when format_name is absent', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, { format: { duration: '1.0' }, streams: [] })
    );
    const result = await svc.probeDuration('/in.wav');
    expect(result.format).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// normalizeAudio
// ---------------------------------------------------------------------------
describe('normalizeAudio', () => {
  it('transcodes file to wav and returns output path + duration', async () => {
    mockFfmpeg.mockReturnValue(makeCmd());
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, defaultMeta({ fmtDuration: '3.0' }))
    );
    const result = await svc.normalizeAudio('/in.webm');
    expect(result.outputPath).toBe('/tmp/test-uuid_op.wav');
    expect(result.durationSeconds).toBe(3.0);
  });

  it('throws when ffmpeg command fails', async () => {
    mockFfmpeg.mockReturnValue(makeCmd({ fail: true }));
    await expect(svc.normalizeAudio('/in.webm')).rejects.toThrow('cmd error');
  });
});

// ---------------------------------------------------------------------------
// cut
// ---------------------------------------------------------------------------
describe('cut', () => {
  it('cuts audio and returns result', async () => {
    const result = await svc.cut('/input.wav', 1, 4);
    expect(result.outputPath).toBe('/tmp/test-uuid_op.wav');
    expect(result.durationSeconds).toBe(5.0);
  });

  it('preserves extension of input file', async () => {
    const result = await svc.cut('/input.mp3', 0, 2);
    expect(result.outputPath).toMatch(/\.mp3$/);
  });

  it('defaults to wav when extension is missing', async () => {
    const result = await svc.cut('/input', 0, 2);
    expect(result.outputPath).toMatch(/\.wav$/);
  });

  it('rejects when ffmpeg fails', async () => {
    mockFfmpeg.mockReturnValue(makeCmd({ fail: true }));
    await expect(svc.cut('/in.wav', 0, 1)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// trim
// ---------------------------------------------------------------------------
describe('trim', () => {
  it('trims silence and returns result', async () => {
    const result = await svc.trim('/input.wav', -40, 0.1);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('rejects on ffmpeg error', async () => {
    mockFfmpeg.mockReturnValue(makeCmd({ fail: true }));
    await expect(svc.trim('/in.wav', -40, 0.1)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// merge
// ---------------------------------------------------------------------------
describe('merge', () => {
  it('concatenates without crossfade', async () => {
    const result = await svc.merge(['/a.wav', '/b.wav'], 0);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('applies crossfade when duration > 0 and 2 inputs', async () => {
    // probe for first file duration, then crossfade merge
    let probeCall = 0;
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) => {
      probeCall++;
      cb(null, defaultMeta({ fmtDuration: probeCall === 1 ? '3.0' : '5.0' }));
    });
    const result = await svc.merge(['/a.wav', '/b.wav'], 0.5);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('rejects on ffmpeg error in concat path', async () => {
    mockFfmpeg.mockReturnValue(makeCmd({ fail: true }));
    await expect(svc.merge(['/a.wav', '/b.wav'], 0)).rejects.toThrow();
  });

  it('rejects on ffmpeg error in crossfade path', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, defaultMeta({ fmtDuration: '3.0' }))
    );
    mockFfmpeg.mockImplementation(() => makeCmd({ fail: true }));
    await expect(svc.merge(['/a.wav', '/b.wav'], 0.5)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fade
// ---------------------------------------------------------------------------
describe('fade', () => {
  it('applies fade-in only (linear)', async () => {
    const result = await svc.fade('/in.wav', 0.5, 0, 'linear', 3.0);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('applies fade-in only (logarithmic)', async () => {
    const result = await svc.fade('/in.wav', 0.5, 0, 'logarithmic', 3.0);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('applies fade-out only (logarithmic)', async () => {
    const result = await svc.fade('/in.wav', 0, 0.5, 'logarithmic', 3.0);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('applies both fade-in and fade-out', async () => {
    const result = await svc.fade('/in.wav', 0.3, 0.3, 'linear', 3.0);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('applies neither fade when durations are 0', async () => {
    const result = await svc.fade('/in.wav', 0, 0, 'linear', 3.0);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('rejects on ffmpeg error', async () => {
    mockFfmpeg.mockReturnValue(makeCmd({ fail: true }));
    await expect(svc.fade('/in.wav', 0.5, 0, 'linear', 3)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// noiseGate
// ---------------------------------------------------------------------------
describe('noiseGate', () => {
  it('applies noise gate and returns result', async () => {
    const result = await svc.noiseGate('/in.wav', -40, 5, 50);
    expect(result.durationSeconds).toBe(5.0);
  });

  it('rejects on ffmpeg error', async () => {
    mockFfmpeg.mockReturnValue(makeCmd({ fail: true }));
    await expect(svc.noiseGate('/in.wav', -40, 5, 50)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// exportMix
// ---------------------------------------------------------------------------
describe('exportMix', () => {
  const seg = (startTime: number) => ({ filePath: '/audio.wav', volume: 1, startTime });

  it('mixes single segment with adelay', async () => {
    let filterUsed = '';
    const cmd = makeCmd({ progressPercent: 75 });
    const origComplexFilter = cmd.complexFilter;
    cmd.complexFilter = jest.fn().mockImplementation((f: string) => {
      filterUsed = f;
      return origComplexFilter.call(cmd, f);
    });
    mockFfmpeg.mockReturnValue(cmd);
    const onProgress = jest.fn();
    await svc.exportMix([seg(2.5)], 'wav', '/out.wav', onProgress);
    expect(filterUsed).toContain('adelay=2500|2500');
    expect(filterUsed).toContain('amix=inputs=1');
    expect(onProgress).toHaveBeenCalledWith(75);
  });

  it('mixes multiple segments', async () => {
    let filterUsed = '';
    const cmd = makeCmd();
    cmd.complexFilter = jest.fn().mockImplementation((f: string) => { filterUsed = f; return cmd; });
    mockFfmpeg.mockReturnValue(cmd);
    await svc.exportMix([seg(0), seg(3)], 'mp3', '/out.mp3', jest.fn());
    expect(filterUsed).toContain('adelay=0|0');
    expect(filterUsed).toContain('adelay=3000|3000');
    expect(filterUsed).toContain('amix=inputs=2');
  });

  it('uses progress=0 when percent is undefined', async () => {
    const cmd = makeCmd({ progressPercent: undefined });
    // Override run to emit progress with no percent then end
    cmd.run = jest.fn().mockImplementation(() => {
      const handlers: any = {};
      cmd.on.mock.calls.forEach(([e, cb]: [string, Function]) => { handlers[e] = cb; });
      handlers['progress']?.({});
      handlers['end']?.();
    });
    mockFfmpeg.mockReturnValue(cmd);
    const onProgress = jest.fn();
    await svc.exportMix([seg(0)], 'wav', '/out.wav', onProgress);
    expect(onProgress).toHaveBeenCalledWith(0);
  });

  const formatCases: Array<[string, string]> = [
    ['mp3', 'libmp3lame'],
    ['flac', 'flac'],
    ['ogg', 'libvorbis'],
    ['m4a', 'aac'],
    ['aac', 'aac'],
    ['wav', ''],
  ];

  it.each(formatCases)('uses correct codec for format %s', async (fmt, expectedCodec) => {
    let optionsUsed: string[] = [];
    const cmd = makeCmd();
    cmd.outputOptions = jest.fn().mockImplementation((o: string[]) => { optionsUsed = o; return cmd; });
    mockFfmpeg.mockReturnValue(cmd);
    await svc.exportMix([seg(0)], fmt, `/out.${fmt}`, jest.fn());
    if (expectedCodec) {
      expect(optionsUsed.join(' ')).toContain(expectedCodec);
    } else {
      expect(optionsUsed).toEqual([]);
    }
  });

  it('rejects on ffmpeg error', async () => {
    mockFfmpeg.mockReturnValue(makeCmd({ fail: true }));
    await expect(svc.exportMix([seg(0)], 'wav', '/out.wav', jest.fn())).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// extractPeaks
// ---------------------------------------------------------------------------
describe('extractPeaks', () => {
  function makeProbe(duration: string) {
    return {
      format: { duration },
      streams: [{ codec_type: 'audio' }],
    };
  }

  it('rejects when probeFile fails', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(new Error('probe failed'), null)
    );
    await expect(svc.extractPeaks('/in.wav', 4)).rejects.toThrow('probe failed');
  });

  it('rejects on cmd error during extraction', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, makeProbe('3.0'))
    );
    mockFfmpeg.mockReturnValue(makeCmd({ fail: true }));
    await expect(svc.extractPeaks('/in.wav', 4)).rejects.toThrow('cmd error');
  });

  it('rejects on PassThrough error', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, makeProbe('3.0'))
    );
    mockFfmpeg.mockReturnValue(makeCmd({ passthroughError: new Error('stream error') }));
    await expect(svc.extractPeaks('/in.wav', 4)).rejects.toThrow('stream error');
  });

  it('handles missing format.duration in probe (uses ?? fallback)', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, { format: {}, streams: [{ codec_type: 'audio' }] }) // no duration field
    );
    mockFfmpeg.mockReturnValue(makeCmd());
    const result = await svc.extractPeaks('/in.wav', 4);
    expect(result.peaks).toHaveLength(4);
    // segDuration = 0 - 0 = 0, all blocks are empty (silent)
    result.peaks.forEach(p => { expect(p.min).toBe(0); expect(p.max).toBe(0); });
  });

  it('returns empty peaks array for empty audio buffer', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, makeProbe('3.0'))
    );
    // No data emitted → empty buffer → all blocks have min=Infinity (silent)
    mockFfmpeg.mockReturnValue(makeCmd());
    const result = await svc.extractPeaks('/in.wav', 4);
    expect(result.peaks).toHaveLength(4);
    result.peaks.forEach(p => { expect(p.min).toBe(0); expect(p.max).toBe(0); });
  });

  it('calculates min/max peaks from PCM data', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, makeProbe('1.0'))
    );
    // 4 samples, resolution=2 → blockSize=2
    // samples: 16384, -16384, 8192, -8192
    const buf = Buffer.alloc(8);
    buf.writeInt16LE(16384, 0);   // +0.5
    buf.writeInt16LE(-16384, 2);  // -0.5
    buf.writeInt16LE(8192, 4);    // +0.25
    buf.writeInt16LE(-8192, 6);   // -0.25
    mockFfmpeg.mockReturnValue(makeCmd({ passthroughData: buf }));

    const result = await svc.extractPeaks('/in.wav', 2);
    expect(result.peaks).toHaveLength(2);
    expect(result.peaks[0].max).toBeCloseTo(0.5, 1);
    expect(result.peaks[0].min).toBeCloseTo(-0.5, 1);
    expect(result.peaks[1].max).toBeCloseTo(0.25, 1);
    expect(result.peaks[1].min).toBeCloseTo(-0.25, 1);
  });

  it('breaks early when buffer is shorter than expected block', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, makeProbe('1.0'))
    );
    // resolution=4, blockSize=max(1,floor(1/4))=1
    // but buffer only has 2 bytes (1 sample) — later blocks are empty
    const buf = Buffer.alloc(2);
    buf.writeInt16LE(32767, 0);
    mockFfmpeg.mockReturnValue(makeCmd({ passthroughData: buf }));

    const result = await svc.extractPeaks('/in.wav', 4);
    expect(result.peaks).toHaveLength(4);
    // first block has data
    expect(result.peaks[0].max).toBeCloseTo(1.0, 1);
    // remaining blocks are silent (empty)
    expect(result.peaks[1].min).toBe(0);
    expect(result.peaks[1].max).toBe(0);
  });

  it('uses start/end parameters for segmented extraction', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, makeProbe('10.0'))
    );
    const cmd = makeCmd();
    mockFfmpeg.mockReturnValue(cmd);
    await svc.extractPeaks('/in.wav', 4, 2, 5);
    expect(cmd.setStartTime).toHaveBeenCalledWith(2);
    expect(cmd.setDuration).toHaveBeenCalledWith(3);
  });

  it('uses 0 and duration when start/end not provided', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, makeProbe('7.0'))
    );
    const cmd = makeCmd();
    mockFfmpeg.mockReturnValue(cmd);
    await svc.extractPeaks('/in.wav', 4);
    expect(cmd.setStartTime).toHaveBeenCalledWith(0);
    expect(cmd.setDuration).toHaveBeenCalledWith(7.0);
  });

  it('returns correct fileId from basename', async () => {
    mockFfmpeg.ffprobe.mockImplementation((_: string, cb: Function) =>
      cb(null, makeProbe('1.0'))
    );
    mockFfmpeg.mockReturnValue(makeCmd());
    const result = await svc.extractPeaks('/sessions/audio.wav', 2);
    expect(result.fileId).toBe('audio.wav');
    expect(result.resolution).toBe(2);
  });
});
