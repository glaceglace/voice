import { TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TransportPillComponent } from './transport-pill.component';
import { ProjectService } from '../../../core/services/project.service';
import { RecorderService } from '../../../core/services/recorder.service';
import { PlaybackService } from '../../../core/services/playback.service';
import { FileService } from '../../../core/services/file.service';

describe('TransportPillComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<TransportPillComponent>>;
  let comp: TransportPillComponent;
  let project: ProjectService;
  let recorderState: WritableSignal<string>;
  let recorder: {
    state: WritableSignal<string>;
    analyserNode: ReturnType<typeof vi.fn>;
    startRecording: ReturnType<typeof vi.fn>;
    stopRecording: ReturnType<typeof vi.fn>;
    recorded$: any;
    onProcessingDone: ReturnType<typeof vi.fn>;
  };
  let playback: { isPlaying: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
  let fileService: { importBlob: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), fillText: vi.fn(), save: vi.fn(), restore: vi.fn(),
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
      shadowBlur: 0, shadowColor: '',
    } as unknown as CanvasRenderingContext2D);

    recorderState = signal('idle');
    recorder = {
      state: recorderState,
      analyserNode: vi.fn().mockReturnValue(null),
      startRecording: vi.fn().mockResolvedValue(undefined),
      stopRecording: vi.fn(),
      recorded$: { pipe: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }) },
      onProcessingDone: vi.fn(),
    };
    playback = {
      isPlaying: vi.fn().mockReturnValue(false),
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    };
    fileService = { importBlob: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [TransportPillComponent],
      providers: [
        provideAnimationsAsync(),
        { provide: RecorderService, useValue: recorder },
        { provide: PlaybackService, useValue: playback },
        { provide: FileService, useValue: fileService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TransportPillComponent);
    comp = fixture.componentInstance;
    project = TestBed.inject(ProjectService);
    fixture.detectChanges();
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('creates the component', () => {
    expect(comp).toBeTruthy();
  });

  it('rewind stops playback and resets playhead', () => {
    project.setPlayhead(5);
    comp.rewind();
    expect(playback.stop).toHaveBeenCalled();
    expect(project.state().playheadPosition).toBe(0);
  });

  it('togglePlay calls play when not playing', () => {
    comp.togglePlay();
    expect(playback.play).toHaveBeenCalled();
  });

  it('togglePlay calls stop when playing', () => {
    playback.isPlaying.mockReturnValue(true);
    comp.togglePlay();
    expect(playback.stop).toHaveBeenCalled();
  });

  it('startRecording calls recorder.startRecording and subscribes to recorded$', async () => {
    await comp.startRecording();
    expect(recorder.startRecording).toHaveBeenCalled();
  });

  it('startRecording does nothing when no tracks exist', async () => {
    project.removeTrack(project.state().tracks[0].id);
    await comp.startRecording();
    expect(recorder.startRecording).not.toHaveBeenCalled();
  });

  it('stopRecording calls recorder.stopRecording', () => {
    comp.stopRecording();
    expect(recorder.stopRecording).toHaveBeenCalled();
  });

  it('recTooltip names the armed track', () => {
    const trackId = project.state().tracks[0].id;
    project.setTrackArmed(trackId, true);
    expect(comp.recTooltip()).toContain(project.state().tracks[0].name);
  });

  it('recTooltip falls back to generic label when nothing armed', () => {
    expect(comp.recTooltip()).toBe('Record from microphone');
  });

  it('startRecording handles recording callback and calls importBlob', async () => {
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    recorder.recorded$ = {
      pipe: vi.fn().mockReturnValue({
        subscribe: vi.fn().mockImplementation((cb: (val: { blob: Blob; mimeType: string }) => void) => {
          void Promise.resolve().then(() => cb({ blob, mimeType: 'audio/webm' }));
          return { unsubscribe: vi.fn() };
        }),
      }),
    };

    await comp.startRecording();
    await new Promise(r => setTimeout(r, 10));

    expect(fileService.importBlob).toHaveBeenCalledWith(blob, 'recording.webm', expect.any(String));
    expect(recorder.onProcessingDone).toHaveBeenCalled();
  });

  it('startRecording handles mp4 mime type in filename', async () => {
    const blob = new Blob(['audio'], { type: 'audio/mp4' });
    recorder.recorded$ = {
      pipe: vi.fn().mockReturnValue({
        subscribe: vi.fn().mockImplementation((cb: (val: { blob: Blob; mimeType: string }) => void) => {
          void Promise.resolve().then(() => cb({ blob, mimeType: 'audio/mp4' }));
          return { unsubscribe: vi.fn() };
        }),
      }),
    };

    await comp.startRecording();
    await new Promise(r => setTimeout(r, 10));

    expect(fileService.importBlob).toHaveBeenCalledWith(blob, 'recording.mp4', expect.any(String));
  });

  it('shows the recording pill when recorder state is recording', () => {
    recorderState.set('recording');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.pill-recording')).not.toBeNull();
    expect(el.querySelector('.stop-rec-btn')).not.toBeNull();
    expect(el.querySelector('.rec-btn')).toBeNull();
  });

  it('shows recElapsed input in the recording pill', () => {
    comp.recElapsed = '01:23';
    recorderState.set('recording');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.rec-elapsed')?.textContent).toContain('01:23');
  });

  it('shows processing label when recorder state is processing', () => {
    recorderState.set('processing');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.processing')).not.toBeNull();
    expect(el.querySelector('.rec-btn')).toBeNull();
  });

  it('clicking rewind button calls rewind', () => {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.rewind-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(playback.stop).toHaveBeenCalled();
  });

  it('clicking play button calls togglePlay', () => {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.play-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(playback.play).toHaveBeenCalled();
  });

  it('clicking record button calls startRecording when idle', () => {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.rec-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(recorder.startRecording).toHaveBeenCalled();
  });

  it('record button is disabled while playing', () => {
    // Fresh fixture so isPlaying is true from the first change-detection pass;
    // the beforeEach fixture must go first or its stale view trips NG0100.
    fixture.destroy();
    playback.isPlaying.mockReturnValue(true);
    const f2 = TestBed.createComponent(TransportPillComponent);
    f2.detectChanges();
    const recBtn = f2.nativeElement.querySelector('.rec-btn') as HTMLButtonElement;
    expect(recBtn.disabled).toBe(true);
  });

  it('clicking stop-recording button calls stopRecording', () => {
    recorderState.set('recording');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.stop-rec-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(recorder.stopRecording).toHaveBeenCalled();
  });

  it('displays current playhead time', () => {
    project.setPlayhead(0);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.time-value')?.textContent?.trim()).toBeTruthy();
  });
});
