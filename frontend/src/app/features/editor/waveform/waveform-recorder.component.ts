import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'app-waveform-recorder',
  standalone: true,
  template: `<canvas #canvas style="width:100%;height:100%;display:block;background:#0a0c0e;"></canvas>`,
})
export class WaveformRecorderComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  @Input() analyser: AnalyserNode | null = null;

  private rafId: number | null = null;
  private buf: Float32Array<ArrayBuffer> = new Float32Array(2048);

  ngOnInit(): void {
    this.startDraw();
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  private startDraw(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;

    const draw = (): void => {
      this.rafId = requestAnimationFrame(draw);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);

      ctx.fillStyle = '#0a0c0e';
      ctx.fillRect(0, 0, w, h);

      // center line
      ctx.strokeStyle = 'rgba(232, 168, 56, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (!this.analyser) return;

      this.analyser.getFloatTimeDomainData(this.buf);

      // glow pass
      ctx.save();
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(232, 168, 56, 0.4)';
      ctx.strokeStyle = 'rgba(232, 168, 56, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const sliceW = w / this.buf.length;
      let x = 0;
      for (let i = 0; i < this.buf.length; i++) {
        const y = ((this.buf[i] + 1) / 2) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceW;
      }
      ctx.stroke();
      ctx.restore();
    };

    draw();
  }
}
