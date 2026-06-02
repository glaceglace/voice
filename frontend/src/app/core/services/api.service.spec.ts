import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpEventType } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let svc: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // --- uploadFile ---
  it('uploadFile emits progress and result for File', async () => {
    const file = new File(['audio'], 'test.wav', { type: 'audio/wav' });
    const events: unknown[] = [];
    const complete$ = new Promise<void>(resolve => {
      svc.uploadFile(file).subscribe({ next: e => events.push(e), complete: resolve });
    });
    const req = http.expectOne(r => r.url.includes('/audio/import'));
    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 } as any);
    req.flush({ fileId: 'f1', originalName: 'test.wav', durationSeconds: 3, sampleRate: 44100, channels: 1, format: 'wav' });
    await complete$;
    expect(events).toHaveLength(2);
    expect((events[0] as { progress: number }).progress).toBe(50);
  });

  it('uploadFile handles upload event with no total (uses 1 as total)', async () => {
    const file = new File(['audio'], 'test.wav', { type: 'audio/wav' });
    const events: unknown[] = [];
    const complete$ = new Promise<void>(resolve => {
      svc.uploadFile(file).subscribe({ next: e => events.push(e), complete: resolve });
    });
    const req = http.expectOne(r => r.url.includes('/audio/import'));
    req.event({ type: HttpEventType.UploadProgress, loaded: 1, total: undefined } as any);
    req.flush({ fileId: 'f1', originalName: 'test.wav', durationSeconds: 3, sampleRate: 44100, channels: 1, format: 'wav' });
    await complete$;
    expect((events[0] as { progress: number }).progress).toBe(100);
  });

  it('uploadFile works with a Blob and custom filename', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    const complete$ = new Promise<void>(resolve => {
      svc.uploadFile(blob, 'recording.webm').subscribe({ complete: resolve });
    });
    const req = http.expectOne(r => r.url.includes('/audio/import'));
    req.flush({ fileId: 'f1', originalName: 'recording.webm', durationSeconds: 2, sampleRate: 44100, channels: 1, format: 'webm' });
    await complete$;
  });

  // --- getPeaks ---
  it('getPeaks sends correct URL without optional params', async () => {
    const p = firstValueFrom(svc.getPeaks('fid', 500));
    http.expectOne(r => r.url.includes('/audio/peaks/fid?resolution=500') && !r.url.includes('start'))
      .flush({ fileId: 'fid', peaks: [], resolution: 500 });
    await p;
  });

  it('getPeaks adds start and end params when provided', async () => {
    const p = firstValueFrom(svc.getPeaks('fid', 500, 1, 3));
    http.expectOne(r => r.url.includes('start=1') && r.url.includes('end=3'))
      .flush({ fileId: 'fid', peaks: [], resolution: 500 });
    await p;
  });

  // --- cut / trim / merge / fade / noiseGate ---
  it('cut posts to /audio/cut', async () => {
    const p = firstValueFrom(svc.cut('fid', 1, 3));
    http.expectOne(r => r.url.includes('/audio/cut')).flush({ fileId: 'fid2', durationSeconds: 2 });
    expect(await p).toEqual({ fileId: 'fid2', durationSeconds: 2 });
  });

  it('trim posts to /audio/trim', async () => {
    const p = firstValueFrom(svc.trim('fid', -40, 0.1));
    http.expectOne(r => r.url.includes('/audio/trim')).flush({ fileId: 'f2', durationSeconds: 1 });
    await p;
  });

  it('merge posts to /audio/merge with default crossfade', async () => {
    const p = firstValueFrom(svc.merge(['a', 'b']));
    const req = http.expectOne(r => r.url.includes('/audio/merge'));
    expect(req.request.body.crossfadeDuration).toBe(0);
    req.flush({ fileId: 'merged', durationSeconds: 5 });
    await p;
  });

  it('fade posts to /audio/fade with default curve', async () => {
    const p = firstValueFrom(svc.fade('fid', 0.5, 0.5));
    const req = http.expectOne(r => r.url.includes('/audio/fade'));
    expect(req.request.body.curve).toBe('linear');
    req.flush({ fileId: 'f', durationSeconds: 3 });
    await p;
  });

  it('noiseGate posts to /audio/noise-gate', async () => {
    const p = firstValueFrom(svc.noiseGate('fid', -40, 5, 50));
    http.expectOne(r => r.url.includes('/audio/noise-gate')).flush({ fileId: 'f', durationSeconds: 3 });
    await p;
  });

  // --- export ---
  it('startExport posts to /audio/export', async () => {
    const p = firstValueFrom(svc.startExport([{ fileId: 'f', startTime: 0, volume: 1 }], 'wav'));
    http.expectOne(r => r.url.includes('/audio/export')).flush({ jobId: 'job1' });
    expect(await p).toEqual({ jobId: 'job1' });
  });

  it('downloadExport gets blob from /audio/export/download/:jobId', async () => {
    const p = firstValueFrom(svc.downloadExport('job1'));
    http.expectOne(r => r.url.includes('/audio/export/download/job1'))
      .flush(new Blob(['audio']), { headers: { 'content-type': 'audio/wav' } });
    const blob = await p;
    expect(blob).toBeInstanceOf(Blob);
  });

  // --- deleteFile / sessionCleanup ---
  it('deleteFile sends DELETE request', async () => {
    const p = firstValueFrom(svc.deleteFile('fid'));
    http.expectOne(r => r.method === 'DELETE' && r.url.includes('/audio/file/fid')).flush(null);
    await p;
  });

  it('sessionCleanup posts to /audio/session/cleanup', async () => {
    const p = firstValueFrom(svc.sessionCleanup());
    http.expectOne(r => r.url.includes('/audio/session/cleanup')).flush(null);
    await p;
  });
});
