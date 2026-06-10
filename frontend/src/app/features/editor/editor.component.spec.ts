import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal, WritableSignal } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { EditorComponent } from './editor.component';
import { ProjectService } from '../../core/services/project.service';
import { RecorderService } from '../../core/services/recorder.service';
import { PlaybackService } from '../../core/services/playback.service';
import { ApiService } from '../../core/services/api.service';
import { FileService } from '../../core/services/file.service';
import { AudioContextService } from '../../core/services/audio-context.service';
import { MatDialog } from '@angular/material/dialog';

describe('EditorComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<EditorComponent>>;
  let comp: EditorComponent;
  let project: ProjectService;
  let fileService: { importFile: ReturnType<typeof vi.fn>; importBlob: ReturnType<typeof vi.fn> };
  let playback: { isPlaying: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  let api: { sessionCleanup: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let audioCtx: { resume: ReturnType<typeof vi.fn> };
  let recorderState: WritableSignal<string>;

  beforeEach(async () => {
    localStorage.clear();

    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), fill: vi.fn(), arc: vi.fn(), fillText: vi.fn(), save: vi.fn(), restore: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
      shadowBlur: 0, shadowColor: '', textBaseline: '',
    } as unknown as CanvasRenderingContext2D);

    recorderState = signal('idle');
    fileService = {
      importFile: vi.fn().mockResolvedValue(undefined),
      importBlob: vi.fn().mockResolvedValue(undefined),
    };
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
            startRecording: vi.fn().mockResolvedValue(undefined),
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
    project = TestBed.inject(ProjectService);
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

  it('onVeDrop skips undefined entries in FileList', async () => {
    const file1 = new File(['x'], 'a.wav');
    const files = { 0: file1, 1: undefined, length: 2 };
    await comp.onVeDrop(new CustomEvent('ve-drop', { detail: { files } }));
    expect(fileService.importFile).toHaveBeenCalledWith(file1);
    expect(fileService.importFile).toHaveBeenCalledTimes(1);
  });

  it('openExport opens export dialog', async () => {
    await comp.openExport();
    expect(dialog.open).toHaveBeenCalled();
  });

  it('onBeforeUnload calls sessionCleanup', () => {
    (comp as any).onBeforeUnload();
    expect(api.sessionCleanup).toHaveBeenCalled();
  });

  it('ngOnDestroy removes beforeunload listener', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    fixture.destroy();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('ve-drop event calls onVeDrop via DOM', async () => {
    const file = new File(['x'], 'audio.wav');
    const el = fixture.nativeElement.querySelector('.editor-root') as HTMLElement;
    el.dispatchEvent(new CustomEvent('ve-drop', { detail: { files: [file] }, bubbles: true }));
    await new Promise(r => setTimeout(r, 5));
    expect(fileService.importFile).toHaveBeenCalled();
  });

  it('click on editor-root calls onInteraction via DOM', () => {
    const el = fixture.nativeElement.querySelector('.editor-root') as HTMLElement;
    el.click();
    fixture.detectChanges();
    expect(audioCtx.resume).toHaveBeenCalled();
  });

  // ── hero empty state ──────────────────────────────────────────────────────

  it('shows the hero when the project is empty and idle', () => {
    expect(comp.showHero()).toBe(true);
    expect(fixture.nativeElement.querySelector('.hero')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-rec')).not.toBeNull();
  });

  it('hides the hero once a clip exists', () => {
    project.addClip(project.state().tracks[0].id, 'f1', 5);
    fixture.detectChanges();
    expect(comp.showHero()).toBe(false);
    expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
  });

  it('hides the hero while recording', () => {
    recorderState.set('recording');
    fixture.detectChanges();
    expect(comp.showHero()).toBe(false);
    expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
  });

  it('parks the transport pill while the hero is visible', () => {
    const pill = fixture.nativeElement.querySelector('app-transport-pill') as HTMLElement;
    expect(pill.classList.contains('pill-parked')).toBe(true);
  });

  it('un-parks the transport pill once content exists', () => {
    project.addClip(project.state().tracks[0].id, 'f1', 5);
    fixture.detectChanges();
    const pill = fixture.nativeElement.querySelector('app-transport-pill') as HTMLElement;
    expect(pill.classList.contains('pill-parked')).toBe(false);
  });

  it('shows corner actions only when the project has content', () => {
    expect(fixture.nativeElement.querySelector('app-corner-actions')).toBeNull();
    project.addClip(project.state().tracks[0].id, 'f1', 5);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-corner-actions')).not.toBeNull();
  });

  it('hero record button starts recording through the pill', () => {
    const spy = vi.spyOn(comp.pill!, 'startRecording').mockResolvedValue(undefined);
    (fixture.nativeElement.querySelector('.hero-rec') as HTMLElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('startFirstRecording tolerates a missing pill reference', () => {
    comp.pill = undefined;
    expect(() => comp.startFirstRecording()).not.toThrow();
  });

  // ── browse ────────────────────────────────────────────────────────────────

  it('browse opens a file picker and imports the chosen file', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const origCreate = document.createElement.bind(document);
    let inputEl: HTMLInputElement | undefined;
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') inputEl = el as HTMLInputElement;
      return el;
    }) as typeof document.createElement);

    comp.browse();
    expect(clickSpy).toHaveBeenCalled();

    const file = new File(['x'], 'a.wav');
    Object.defineProperty(inputEl!, 'files', { value: [file] });
    inputEl!.onchange!(new Event('change'));
    expect(fileService.importFile).toHaveBeenCalledWith(file);
  });

  it('browse does nothing when no file is chosen', () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const origCreate = document.createElement.bind(document);
    let inputEl: HTMLInputElement | undefined;
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') inputEl = el as HTMLInputElement;
      return el;
    }) as typeof document.createElement);

    comp.browse();
    Object.defineProperty(inputEl!, 'files', { value: null });
    inputEl!.onchange!(new Event('change'));
    expect(fileService.importFile).not.toHaveBeenCalled();
  });

  // ── recording timer ───────────────────────────────────────────────────────

  it('recElapsedFormatted starts at 00:00', () => {
    expect(comp.recElapsedFormatted()).toBe('00:00');
  });

  it('recording timer ticks elapsed seconds and resets when stopped', () => {
    vi.useFakeTimers();
    recorderState.set('recording');
    fixture.detectChanges();
    vi.advanceTimersByTime(2100);
    expect(comp.recElapsedFormatted()).toBe('00:02');

    recorderState.set('idle');
    fixture.detectChanges();
    expect(comp.recElapsedFormatted()).toBe('00:00');
    vi.useRealTimers();
  });
});
