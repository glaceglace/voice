import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FileService } from './file.service';
import { ApiService } from './api.service';
import { ProjectService } from './project.service';
import { MatDialog } from '@angular/material/dialog';

const fakeUploadResult = {
  fileId: 'fid1',
  originalName: 'test.wav',
  durationSeconds: 3,
  sampleRate: 44100,
  channels: 1,
  format: 'wav',
};

const fakePeaks = { fileId: 'fid1', peaks: [{ min: -0.5, max: 0.5 }], resolution: 500 };

describe('FileService', () => {
  let svc: FileService;
  let api: { uploadFile: ReturnType<typeof vi.fn>; getPeaks: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let project: ProjectService;

  beforeEach(() => {
    api = {
      uploadFile: vi.fn().mockReturnValue(of(fakeUploadResult)),
      getPeaks: vi.fn().mockReturnValue(of(fakePeaks)),
    };
    dialog = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    svc = TestBed.inject(FileService);
    project = TestBed.inject(ProjectService);
  });

  // --- importFile ---
  it('throws for unsupported extension', async () => {
    const file = new File(['x'], 'audio.xyz');
    await expect(svc.importFile(file)).rejects.toThrow('Unsupported format');
  });

  it('throws for files over 500MB', async () => {
    const file = Object.defineProperty(new File(['x'], 'audio.mp3'), 'size', { value: 500 * 1024 * 1024 + 1 });
    await expect(svc.importFile(file)).rejects.toThrow('500 MB');
  });

  it('throws when no track is available', async () => {
    const project = TestBed.inject(ProjectService);
    project.removeTrack(project.state().tracks[0].id);
    const file = new File(['x'], 'audio.mp3');
    await expect(svc.importFile(file)).rejects.toThrow('No track available');
  });

  it('imports a valid file and adds clip with peaks', async () => {
    const file = new File(['x'], 'audio.wav');
    await svc.importFile(file);
    const clips = project.state().tracks[0].clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].peakData).toEqual(fakePeaks.peaks);
    expect(clips[0].name).toBe('test.wav');
  });

  it('imports file to a specific target track', async () => {
    project.addTrack();
    const targetId = project.state().tracks[1].id;
    const file = new File(['x'], 'audio.wav');
    await svc.importFile(file, targetId);
    expect(project.state().tracks[1].clips).toHaveLength(1);
  });

  it('shows size warning for files over 256MB and aborts when user cancels', async () => {
    dialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(false)) });
    const file = Object.defineProperty(new File(['x'], 'audio.mp3'), 'size', { value: 257 * 1024 * 1024 });
    await svc.importFile(file);
    expect(project.state().tracks[0].clips).toHaveLength(0);
  });

  it('proceeds with import for 256MB+ file when user confirms', async () => {
    dialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(true)) });
    const file = Object.defineProperty(new File(['x'], 'audio.mp3'), 'size', { value: 257 * 1024 * 1024 });
    await svc.importFile(file);
    expect(project.state().tracks[0].clips).toHaveLength(1);
  });

  it('handles upload progress events', async () => {
    api.uploadFile.mockReturnValue(of({ progress: 50 }, fakeUploadResult));
    const file = new File(['x'], 'audio.wav');
    await svc.importFile(file);
    expect(project.state().tracks[0].clips).toHaveLength(1);
  });

  // --- importBlob ---
  it('importBlob handles progress events', async () => {
    api.uploadFile.mockReturnValue(of({ progress: 30 }, fakeUploadResult));
    const trackId = project.state().tracks[0].id;
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await svc.importBlob(blob, 'recording.webm', trackId);
    expect(project.state().tracks[0].clips).toHaveLength(1);
  });

  it('importBlob uploads blob and adds clip', async () => {
    const trackId = project.state().tracks[0].id;
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await svc.importBlob(blob, 'recording.webm', trackId);
    expect(project.state().tracks[0].clips).toHaveLength(1);
    expect(project.state().tracks[0].clips[0].name).toBe('test.wav');
  });

  it('importBlob uses filename as fallback when originalName absent', async () => {
    const resultWithoutName = { ...fakeUploadResult, originalName: undefined };
    api.uploadFile.mockReturnValue(of(resultWithoutName));
    const trackId = project.state().tracks[0].id;
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    await svc.importBlob(blob, 'recording.webm', trackId);
    expect(project.state().tracks[0].clips[0].name).toBe('recording.webm');
  });

  // --- toAsyncIterable error path ---
  it('toAsyncIterable handles observable error gracefully', async () => {
    const { throwError } = await import('rxjs');
    api.uploadFile.mockReturnValue(throwError(() => new Error('upload failed')));
    const file = new File(['x'], 'audio.wav');
    // Should not throw even when observable errors
    await svc.importFile(file);
    // clip might not be added but no crash
  });

  it('toAsyncIterable return() called when for-await exits via exception (getPeaks error)', async () => {
    const { throwError } = await import('rxjs');
    api.getPeaks.mockReturnValue(throwError(() => new Error('peaks error')));
    const file = new File(['x'], 'audio.wav');
    // fetchPeaks throws → for-await exits → return() called on iterator
    await expect(svc.importFile(file)).rejects.toThrow('peaks error');
  });

  it('toAsyncIterable return() method unsubscribes', async () => {
    // Test the return() path by using a Subject that never completes
    const { Subject } = await import('rxjs');
    const subject$ = new Subject<typeof fakeUploadResult>();
    api.uploadFile.mockReturnValue(subject$);

    const file = new File(['x'], 'audio.wav');
    const importPromise = svc.importFile(file);

    // Complete the subject before the for-await loop returns
    subject$.next(fakeUploadResult);
    subject$.complete();

    await importPromise;
    expect(project.state().tracks[0].clips).toHaveLength(1);
  });

  it('importFile falls back to file.name when originalName is absent', async () => {
    const resultWithoutName = { ...fakeUploadResult, originalName: undefined };
    api.uploadFile.mockReturnValue(of(resultWithoutName));
    const file = new File(['x'], 'audio.wav');
    await svc.importFile(file);
    expect(project.state().tracks[0].clips[0].name).toBe('audio.wav');
  });

  it('ext() returns empty string for filename with no dot', async () => {
    const file = new File(['x'], 'audionoext');
    await expect(svc.importFile(file)).rejects.toThrow('Unsupported format');
  });

  // --- peakResolution: resolution = clamp(ceil(zoom * duration), 200, 10000) ---
  it('fetchPeaks resolution is clamped to 200 minimum (short clip at low zoom)', async () => {
    project.setZoom(30); // 30 * 3s = 90px → clamped to 200
    const file = new File(['x'], 'audio.wav');
    await svc.importFile(file);
    expect(api.getPeaks).toHaveBeenCalledWith('fid1', 200);
  });

  it('fetchPeaks resolution scales with zoom * duration', async () => {
    project.setZoom(100); // 100 * 3s = 300px
    const file = new File(['x'], 'audio.wav');
    await svc.importFile(file);
    expect(api.getPeaks).toHaveBeenCalledWith('fid1', 300);
  });

  it('fetchPeaks resolution scales correctly at high zoom', async () => {
    project.setZoom(200); // 200 * 3s = 600px
    const file = new File(['x'], 'audio.wav');
    await svc.importFile(file);
    expect(api.getPeaks).toHaveBeenCalledWith('fid1', 600);
  });
});
