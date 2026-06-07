import { TestBed } from '@angular/core/testing';
import { ProjectService } from './project.service';

describe('ProjectService', () => {
  let svc: ProjectService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ProjectService);
  });

  // --- initial state ---
  it('starts with one default track and no clips', () => {
    expect(svc.state().tracks).toHaveLength(1);
    expect(svc.state().tracks[0].clips).toHaveLength(0);
    expect(svc.state().playheadPosition).toBe(0);
    expect(svc.state().zoom).toBe(100);
    expect(svc.state().selection).toBeNull();
    expect(svc.state().isPlaying).toBe(false);
    expect(svc.state().isRecording).toBe(false);
  });

  it('totalDuration is 0 with no clips', () => {
    expect(svc.totalDuration()).toBe(0);
  });

  it('selectedClip is null with no selection', () => {
    expect(svc.selectedClip()).toBeNull();
  });

  it('activeTracks excludes muted tracks', () => {
    svc.setTrackMute(svc.state().tracks[0].id, true);
    expect(svc.activeTracks()).toHaveLength(0);
    svc.setTrackMute(svc.state().tracks[0].id, false);
    expect(svc.activeTracks()).toHaveLength(1);
  });

  // --- tracks ---
  it('addTrack creates a new track', () => {
    svc.addTrack();
    expect(svc.state().tracks).toHaveLength(2);
    expect(svc.state().tracks[1].name).toBe('Track 2');
  });

  it('removeTrack removes a track by id', () => {
    svc.addTrack();
    const id = svc.state().tracks[1].id;
    svc.removeTrack(id);
    expect(svc.state().tracks).toHaveLength(1);
  });

  it('setTrackVolume updates volume', () => {
    const id = svc.state().tracks[0].id;
    svc.setTrackVolume(id, 0.5);
    expect(svc.state().tracks[0].volume).toBe(0.5);
  });

  it('setTrackMute toggles muted flag', () => {
    const id = svc.state().tracks[0].id;
    svc.setTrackMute(id, true);
    expect(svc.state().tracks[0].muted).toBe(true);
  });

  it('setTrackSolo toggles solo flag', () => {
    const id = svc.state().tracks[0].id;
    svc.setTrackSolo(id, true);
    expect(svc.state().tracks[0].solo).toBe(true);
  });

  it('setTrackArmed arms one track and disarms others', () => {
    svc.addTrack();
    const id0 = svc.state().tracks[0].id;
    const id1 = svc.state().tracks[1].id;
    svc.setTrackArmed(id0, true);
    expect(svc.state().tracks[0].armed).toBe(true);
    expect(svc.state().tracks[1].armed).toBe(false);
    // arming a second track disarms the first
    svc.setTrackArmed(id1, true);
    expect(svc.state().tracks[0].armed).toBe(false);
    expect(svc.state().tracks[1].armed).toBe(true);
    // disarming returns all to false
    svc.setTrackArmed(id1, false);
    expect(svc.state().tracks[1].armed).toBe(false);
  });

  it('armedTrackId returns the id of the armed track', () => {
    svc.addTrack();
    expect(svc.armedTrackId()).toBeNull();
    const id = svc.state().tracks[1].id;
    svc.setTrackArmed(id, true);
    expect(svc.armedTrackId()).toBe(id);
  });

  // --- clips ---
  it('addClip adds a clip at the end of the track by default', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'file-1', 5);
    expect(clip.startTime).toBe(0);
    expect(clip.duration).toBe(5);
    expect(clip.isLoading).toBe(true);
    expect(clip.peakData).toBeNull();
  });

  it('addClip uses provided startTime', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'file-2', 3, 10);
    expect(clip.startTime).toBe(10);
  });

  it('addClip uses provided name', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'file-3', 3, undefined, 'my-clip.mp3');
    expect(clip.name).toBe('my-clip.mp3');
  });

  it('addClip defaults name from first 8 chars of fileId', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'abcdefghij', 3);
    expect(clip.name).toBe('abcdefgh');
  });

  it('addClip places second clip after first (trackEndTime)', () => {
    const trackId = svc.state().tracks[0].id;
    svc.addClip(trackId, 'f1', 5);
    const c2 = svc.addClip(trackId, 'f2', 3);
    expect(c2.startTime).toBe(5);
  });

  it('totalDuration computes max clip end time', () => {
    const trackId = svc.state().tracks[0].id;
    svc.addClip(trackId, 'f1', 5);
    expect(svc.totalDuration()).toBe(5);
  });

  it('removeClip removes a clip by id', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'f1', 5);
    svc.removeClip(clip.id);
    expect(svc.state().tracks[0].clips).toHaveLength(0);
  });

  it('setClipPeaks sets peak data and clears loading', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'f1', 5);
    const peaks = [{ min: -0.5, max: 0.5 }];
    svc.setClipPeaks(clip.id, peaks);
    const updated = svc.state().tracks[0].clips[0];
    expect(updated.peakData).toEqual(peaks);
    expect(updated.isLoading).toBe(false);
  });

  it('replaceClip replaces a clip with new clips', () => {
    const trackId = svc.state().tracks[0].id;
    const orig = svc.addClip(trackId, 'f1', 10);
    const newClips = [
      { id: 'c1', trackId, name: 'left', startTime: 0, duration: 5, sourceFileId: 'f2', sourceOffset: 0, peakData: null, isLoading: false },
      { id: 'c2', trackId, name: 'right', startTime: 5, duration: 5, sourceFileId: 'f3', sourceOffset: 0, peakData: null, isLoading: false },
    ];
    svc.replaceClip(orig.id, newClips);
    expect(svc.state().tracks[0].clips).toHaveLength(2);
    expect(svc.state().tracks[0].clips[0].id).toBe('c1');
  });

  it('moveClip changes the start time (clamped to 0)', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'f1', 5);
    svc.moveClip(clip.id, 10);
    expect(svc.state().tracks[0].clips[0].startTime).toBe(10);
    svc.moveClip(clip.id, -5);
    expect(svc.state().tracks[0].clips[0].startTime).toBe(0);
  });

  it('selectedClip returns the selected clip', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'f1', 5);
    svc.setSelection({ clipId: clip.id, start: 0, end: 3 });
    expect(svc.selectedClip()?.id).toBe(clip.id);
  });

  it('selectedClip returns null when clipId not found', () => {
    svc.setSelection({ clipId: 'ghost', start: 0, end: 1 });
    expect(svc.selectedClip()).toBeNull();
  });

  it('getClipById returns undefined for unknown id', () => {
    expect(svc.getClipById('unknown')).toBeUndefined();
  });

  it('getClipById returns clip', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'f1', 5);
    expect(svc.getClipById(clip.id)?.id).toBe(clip.id);
  });

  // --- playback / transport ---
  it('setPlayhead updates position (clamped to 0)', () => {
    svc.setPlayhead(5);
    expect(svc.state().playheadPosition).toBe(5);
    svc.setPlayhead(-1);
    expect(svc.state().playheadPosition).toBe(0);
  });

  it('setPlaying and setRecording update flags', () => {
    svc.setPlaying(true);
    expect(svc.state().isPlaying).toBe(true);
    svc.setPlaying(false);
    svc.setRecording(true);
    expect(svc.state().isRecording).toBe(true);
    svc.setRecording(false);
  });

  it('setZoom clamps between 20 and 500', () => {
    svc.setZoom(1000);
    expect(svc.state().zoom).toBe(500);
    svc.setZoom(5);
    expect(svc.state().zoom).toBe(20);
    svc.setZoom(200);
    expect(svc.state().zoom).toBe(200);
  });

  it('setSelection sets and clears selection', () => {
    svc.setSelection({ clipId: 'x', start: 1, end: 2 });
    expect(svc.state().selection?.clipId).toBe('x');
    svc.setSelection(null);
    expect(svc.state().selection).toBeNull();
  });

  // --- undo ---
  it('undo restores previous state', () => {
    const trackId = svc.state().tracks[0].id;
    svc.addClip(trackId, 'f1', 5);
    expect(svc.state().tracks[0].clips).toHaveLength(1);
    svc.undo();
    expect(svc.state().tracks[0].clips).toHaveLength(0);
  });

  it('canUndo returns true after mutation and false at start', () => {
    expect(svc.canUndo()).toBe(false);
    svc.addTrack();
    expect(svc.canUndo()).toBe(true);
    svc.undo();
    expect(svc.canUndo()).toBe(false);
  });

  it('undo does nothing when history is empty', () => {
    const statesBefore = svc.state().tracks.length;
    svc.undo();
    expect(svc.state().tracks.length).toBe(statesBefore);
  });

  it('replaceClip is a no-op when clipId not found', () => {
    const trackId = svc.state().tracks[0].id;
    svc.addClip(trackId, 'f1', 5);
    const before = svc.state().tracks[0].clips.length;
    svc.replaceClip('nonexistent-id', []);
    expect(svc.state().tracks[0].clips).toHaveLength(before);
  });

  it('setTrackVolume only updates matching track', () => {
    svc.addTrack();
    const id0 = svc.state().tracks[0].id;
    const id1 = svc.state().tracks[1].id;
    svc.setTrackVolume(id0, 0.5);
    expect(svc.state().tracks[0].volume).toBe(0.5);
    expect(svc.state().tracks[1].volume).toBe(1); // unchanged
  });

  it('setTrackMute only updates matching track', () => {
    svc.addTrack();
    const id0 = svc.state().tracks[0].id;
    svc.setTrackMute(id0, true);
    expect(svc.state().tracks[0].muted).toBe(true);
    expect(svc.state().tracks[1].muted).toBe(false); // unchanged
  });

  it('setTrackSolo only updates matching track', () => {
    svc.addTrack();
    const id0 = svc.state().tracks[0].id;
    svc.setTrackSolo(id0, true);
    expect(svc.state().tracks[0].solo).toBe(true);
    expect(svc.state().tracks[1].solo).toBe(false); // unchanged
  });

  it('moveClip is no-op for non-matching clips', () => {
    const trackId = svc.state().tracks[0].id;
    const clip = svc.addClip(trackId, 'f1', 5, 3);
    svc.moveClip('nonexistent-id', 10);
    expect(svc.state().tracks[0].clips[0].startTime).toBe(3); // unchanged
  });
});
