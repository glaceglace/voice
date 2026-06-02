import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import type { PeakSample } from '../../../core/models/project.model';

@Component({
  selector: 'app-waveform-canvas',
  standalone: true,
  template: `<canvas #canvas style="width:100%;height:100%;display:block;"></canvas>`,
})
export class WaveformCanvasComponent implements OnChanges {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() peaks: PeakSample[] | null = null;
  @Input() color = '#1a73e8';
  @Input() loading = false;
  @Input() amplitudeScale = 1.0;

  ngOnChanges(_changes: SimpleChanges): void {
    this.draw();
  }

  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement!;
    const w = Math.max(parent.clientWidth || 200, 2);
    const h = Math.max(parent.clientHeight || 60, 2);
    const dpr = devicePixelRatio;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // background — transparent so clip-block bg shows
    ctx.clearRect(0, 0, w, h);

    if (this.loading) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px Roboto, sans-serif';
      ctx.fillText('Loading…', 6, h / 2 + 4);
      return;
    }

    if (!this.peaks?.length) return;

    const peaks = this.peaks;
    const mid = h / 2;
    const step = w / peaks.length;

    // gradient fill — track color fading to transparent
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, this.hexToRgba(this.color, 0.7));
    grad.addColorStop(0.5, this.hexToRgba(this.color, 0.4));
    grad.addColorStop(1, this.hexToRgba(this.color, 0.7));

    ctx.fillStyle = grad;
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const scaledMax = Math.max(-1, Math.min(1, peaks[i].max * this.amplitudeScale));
      const scaledMin = Math.max(-1, Math.min(1, peaks[i].min * this.amplitudeScale));
      const topY = mid - scaledMax * mid;
      const botY = mid - scaledMin * mid;
      ctx.fillRect(x, topY, Math.max(1, step - 0.3), Math.max(1, botY - topY));
    }

    // bright peak line
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
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
