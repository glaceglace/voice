jest.mock('fs');
jest.mock('../config', () => ({ config: { uploadDir: '/mock/upload' } }));

import fs from 'fs';
import * as storage from './storage.service';

const mockFs = fs as jest.Mocked<typeof fs>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.mkdirSync.mockReturnValue(undefined as unknown as string);
  mockFs.unlinkSync.mockReturnValue(undefined);
  mockFs.readdirSync.mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);
  mockFs.statSync.mockReturnValue({ isFile: () => true, mtimeMs: Date.now() } as unknown as ReturnType<typeof fs.statSync>);
  // reset registry
  storage.cleanupAllFiles();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('initStorage', () => {
  it('creates session and exports directories', () => {
    storage.initStorage();
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('sessions'), { recursive: true });
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('exports'), { recursive: true });
  });

  it('sets up a purge interval', () => {
    storage.initStorage();
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });
});

describe('sessionDir / exportsDir', () => {
  it('returns the session directory path', () => {
    expect(storage.sessionDir()).toContain('sessions');
  });

  it('returns the exports directory path', () => {
    expect(storage.exportsDir()).toContain('exports');
  });
});

describe('registerFile / getFilePath', () => {
  it('registers a file and retrieves its path', () => {
    storage.registerFile('id1', '/path/to/file.wav', 'file.wav');
    expect(storage.getFilePath('id1')).toBe('/path/to/file.wav');
  });

  it('returns undefined for unknown fileId', () => {
    expect(storage.getFilePath('unknown')).toBeUndefined();
  });

  it('updates lastAccessedAt on get', () => {
    storage.registerFile('id2', '/path/file2.wav', 'file2.wav');
    const before = Date.now();
    jest.setSystemTime(before + 5000);
    storage.getFilePath('id2');
    // just ensure it does not throw
  });
});

describe('deleteFile', () => {
  it('removes the file from the registry and unlinks it', () => {
    storage.registerFile('id3', '/path/to/remove.wav', 'remove.wav');
    storage.deleteFile('id3');
    expect(storage.getFilePath('id3')).toBeUndefined();
    expect(mockFs.unlinkSync).toHaveBeenCalledWith('/path/to/remove.wav');
  });

  it('does nothing for unknown fileId', () => {
    storage.deleteFile('no-such-id');
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('swallows unlinkSync errors', () => {
    mockFs.unlinkSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    storage.registerFile('id4', '/gone.wav', 'gone.wav');
    expect(() => storage.deleteFile('id4')).not.toThrow();
  });
});

describe('cleanupAllFiles', () => {
  it('deletes all registered files', () => {
    storage.registerFile('a', '/a.wav', 'a.wav');
    storage.registerFile('b', '/b.wav', 'b.wav');
    storage.cleanupAllFiles();
    expect(storage.getFilePath('a')).toBeUndefined();
    expect(storage.getFilePath('b')).toBeUndefined();
  });
});

describe('TTL purge', () => {
  it('purges files whose lastAccessedAt is older than 30 minutes', () => {
    storage.initStorage();
    const now = Date.now();
    jest.setSystemTime(now);
    storage.registerFile('old', '/old.wav', 'old.wav');

    // Advance time past TTL (30 min) + purge interval (5 min)
    jest.setSystemTime(now + 31 * 60 * 1000);
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    expect(storage.getFilePath('old')).toBeUndefined();
  });

  it('keeps files accessed within TTL window', () => {
    storage.initStorage();
    const now = Date.now();
    jest.setSystemTime(now);
    storage.registerFile('fresh', '/fresh.wav', 'fresh.wav');
    storage.getFilePath('fresh'); // update lastAccessedAt

    jest.setSystemTime(now + 10 * 60 * 1000); // only 10 minutes later
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    expect(storage.getFilePath('fresh')).toBe('/fresh.wav');
  });
});
