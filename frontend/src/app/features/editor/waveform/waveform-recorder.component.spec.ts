import { TestBed } from '@angular/core/testing';
import { WaveformRecorderComponent } from './waveform-recorder.component';

function stubCanvas() {
  const ctx2d = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx2d as unknown as CanvasRenderingContext2D);
  return ctx2d;
}

describe('WaveformRecorderComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WaveformRecorderComponent],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates without error', () => {
    stubCanvas();
    const fixture = TestBed.createComponent(WaveformRecorderComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('draws background without analyser', () => {
    const ctx2d = stubCanvas();
    const fixture = TestBed.createComponent(WaveformRecorderComponent);
    fixture.componentInstance.analyser = null;
    fixture.detectChanges();
    expect(ctx2d.fillRect).toHaveBeenCalled();
    expect(ctx2d.stroke).not.toHaveBeenCalled();
  });

  it('draws waveform when analyser is provided', () => {
    const ctx2d = stubCanvas();
    const analyser = {
      getFloatTimeDomainData: vi.fn((buf: Float32Array) => {
        buf.fill(0.5);
      }),
    } as unknown as AnalyserNode;
    const fixture = TestBed.createComponent(WaveformRecorderComponent);
    fixture.componentInstance.analyser = analyser;
    fixture.detectChanges();
    expect(ctx2d.stroke).toHaveBeenCalled();
  });

  it('cancels rAF on destroy', () => {
    stubCanvas();
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const fixture = TestBed.createComponent(WaveformRecorderComponent);
    fixture.detectChanges();
    fixture.destroy();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
