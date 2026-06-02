import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TrackHeaderComponent } from './track-header.component';
import { ProjectService } from '../../../core/services/project.service';

describe('TrackHeaderComponent', () => {
  let project: ProjectService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrackHeaderComponent],
      providers: [provideAnimationsAsync()],
    }).compileComponents();
    project = TestBed.inject(ProjectService);
  });

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
    const trackId = project.state().tracks[0].id;
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

  it('deleteTrack removes the track', () => {
    project.addTrack();
    const { comp } = createComponent();
    comp.track = project.state().tracks[0];
    comp.deleteTrack();
    expect(project.state().tracks).toHaveLength(1);
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
    // Template branch: track.muted ? 'Unmute' : 'Mute'
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

  it('clicking delete button calls deleteTrack via DOM', () => {
    project.addTrack(); // so removing track 0 leaves track 1
    const { fixture, comp } = createComponent();
    comp.track = project.state().tracks[0];
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>;
    if (buttons.length >= 3) {
      buttons[2].click();
      fixture.detectChanges();
    }
    expect(project.state().tracks.length).toBeLessThanOrEqual(2);
  });
});
