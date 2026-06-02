import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudioContextService {
  private _context: AudioContext | null = null;
  readonly context = signal<AudioContext | null>(null);

  getOrCreate(): AudioContext {
    if (!this._context) {
      this._context = new AudioContext();
      this.context.set(this._context);
    }
    if (this._context.state === 'suspended') {
      void this._context.resume();
    }
    return this._context;
  }

  resume(): void {
    if (this._context?.state === 'suspended') {
      void this._context.resume();
    }
  }
}
