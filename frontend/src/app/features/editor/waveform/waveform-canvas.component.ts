import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import type { PeakSample } from '../../../core/models/project.model';

@Component({
  selector: 'app-waveform-canvas',
  standalone: true,
  styles: [`:host { display: block; width: 100%; height: 100%; }`],
  template: `<canvas #canvas style="width:100%;height:100%;display:block;"></canvas>`,
})
export class WaveformCanvasComponent implements OnChanges, OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() peaks: PeakSample[] | null = null;
  @Input() color = '#e8a838';
  @Input() loading = false;
  @Input() amplitudeScale = 1.0;

  private resizeObserver!: ResizeObserver;

  ngOnInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.canvasRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.draw();
  }

  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const w = Math.max(canvas.offsetWidth || 200, 2);
    const h = Math.max(canvas.offsetHeight || 60, 2);
    const dpr = devicePixelRatio;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    if (this.loading) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(0, 0, w, h);

      const dotCount = Math.floor(w / 10);
      ctx.fillStyle = this.hexToRgba(this.color, 0.2);
      for (let i = 0; i < dotCount; i++) {
        const x = i * 10 + 5;
        const y = h / 2;
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    if (!this.peaks?.length) return;

    const peaks = this.peaks;
    const mid = h / 2;
    const step = w / peaks.length;

    // ── fill bars ──
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const scaledMax = Math.max(-1, Math.min(1, peaks[i].max * this.amplitudeScale));
      const scaledMin = Math.max(-1, Math.min(1, peaks[i].min * this.amplitudeScale));
      const topY = mid - scaledMax * mid;
      const botY = mid - scaledMin * mid;
      const barH = Math.max(1, botY - topY);
      const barW = Math.max(1, step - 0.5);

      // per-bar vertical gradient: bright in center, fade toward extremes
      const barGrad = ctx.createLinearGradient(0, topY, 0, topY + barH);
      barGrad.addColorStop(0,   this.hexToRgba(this.color, 0.3));
      barGrad.addColorStop(0.5, this.hexToRgba(this.color, 0.65));
      barGrad.addColorStop(1,   this.hexToRgba(this.color, 0.3));
      ctx.fillStyle = barGrad;
      ctx.fillRect(x, topY, barW, barH);
    }

    // ── bright top peak outline with glow ──
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = this.hexToRgba(this.color, 0.55);
    ctx.strokeStyle = this.hexToRgba(this.color, 0.95);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step + step / 2;
      const scaledMax = Math.max(-1, Math.min(1, peaks[i].max * this.amplitudeScale));
      const y = mid - scaledMax * mid;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // ── dim bottom peak outline ──
    ctx.strokeStyle = this.hexToRgba(this.color, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step + step / 2;
      const scaledMin = Math.max(-1, Math.min(1, peaks[i].min * this.amplitudeScale));
      const y = mid - scaledMin * mid;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ── center line ──
    ctx.strokeStyle = this.hexToRgba(this.color, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
