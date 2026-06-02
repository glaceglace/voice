import { TestBed } from '@angular/core/testing';
import { TimelineRulerComponent } from './timeline-ruler.component';

describe('TimelineRulerComponent', () => {
  let ctx2d: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    ctx2d = {
      scale: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
      fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
      lineTo: vi.fn(), stroke: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx2d as unknown as CanvasRenderingContext2D);

    await TestBed.configureTestingModule({
      imports: [TimelineRulerComponent],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates without error', () => {
    const fixture = TestBed.createComponent(TimelineRulerComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('redraws on input changes via setInput', () => {
    const fixture = TestBed.createComponent(TimelineRulerComponent);
    fixture.componentRef.setInput('totalDuration', 10);
    fixture.componentRef.setInput('zoom', 100);
    fixture.detectChanges();
    (ctx2d['fillRect'] as ReturnType<typeof vi.fn>).mockClear();
    fixture.componentRef.setInput('zoom', 200);
    fixture.detectChanges();
    expect(ctx2d['fillRect']).toHaveBeenCalled();
  });

  it('draws with various totalDuration values without error', () => {
    const fixture = TestBed.createComponent(TimelineRulerComponent);
    fixture.componentRef.setInput('totalDuration', 0);
    fixture.detectChanges();
    fixture.componentRef.setInput('totalDuration', 60);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('draws ruler with long duration (>60s) triggering minutes format', () => {
    const fixture = TestBed.createComponent(TimelineRulerComponent);
    // Make canvas parentElement appear wide so ticks render
    const canvasEl = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvasEl.parentElement, 'clientWidth', { value: 1200, configurable: true });

    fixture.componentRef.setInput('totalDuration', 300); // 5 minutes
    fixture.componentRef.setInput('zoom', 100);
    fixture.detectChanges();
    // With w=1200 and zoom=100, we see 12 seconds of ruler; interval=1s; t=0..12
    // fmt(0..12) → "0.0s" etc — all < 60s
    // To get minutes format, use scrollLeft that puts t near 60
    fixture.componentRef.setInput('scrollLeft', 6000); // startSec=60, ticks at 60,61... → "1:00"
    fixture.detectChanges();
    expect(ctx2d['fillText']).toHaveBeenCalled();
  });

  it('draws ruler with zoom=1 to exercise x<=2 branch (skips label)', () => {
    const fixture = TestBed.createComponent(TimelineRulerComponent);
    const canvasEl = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    Object.defineProperty(canvasEl.parentElement, 'clientWidth', { value: 1200, configurable: true });

    fixture.componentRef.setInput('totalDuration', 10);
    fixture.componentRef.setInput('zoom', 1); // very low zoom, first tick at x=0
    fixture.detectChanges();
    // fillRect still called for background
    expect(ctx2d['fillRect']).toHaveBeenCalled();
  });
});
