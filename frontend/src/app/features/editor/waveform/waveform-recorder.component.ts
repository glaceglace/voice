import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, effect } from '@angular/core';

@Component({
  selector: 'app-waveform-recorder',
  standalone: true,
  template: `<canvas #canvas style="width:100%;height:100%;display:block;background:#0a0a0a;"></canvas>`,
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

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, w, h);

      if (!this.analyser) return;

      this.analyser.getFloatTimeDomainData(this.buf);

      ctx.strokeStyle = '#4caf50';
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
    };

    draw();
  }
}
