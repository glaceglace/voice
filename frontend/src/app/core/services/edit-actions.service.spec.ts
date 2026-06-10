import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { EditActionsService } from './edit-actions.service';
import { ProjectService } from './project.service';
import { ApiService } from './api.service';
import type { PeakSample } from '../models/project.model';

describe('EditActionsService', () => {
  let service: EditActionsService;
  let project: ProjectService;
  let api: { cut: ReturnType<typeof vi.fn>; getPeaks: ReturnType<typeof vi.fn> };

  const peaks = (n: number): PeakSample[] =>
    Array.from({ length: n }, () => ({ min: -0.5, max: 0.5 }));

  beforeEach(() => {
    localStorage.clear();
    api = {
      cut: vi.fn().mockImplementation((_fileId: string, from: number, to: number) =>
        of({ fileId: `cut-${from}-${to}`, durationSeconds: to - from })),
      getPeaks: vi.fn().mockReturnValue(of({ fileId: 'cut-id', peaks: peaks(10), resolution: 1000 })),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: api }],
    });
    service = TestBed.inject(EditActionsService);
    project = TestBed.inject(ProjectService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('does nothing when there is no selection', async () => {
    await service.cutSelection();
    expect(api.cut).not.toHaveBeenCalled();
  });

  it('does nothing when the selected clip no longer exists', async () => {
    project.setSelection({ clipId: 'ghost-id', start: 0, end: 1 });
    await service.cutSelection();
    expect(api.cut).not.toHaveBeenCalled();
  });

  it('case A: removes the clip when the entire clip is selected', async () => {
    const trackId = project.state().tracks[0].id;
    const clip = project.addClip(trackId, 'src-file', 10);
    project.setSelection({ clipId: clip.id, start: 0, end: 10 });

    await service.cutSelection();

    expect(api.cut).not.toHaveBeenCalled();
    expect(project.state().tracks[0].clips).toHaveLength(0);
    expect(project.state().selection).toBeNull();
    expect(project.state().playheadPosition).toBe(0);
  });

  it('case B: splits into two clips when the middle is cut', async () => {
    const trackId = project.state().tracks[0].id;
    const clip = project.addClip(trackId, 'src-file', 10);
    project.setClipPeaks(clip.id, peaks(100));
    project.setSelection({ clipId: clip.id, start: 2, end: 5 });

    await service.cutSelection();

    expect(api.cut).toHaveBeenCalledTimes(2);
    const clips = project.state().tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].duration).toBeCloseTo(2);
    expect(clips[1].duration).toBeCloseTo(5);
    expect(clips[1].startTime).toBeCloseTo(2);
    expect(project.state().selection).toBeNull();
  });

  it('case B: falls back to sliced peaks and re-fetch when backend returns no peaks', async () => {
    const trackId = project.state().tracks[0].id;
    const clip = project.addClip(trackId, 'src-file', 10);
    project.setClipPeaks(clip.id, peaks(100));
    project.setSelection({ clipId: clip.id, start: 2, end: 5 });

    // No `peaks` field in cut result → finalizePeaks path with getPeaks
    api.cut.mockImplementation((_f: string, from: number, to: number) =>
      of({ fileId: `cut-${from}-${to}`, durationSeconds: to - from }));

    await service.cutSelection();

    expect(api.getPeaks).toHaveBeenCalledTimes(2);
    const clips = project.state().tracks[0].clips;
    expect(clips[0].peakData?.length).toBeGreaterThan(0);
  });

  it('case B: uses backend peaks directly when provided', async () => {
    const trackId = project.state().tracks[0].id;
    const clip = project.addClip(trackId, 'src-file', 10);
    project.setClipPeaks(clip.id, peaks(100));
    project.setSelection({ clipId: clip.id, start: 2, end: 5 });

    api.cut.mockImplementation((_f: string, from: number, to: number) =>
      of({ fileId: `cut-${from}-${to}`, durationSeconds: to - from, peaks: peaks(20) }));

    await service.cutSelection();

    expect(api.getPeaks).not.toHaveBeenCalled();
    expect(project.state().tracks[0].clips[0].peakData).toHaveLength(20);
  });

  it('case C: keeps the left portion when the selection reaches the clip end', async () => {
    const trackId = project.state().tracks[0].id;
    const clip = project.addClip(trackId, 'src-file', 10);
    project.setClipPeaks(clip.id, peaks(100));
    project.setSelection({ clipId: clip.id, start: 6, end: 10 });

    await service.cutSelection();

    const clips = project.state().tracks[0].clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].duration).toBeCloseTo(6);
    expect(clips[0].startTime).toBe(0);
    // Optimistic peaks derived by slicing the original
    expect(clips[0].peakData?.length).toBeGreaterThan(0);
    expect(api.cut).toHaveBeenCalledTimes(1);
  });

  it('case C: marks clip as loading when no source peaks to slice', async () => {
    const trackId = project.state().tracks[0].id;
    const clip = project.addClip(trackId, 'src-file', 10);
    project.setSelection({ clipId: clip.id, start: 6, end: 10 });

    await service.cutSelection();

    // After cut + getPeaks finalization, peaks land on the new clip
    const clips = project.state().tracks[0].clips;
    expect(clips[0].peakData).toHaveLength(10);
    expect(clips[0].isLoading).toBe(false);
  });

  it('case D: keeps the right portion when the selection starts at the clip start', async () => {
    const trackId = project.state().tracks[0].id;
    const clip = project.addClip(trackId, 'src-file', 10);
    project.setClipPeaks(clip.id, peaks(100));
    project.setSelection({ clipId: clip.id, start: 0, end: 4 });

    await service.cutSelection();

    const clips = project.state().tracks[0].clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].duration).toBeCloseTo(6);
    expect(project.state().playheadPosition).toBe(0);
    expect(api.cut).toHaveBeenCalledTimes(1);
  });

  it('case D: works for clips not starting at time 0 with a source offset', async () => {
    const trackId = project.state().tracks[0].id;
    const clip = project.addClip(trackId, 'src-file', 10, 5);
    project.state().tracks[0].clips[0];
    project.setClipPeaks(clip.id, peaks(100));
    // Selection covers 5..8 on the timeline → first 3s of the clip
    project.setSelection({ clipId: clip.id, start: 5, end: 8 });

    await service.cutSelection();

    const clips = project.state().tracks[0].clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].startTime).toBe(5);
    expect(clips[0].duration).toBeCloseTo(7);
    // After the backend cut resolves, the clip points at the new file from offset 0
    expect(clips[0].sourceOffset).toBe(0);
    expect(clips[0].sourceFileId).toContain('cut-');
  });
});
