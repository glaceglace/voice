describe('config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, originalEnv);
    jest.resetModules();
  });

  it('uses default values when env vars are absent', () => {
    delete process.env['PORT'];
    delete process.env['UPLOAD_DIR'];
    delete process.env['FFMPEG_PATH'];
    delete process.env['CORS_ORIGIN'];
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('./index') as typeof import('./index');
    expect(config.port).toBe(3000);
    expect(config.uploadDir).toBe('/tmp/voice-editor');
    expect(config.ffmpegPath).toBe('');
    expect(config.corsOrigin).toBe('http://localhost:4200');
  });

  it('reads values from environment variables', () => {
    process.env['PORT'] = '8080';
    process.env['UPLOAD_DIR'] = '/custom/dir';
    process.env['FFMPEG_PATH'] = '/usr/bin/ffmpeg';
    process.env['CORS_ORIGIN'] = 'http://example.com';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('./index') as typeof import('./index');
    expect(config.port).toBe(8080);
    expect(config.uploadDir).toBe('/custom/dir');
    expect(config.ffmpegPath).toBe('/usr/bin/ffmpeg');
    expect(config.corsOrigin).toBe('http://example.com');
  });

  it('reads .env file and sets env vars from it when file exists', () => {
    delete process.env['PORT'];
    delete process.env['UPLOAD_DIR'];
    jest.resetModules();
    jest.isolateModules(() => {
      jest.mock('fs', () => ({
        ...jest.requireActual<typeof import('fs')>('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        // Include a line without '=' to exercise the idx === -1 branch
        readFileSync: jest.fn().mockReturnValue(
          'PORT=7777\nUPLOAD_DIR=/env/dir\n# this is a comment\n\nINVALID_LINE_NO_EQUALS\nFORCED=yes\n',
        ),
        mkdirSync: jest.fn(),
        unlinkSync: jest.fn(),
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { config } = require('./index') as typeof import('./index');
      expect(config.port).toBe(7777);
      expect(config.uploadDir).toBe('/env/dir');
    });
  });

  it('does not overwrite already-set env vars from .env file', () => {
    process.env['PORT'] = '9999';
    jest.resetModules();
    jest.isolateModules(() => {
      jest.mock('fs', () => ({
        ...jest.requireActual<typeof import('fs')>('fs'),
        existsSync: jest.fn().mockReturnValue(true),
        readFileSync: jest.fn().mockReturnValue('PORT=1111\n'),
        mkdirSync: jest.fn(),
        unlinkSync: jest.fn(),
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { config } = require('./index') as typeof import('./index');
      // process.env['PORT'] = '9999' takes precedence
      expect(config.port).toBe(9999);
    });
  });
});
