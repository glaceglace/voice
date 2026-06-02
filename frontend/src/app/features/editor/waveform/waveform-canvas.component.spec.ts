import { TestBed } from '@angular/core/testing';
import type { PeakSample } from '../../../core/models/project.model';
import { WaveformCanvasComponent } from './waveform-canvas.component';

describe('WaveformCanvasComponent', () => {
  let ctx2d: Record<string, ReturnType<typeof vi.fn> | string | number>;

  beforeEach(async () => {
    ctx2d = {
      scale: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ctx2d as unknown as CanvasRenderingContext2D,
    );

    await TestBed.configureTestingModule({
      imports: [WaveformCanvasComponent],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates without error', () => {
    const fixture = TestBed.createComponent(WaveformCanvasComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('draws loading text when loading=true', () => {
    const fixture = TestBed.createComponent(WaveformCanvasComponent);
    fixture.componentRef.setInput('loading', true);
    fixture.componentRef.setInput('peaks', null);
    fixture.detectChanges();
    expect(ctx2d['fillText']).toHaveBeenCalled();
  });

  it('does nothing when peaks is null and not loading', () => {
    const fixture = TestBed.createComponent(WaveformCanvasComponent);
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('peaks', null);
    fixture.detectChanges();
    expect(ctx2d['fillText']).not.toHaveBeenCalled();
    expect(ctx2d['createLinearGradient']).not.toHaveBeenCalled();
  });

  it('does nothing for empty peaks array', () => {
    const fixture = TestBed.createComponent(WaveformCanvasComponent);
    fixture.componentRef.setInput('peaks', [] as PeakSample[]);
    fixture.detectChanges();
    expect(ctx2d['createLinearGradient']).not.toHaveBeenCalled();
  });

  it('draws waveform gradient from peaks data', () => {
    const fixture = TestBed.createComponent(WaveformCanvasComponent);
    const peaks: PeakSample[] = [{ min: -0.5, max: 0.5 }, { min: -0.3, max: 0.3 }];
    fixture.componentRef.setInput('peaks', peaks);
    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();
    expect(ctx2d['createLinearGradient']).toHaveBeenCalled();
    expect(ctx2d['fillRect']).toHaveBeenCalled();
  });

  it('redraws when peaks input changes', () => {
    const fixture = TestBed.createComponent(WaveformCanvasComponent);
    fixture.componentRef.setInput('peaks', [{ min: -0.5, max: 0.5 }] as PeakSample[]);
    fixture.detectChanges();
    (ctx2d['clearRect'] as ReturnType<typeof vi.fn>).mockClear();
    fixture.componentRef.setInput('peaks', [{ min: -0.3, max: 0.3 }, { min: -0.1, max: 0.1 }] as PeakSample[]);
    fixture.detectChanges();
    expect(ctx2d['clearRect']).toHaveBeenCalled();
  });
});
