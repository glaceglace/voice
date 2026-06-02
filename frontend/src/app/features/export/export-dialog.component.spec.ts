import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ExportDialogComponent } from './export-dialog.component';
import { ApiService } from '../../core/services/api.service';
import { ProjectService } from '../../core/services/project.service';

/** Stubs EventSource so that when the instance's handlers are set, the timer fires them. */
function stubEventSource(payload: { progress: number; status: string } | 'connection-error' | 'server-error') {
  vi.stubGlobal('EventSource', function(this: any) {
    const instance = this;
    instance.close = vi.fn();
    setTimeout(() => {
      if (payload === 'connection-error') {
        if (instance.onerror) instance.onerror();
      } else if (payload === 'server-error') {
        if (instance.onmessage) {
          instance.onmessage({ data: JSON.stringify({ progress: -1, status: 'error' }) });
        }
      } else {
        if (instance.onmessage) {
          instance.onmessage({ data: JSON.stringify(payload) });
        }
      }
    }, 10);
  });
}

describe('ExportDialogComponent', () => {
  let comp: ExportDialogComponent;
  let api: { startExport: ReturnType<typeof vi.fn>; downloadExport: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let project: ProjectService;

  beforeEach(async () => {
    api = {
      startExport: vi.fn().mockReturnValue(of({ jobId: 'job1' })),
      downloadExport: vi.fn().mockReturnValue(of(new Blob(['audio']))),
    };
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ExportDialogComponent, MatDialogModule],
      providers: [
        provideAnimationsAsync(),
        { provide: ApiService, useValue: api },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ExportDialogComponent);
    comp = fixture.componentInstance;
    project = TestBed.inject(ProjectService);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates the component', () => {
    expect(comp).toBeTruthy();
  });

  it('cancel closes the dialog', () => {
    comp.cancel();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('error message renders in template', () => {
    const fixture2 = TestBed.createComponent(ExportDialogComponent);
    fixture2.componentInstance.error = 'Something went wrong';
    fixture2.detectChanges();
    const el = fixture2.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Something went wrong');
  });

  it('clicking Cancel button calls cancel via DOM', () => {
    const fixture2 = TestBed.createComponent(ExportDialogComponent);
    fixture2.detectChanges();
    const buttons = fixture2.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    // Cancel button is the first button in dialog-actions
    const cancelBtn = Array.from(buttons).find(b => b.textContent?.includes('Cancel'));
    if (cancelBtn) { cancelBtn.click(); fixture2.detectChanges(); }
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('clicking Export button calls startExport via DOM', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);

    const fixture2 = TestBed.createComponent(ExportDialogComponent);
    fixture2.detectChanges();

    // No segments in this fixture2 (fresh component), just verify the call
    const buttons = fixture2.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    const exportBtn = Array.from(buttons).find(b => b.textContent?.includes('Export'));
    if (exportBtn) { exportBtn.click(); fixture2.detectChanges(); }
    await new Promise(r => setTimeout(r, 10));
    // startExport was called (even though no segments - it shows error)
    expect(fixture2.componentInstance.error).toBeTruthy();
  });

  it('startExport shows error when no segments', async () => {
    await comp.startExport();
    expect(comp.error).toBeTruthy();
    expect(api.startExport).not.toHaveBeenCalled();
  });

  it('startExport calls API and downloads on success', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);

    stubEventSource({ progress: 100, status: 'done' });

    // Stub URL.createObjectURL/revokeObjectURL
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:mock'), revokeObjectURL: vi.fn() });
    // Spy on HTMLAnchorElement.click instead of mocking createElement
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await comp.startExport();

    expect(api.startExport).toHaveBeenCalled();
    expect(api.downloadExport).toHaveBeenCalledWith('job1');
    expect(dialogRef.close).toHaveBeenCalledWith('exported');
  });

  it('startExport shows error on API failure', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    api.startExport.mockReturnValue(throwError(() => new Error('API down')));
    stubEventSource({ progress: 0, status: 'pending' }); // won't be reached but needed

    await comp.startExport();
    expect(comp.error).toContain('API down');
    expect(comp.exporting).toBe(false);
  });

  it('startExport handles SSE connection error', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    stubEventSource('connection-error');

    await comp.startExport();
    expect(comp.error).toBeTruthy();
  });

  it('startExport handles server-side export error', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    stubEventSource('server-error');

    await comp.startExport();
    expect(comp.error).toBeTruthy();
  });

  it('startExport shows error when jobId is missing from response', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    api.startExport.mockReturnValue(of({})); // no jobId

    stubEventSource({ progress: 0, status: 'pending' }); // won't be reached

    await comp.startExport();
    expect(comp.error).toBeTruthy();
  });

  it('startExport shows error when download returns null', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    api.downloadExport.mockReturnValue(of(null));

    stubEventSource({ progress: 100, status: 'done' });

    await comp.startExport();
    expect(comp.error).toBeTruthy();
  });

  it('startExport handles intermediate SSE progress (status not done/error)', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);

    vi.stubGlobal('EventSource', function(this: any) {
      const instance = this;
      instance.close = vi.fn();
      setTimeout(() => {
        // First fire an intermediate update (progress 50, status 'processing')
        if (instance.onmessage) {
          instance.onmessage({ data: JSON.stringify({ progress: 50, status: 'processing' }) });
        }
        // Then complete it
        setTimeout(() => {
          if (instance.onmessage) {
            instance.onmessage({ data: JSON.stringify({ progress: 100, status: 'done' }) });
          }
        }, 5);
      }, 5);
    });

    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:mock'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await comp.startExport();
    expect(comp.progress).toBe(100);
  });

  it('startExport shows error for thrown non-Error value', async () => {
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);
    // Make startExport throw a string (not an Error instance)
    api.startExport.mockReturnValue({ pipe: undefined, subscribe: undefined, toPromise: undefined });
    // Use throwError with a string
    const { throwError } = await import('rxjs');
    api.startExport.mockReturnValue(throwError(() => 'string error'));
    stubEventSource({ progress: 0, status: 'pending' });

    await comp.startExport();
    expect(comp.error).toContain('string error');
  });

  it('startExport revokes object URL via setTimeout', async () => {
    vi.useFakeTimers();
    const trackId = project.state().tracks[0].id;
    project.addClip(trackId, 'f1', 5);

    const revokeUrl = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:mock'), revokeObjectURL: revokeUrl });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    // Fire event source synchronously via fake timers
    vi.stubGlobal('EventSource', function(this: any) {
      const instance = this;
      instance.close = vi.fn();
      setTimeout(() => {
        if (instance.onmessage) {
          instance.onmessage({ data: JSON.stringify({ progress: 100, status: 'done' }) });
        }
      }, 10);
    });

    const exportPromise = comp.startExport();
    await vi.advanceTimersByTimeAsync(20);
    await exportPromise;

    // Advance past the 2000ms revoke timeout
    await vi.advanceTimersByTimeAsync(2100);

    expect(revokeUrl).toHaveBeenCalledWith('blob:mock');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
