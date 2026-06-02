import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { sessionDir, registerFile } from '../services/storage.service';
import type { Request } from 'express';

const MAX_SIZE = 500 * 1024 * 1024; // 500 MB

const ALLOWED_MIMES = new Set([
  'audio/mpeg', 'audio/mp3',
  'audio/wav', 'audio/wave', 'audio/x-wav',
  'audio/aac', 'audio/x-aac',
  'audio/flac', 'audio/x-flac',
  'audio/ogg', 'audio/vorbis',
  'audio/mp4', 'audio/x-m4a',
  'audio/webm', 'video/webm',
  'application/octet-stream', // some browsers send this for audio blobs
]);

const ALLOWED_EXTS = new Set(['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.mp4', '.webm']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, sessionDir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.webm';
    const fileId = uuidv4();
    const filename = `${fileId}${ext}`;
    // register after upload completes — done in controller
    cb(null, filename);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback): void {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
}

export const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

export function extractFileId(filename: string): string {
  return path.basename(filename, path.extname(filename));
}
