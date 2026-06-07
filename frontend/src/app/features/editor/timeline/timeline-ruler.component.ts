import { Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';

@Component({
  selector: 'app-timeline-ruler',
  standalone: true,
  template: `<canvas #canvas style="width:100%;height:28px;display:block;"></canvas>`,
  styles: [':host { display: block; }'],
})
export class TimelineRulerComponent implements OnChanges {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() zoom = 100;
  @Input() scrollLeft = 0;
  @Input() totalDuration = 0;

  ngOnChanges(): void {
    this.draw();
  }

  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.parentElement?.clientWidth ?? 800;
    const h = 28;
    const dpr = devicePixelRatio;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#13151a';
    ctx.fillRect(0, 0, w, h);

    const startSec = this.scrollLeft / this.zoom;
    const endSec   = startSec + w / this.zoom;

    const intervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
    const minPx = 64;
    const interval = intervals.find(i => i * this.zoom >= minPx) ?? 300;

    ctx.font = '400 9px "DM Mono", monospace';
    ctx.textBaseline = 'middle';

    let t = Math.floor(startSec / interval) * interval;
    while (t <= endSec + interval) {
      const x = (t - startSec) * this.zoom;
      if (x < -30 || x > w + 30) { t = Math.round((t + interval) * 10000) / 10000; continue; }

      const isZero = t < 0.0001;

      // tick
      ctx.strokeStyle = isZero ? 'rgba(232, 168, 56, 0.3)' : 'rgba(232, 168, 56, 0.15)';
      ctx.lineWidth = isZero ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, isZero ? h * 0.3 : h * 0.55);
      ctx.lineTo(x, h);
      ctx.stroke();

      // label
      if (x > 2) {
        ctx.fillStyle = isZero ? 'rgba(232, 168, 56, 0.6)' : 'rgba(200, 180, 140, 0.45)';
        ctx.fillText(this.fmt(t), x + 4, h * 0.38);
      }

      t = Math.round((t + interval) * 10000) / 10000;
    }

    // bottom edge
    ctx.strokeStyle = 'rgba(232, 168, 56, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(w, h - 0.5);
    ctx.stroke();
  }

  private fmt(sec: number): string {
    if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
