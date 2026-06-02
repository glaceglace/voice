import type { Request, Response } from 'express';

describe('health controller', () => {
  let health: typeof import('./health.controller')['health'];

  beforeEach(() => {
    jest.resetModules();
  });

  function makeRes() {
    return { json: jest.fn() } as unknown as Response;
  }

  it('reports ffmpegAvailable=true when ffmpeg is found', () => {
    jest.mock('child_process', () => ({
      execSync: jest.fn().mockReturnValue(Buffer.from('ffmpeg version')),
    }));
    health = require('./health.controller').health;
    const res = makeRes();
    health({} as Request, res);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok', ffmpegAvailable: true });
  });

  it('reports ffmpegAvailable=false when ffmpeg throws', () => {
    jest.mock('child_process', () => ({
      execSync: jest.fn().mockImplementation(() => { throw new Error('not found'); }),
    }));
    health = require('./health.controller').health;
    const res = makeRes();
    health({} as Request, res);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok', ffmpegAvailable: false });
  });
});
