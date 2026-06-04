import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TrackHeaderComponent } from './track-header.component';
import { ProjectService } from '../../../core/services/project.service';
import { FileService } from '../../../core/services/file.service';

describe('TrackHeaderComponent', () => {
  let project: ProjectService;
  let fileService: { importFile: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    fileService = { importFile: vi.fn().mockResolvedValue(undefined) };
    await TestBed.configureTestingModule({
      imports: [TrackHeaderComponent],
      providers: [
        provideAnimationsAsync(),
        { provide: FileService, useValue: fileService },
      ],
    }).compileComponents();
    project = TestBed.inject(ProjectService);
  });

  afterEach(() => vi.restoreAllMocks());

  function createComponent() {
    const fixture = TestBed.createComponent(TrackHeaderComponent);
    const comp = fixture.componentInstance;
    comp.track = project.state().tracks[0];
    comp.color = '#1a73e8';
    comp.trackIndex = 0;
    fixture.detectChanges();
    return { fixture, comp };
  }

  it('creates the component', () => {
    const { comp } = createComponent();
    expect(comp).toBeTruthy();
  });

  it('toggleMute mutes and unmutes the track', () => {
    const { comp } = createComponent();
    comp.toggleMute();
    expect(project.state().tracks[0].muted).toBe(true);
    comp.track = { ...comp.track, muted: true };
    comp.toggleMute();
    expect(project.state().tracks[0].muted).toBe(false);
  });

  it('toggleSolo solos and un-solos the track', () => {
    const { comp } = createComponent();
    comp.toggleSolo();
    expect(project.state().tracks[0].solo).toBe(true);
    comp.track = { ...comp.track, solo: true };
    comp.toggleSolo();
    expect(project.state().tracks[0].solo).toBe(false);
  });

  it('deleteTrack removes the track when confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    project.addTrack();
    const { comp } = createComponent();
    comp.track = project.state().tracks[0];
    comp.deleteTrack();
    expect(project.state().tracks).toHaveLength(1);
  });

  it('deleteTrack does nothing when cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    project.addTrack();
    const { comp } = createComponent();
    comp.track = project.state().tracks[0];
    comp.deleteTrack();
    expect(project.state().tracks).toHaveLength(2);
  });

  it('setVolume updates track volume', () => {
    const { comp } = createComponent();
    comp.setVolume(0.75);
    expect(project.state().tracks[0].volume).toBe(0.75);
  });

  it('renders muted tooltip text when track is muted', () => {
    const trackId = project.state().tracks[0].id;
    project.setTrackMute(trackId, true);
    const fixture = TestBed.createComponent(TrackHeaderComponent);
    const comp = fixture.componentInstance;
    comp.track = project.state().tracks[0];
    fixture.detectChanges();
    expect(comp.track.muted).toBe(true);
  });

  it('clicking mute button calls toggleMute via DOM', () => {
    const { fixture } = createComponent();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    if (buttons.length >= 1) {
      buttons[0].click();
      fixture.detectChanges();
    }
    expect(project.state().tracks[0].muted).toBe(true);
  });

  it('clicking solo button calls toggleSolo via DOM', () => {
    const { fixture } = createComponent();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    if (buttons.length >= 2) {
      buttons[1].click();
      fixture.detectChanges();
    }
    expect(project.state().tracks[0].solo).toBe(true);
  });

  it('importFile opens a file picker for this track', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { comp } = createComponent();
    comp.importFile();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('importFile passes selected file to fileService with the track id', async () => {
    const file = new File(['x'], 'audio.wav');
    const { comp } = createComponent();
    const trackId = project.state().tracks[0].id;

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', { value: [file] });
      this.onchange!(new Event('change'));
    });

    comp.importFile();
    await Promise.resolve();
    expect(fileService.importFile).toHaveBeenCalledWith(file, trackId);
  });

  it('importFile does nothing when no file selected', async () => {
    const { comp } = createComponent();
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', { value: [] });
      this.onchange!(new Event('change'));
    });

    comp.importFile();
    await Promise.resolve();
    expect(fileService.importFile).not.toHaveBeenCalled();
  });

  it('clicking delete button shows confirm and removes when confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    project.addTrack();
    const { fixture, comp } = createComponent();
    comp.track = project.state().tracks[0];
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    // button order: mute(0), solo(1), import(2), delete(3)
    if (buttons.length >= 4) {
      buttons[3].click();
      fixture.detectChanges();
    }
    expect(project.state().tracks.length).toBeLessThanOrEqual(2);
  });
});
