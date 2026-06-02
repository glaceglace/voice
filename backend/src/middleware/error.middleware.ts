import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[error]', err.message);

  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File exceeds 500MB limit', code: 'FILE_TOO_LARGE' });
    return;
  }

  if (err.message.startsWith('Unsupported file type')) {
    res.status(415).json({ error: err.message, code: 'UNSUPPORTED_FORMAT' });
    return;
  }

  res.status(500).json({ error: err.message || 'Internal server error', code: 'INTERNAL_ERROR' });
}
