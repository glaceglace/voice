import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal, WritableSignal } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { EditorComponent } from './editor.component';
import { RecorderService } from '../../core/services/recorder.service';
import { PlaybackService } from '../../core/services/playback.service';
import { ApiService } from '../../core/services/api.service';
import { FileService } from '../../core/services/file.service';
import { AudioContextService } from '../../core/services/audio-context.service';
import { MatDialog } from '@angular/material/dialog';

describe('EditorComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<EditorComponent>>;
  let comp: EditorComponent;
  let fileService: { importFile: ReturnType<typeof vi.fn> };
  let playback: { isPlaying: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  let api: { sessionCleanup: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let audioCtx: { resume: ReturnType<typeof vi.fn> };
  let recorderState: WritableSignal<string>;

  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), fillText: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    } as unknown as CanvasRenderingContext2D);

    recorderState = signal('idle');
    fileService = { importFile: vi.fn().mockResolvedValue(undefined) };
    playback = {
      isPlaying: vi.fn().mockReturnValue(false),
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };
    api = { sessionCleanup: vi.fn().mockReturnValue(of(null)) };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(null)) }) };
    audioCtx = { resume: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [EditorComponent],
      providers: [
        provideAnimationsAsync(),
        {
          provide: RecorderService,
          useValue: {
            state: recorderState,
            analyserNode: signal(null),
            startRecording: vi.fn(),
            stopRecording: vi.fn(),
            recorded$: { pipe: vi.fn().mockReturnValue({ subscribe: vi.fn() }) },
            onProcessingDone: vi.fn(),
          },
        },
        { provide: PlaybackService, useValue: playback },
        { provide: ApiService, useValue: api },
        { provide: FileService, useValue: fileService },
        { provide: AudioContextService, useValue: { ...audioCtx, getOrCreate: vi.fn(), context: signal(null) } },
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorComponent);
    comp = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('creates the component', () => {
    expect(comp).toBeTruthy();
  });

  it('onInteraction calls audioCtx.resume', () => {
    comp.onInteraction();
    expect(audioCtx.resume).toHaveBeenCalled();
  });

  it('onKeyDown space plays when not playing', () => {
    comp.onKeyDown({ key: ' ', preventDefault: vi.fn(), target: document.body } as unknown as KeyboardEvent);
    expect(playback.play).toHaveBeenCalled();
  });

  it('onKeyDown space stops when playing', () => {
    playback.isPlaying.mockReturnValue(true);
    comp.onKeyDown({ key: ' ', preventDefault: vi.fn(), target: document.body } as unknown as KeyboardEvent);
    expect(playback.stop).toHaveBeenCalled();
  });

  it('onKeyDown space is no-op when target is input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    comp.onKeyDown({ key: ' ', preventDefault: vi.fn(), target: input } as unknown as KeyboardEvent);
    document.body.removeChild(input);
    expect(playback.play).not.toHaveBeenCalled();
  });

  it('onVeDrop imports dropped files', async () => {
    const file = new File(['x'], 'audio.wav');
    const files = [file] as unknown as FileList;
    await comp.onVeDrop(new CustomEvent('ve-drop', { detail: { files } }));
    expect(fileService.importFile).toHaveBeenCalledWith(file);
  });

  it('openExport opens export dialog', async () => {
    await comp.openExport();
    expect(dialog.open).toHaveBeenCalled();
  });

  it('onVeDrop skips undefined entries in FileList', async () => {
    // Build a FileList-like with one defined + one undefined
    const file1 = new File(['x'], 'a.wav');
    const files = { 0: file1, 1: undefined, length: 2 };
    await comp.onVeDrop(new CustomEvent('ve-drop', { detail: { files } }));
    expect(fileService.importFile).toHaveBeenCalledWith(file1);
    expect(fileService.importFile).toHaveBeenCalledTimes(1);
  });

  it('shows recording overlay when recorder state is recording', () => {
    recorderState.set('recording');
    fixture.detectChanges();
    const overlay = fixture.nativeElement.querySelector('.recording-overlay');
    expect(overlay).not.toBeNull();
  });

  it('onBeforeUnload calls sessionCleanup', () => {
    (comp as any).onBeforeUnload();
    expect(api.sessionCleanup).toHaveBeenCalled();
  });

  it('status bar shows plural "tracks" with multiple tracks', async () => {
    const { ProjectService } = await import('../../core/services/project.service');
    const project = TestBed.inject(ProjectService);
    project.addTrack();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('tracks');
  });

  it('ngOnDestroy removes beforeunload listener', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    fixture.destroy();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('ve-drop event calls onVeDrop via DOM', async () => {
    const file = new File(['x'], 'audio.wav');
    const el = fixture.nativeElement.querySelector('.editor-root') as HTMLElement;
    if (el) {
      el.dispatchEvent(new CustomEvent('ve-drop', { detail: { files: [file] }, bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 5));
    expect(fileService.importFile).toHaveBeenCalled();
  });

  it('click on editor-root calls onInteraction via DOM', () => {
    const el = fixture.nativeElement.querySelector('.editor-root') as HTMLElement;
    if (el) { el.click(); fixture.detectChanges(); }
    expect(audioCtx.resume).toHaveBeenCalled();
  });
});
