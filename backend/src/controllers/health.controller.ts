import type { Request, Response } from 'express';
import { execSync } from 'child_process';

function isFfmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function health(_req: Request, res: Response): void {
  res.json({ status: 'ok', ffmpegAvailable: isFfmpegAvailable() });
}
