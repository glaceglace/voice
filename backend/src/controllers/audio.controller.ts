import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import * as ffmpegService from '../services/ffmpeg.service';
import * as storageService from '../services/storage.service';
import { extractFileId } from '../middleware/upload.middleware';
import type {
  CutRequest, TrimRequest, MergeRequest, FadeRequest,
  NoiseGateRequest, ExportRequest, ExportJob,
} from '../types/audio.types';

const exportJobs = new Map<string, ExportJob & { clients: Response[] }>();

function qs(req: Request): Record<string, string | undefined> {
  return req.query as unknown as Record<string, string | undefined>;
}

function param(req: Request, key: string): string {
  return String(req.params[key] ?? '');
}

export async function importAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
      return;
    }
    const fileId = extractFileId(req.file.filename);
    let filePath = req.file.path;
    let probe = await ffmpegService.probeDuration(filePath);

    if (!probe.durationSeconds || !isFinite(probe.durationSeconds)) {
      const fixed = await ffmpegService.normalizeAudio(filePath);
      filePath = fixed.outputPath;
      probe = await ffmpegService.probeDuration(filePath);
    }

    storageService.registerFile(fileId, filePath, req.file.originalname);
    res.json({ fileId, originalName: req.file.originalname, ...probe });
  } catch (err) {
    next(err);
  }
}

export async function getPeaks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const fileId = param(req, 'fileId');
    const q = qs(req);
    const resolution = parseInt(q['resolution'] ?? '1000', 10);
    const start = q['start'] ? parseFloat(q['start']) : undefined;
    const end = q['end'] ? parseFloat(q['end']) : undefined;

    const filePath = storageService.getFilePath(fileId);
    if (!filePath) { res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' }); return; }

    const data = await ffmpegService.extractPeaks(filePath, resolution, start, end);
    res.json({ ...data, fileId });
  } catch (err) {
    next(err);
  }
}

export async function cutAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileId, start, end, resolution } = req.body as CutRequest;
    const filePath = storageService.getFilePath(fileId);
    if (!filePath) { res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' }); return; }

    const result = await ffmpegService.cut(filePath, start, end, resolution);
    const newId = extractFileId(path.basename(result.outputPath));
    storageService.registerFile(newId, result.outputPath, newId);
    res.json({ fileId: newId, durationSeconds: result.durationSeconds, peaks: result.peaks?.peaks });
  } catch (err) {
    next(err);
  }
}

export async function trimAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileId, silenceThreshold, minSilenceDuration } = req.body as TrimRequest;
    const filePath = storageService.getFilePath(fileId);
    if (!filePath) { res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' }); return; }

    const result = await ffmpegService.trim(filePath, silenceThreshold, minSilenceDuration);
    const newId = extractFileId(path.basename(result.outputPath));
    storageService.registerFile(newId, result.outputPath, newId);
    res.json({ fileId: newId, durationSeconds: result.durationSeconds });
  } catch (err) {
    next(err);
  }
}

export async function mergeAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileIds, crossfadeDuration = 0 } = req.body as MergeRequest;
    const filePaths: string[] = [];
    for (const id of fileIds) {
      const p = storageService.getFilePath(id);
      if (!p) { res.status(404).json({ error: `File not found: ${id}`, code: 'FILE_NOT_FOUND' }); return; }
      filePaths.push(p);
    }
    const result = await ffmpegService.merge(filePaths, crossfadeDuration);
    const newId = extractFileId(path.basename(result.outputPath));
    storageService.registerFile(newId, result.outputPath, newId);
    res.json({ fileId: newId, durationSeconds: result.durationSeconds });
  } catch (err) {
    next(err);
  }
}

export async function fadeAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileId, fadeInDuration, fadeOutDuration, curve = 'linear' } = req.body as FadeRequest;
    const filePath = storageService.getFilePath(fileId);
    if (!filePath) { res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' }); return; }

    const probe = await ffmpegService.probeDuration(filePath);
    const result = await ffmpegService.fade(filePath, fadeInDuration, fadeOutDuration, curve, probe.durationSeconds);
    const newId = extractFileId(path.basename(result.outputPath));
    storageService.registerFile(newId, result.outputPath, newId);
    res.json({ fileId: newId, durationSeconds: result.durationSeconds });
  } catch (err) {
    next(err);
  }
}

export async function noiseGateAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { fileId, thresholdDb, attackMs, releaseMs } = req.body as NoiseGateRequest;
    const filePath = storageService.getFilePath(fileId);
    if (!filePath) { res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' }); return; }

    const result = await ffmpegService.noiseGate(filePath, thresholdDb, attackMs, releaseMs);
    const newId = extractFileId(path.basename(result.outputPath));
    storageService.registerFile(newId, result.outputPath, newId);
    res.json({ fileId: newId, durationSeconds: result.durationSeconds });
  } catch (err) {
    next(err);
  }
}

export async function startExport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { segments, format } = req.body as ExportRequest;

    for (const seg of segments) {
      if (!storageService.getFilePath(seg.fileId)) {
        res.status(404).json({ error: `File not found: ${seg.fileId}`, code: 'FILE_NOT_FOUND' });
        return;
      }
    }

    const jobId = uuidv4();
    const job: ExportJob & { clients: Response[] } = {
      jobId, status: 'pending', progress: 0, format, clients: [],
    };
    exportJobs.set(jobId, job);
    res.status(202).json({ jobId });

    const segPaths = segments.map(seg => ({
      filePath: storageService.getFilePath(seg.fileId)!,
      volume: seg.volume,
      startTime: seg.startTime,
    }));
    const ext = format === 'm4a' ? 'm4a' : format === 'aac' ? 'aac' : format;
    const outputPath = path.join(storageService.exportsDir(), `${jobId}.${ext}`);
    job.status = 'processing';

    ffmpegService.exportMix(segPaths, format, outputPath, (pct) => {
      job.progress = pct;
      broadcastProgress(job, pct);
    }).then(() => {
      job.status = 'done';
      job.progress = 100;
      job.outputPath = outputPath;
      broadcastProgress(job, 100);
      closeClients(job);
      setTimeout(() => {
        exportJobs.delete(jobId);
        try { fs.unlinkSync(outputPath); } catch { /* ok */ }
      }, 10 * 60 * 1000);
    }).catch((err: Error) => {
      job.status = 'error';
      job.error = err.message;
      broadcastProgress(job, -1);
      closeClients(job);
    });
  } catch (err) {
    next(err);
  }
}

export function exportProgress(req: Request, res: Response): void {
  const jobId = param(req, 'jobId');
  const job = exportJobs.get(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ progress: job.progress, status: job.status })}\n\n`);

  if (job.status === 'done' || job.status === 'error') {
    res.end();
    return;
  }

  job.clients.push(res);
  req.on('close', () => {
    const idx = job.clients.indexOf(res);
    if (idx !== -1) job.clients.splice(idx, 1);
  });
}

export function downloadExport(req: Request, res: Response): void {
  const jobId = param(req, 'jobId');
  const job = exportJobs.get(jobId);

  if (!job || job.status !== 'done' || !job.outputPath) {
    res.status(404).json({ error: 'Export not ready', code: 'NOT_READY' });
    return;
  }

  const filename = `voice-export.${job.format ?? 'wav'}`;
  res.download(job.outputPath, filename);
}

export async function serveRawFile(req: Request, res: Response): Promise<void> {
  const filePath = storageService.getFilePath(param(req, 'fileId'));
  if (!filePath) { res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' }); return; }
  res.sendFile(path.resolve(filePath));
}

export async function serveSegment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = qs(req);
    const fileId = param(req, 'fileId');
    const start = parseFloat(q['start'] ?? '0');
    const duration = parseFloat(q['duration'] ?? '30');

    const filePath = storageService.getFilePath(fileId);
    if (!filePath) { res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' }); return; }

    const result = await ffmpegService.cut(filePath, start, start + duration);
    const newId = extractFileId(path.basename(result.outputPath));
    storageService.registerFile(newId, result.outputPath, newId);
    res.sendFile(path.resolve(result.outputPath), () => {
      storageService.deleteFile(newId);
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteFileHandler(req: Request, res: Response): Promise<void> {
  storageService.deleteFile(param(req, 'fileId'));
  res.status(204).send();
}

export function sessionCleanup(_req: Request, res: Response): void {
  storageService.cleanupAllFiles();
  res.status(204).send();
}

function broadcastProgress(job: ExportJob & { clients: Response[] }, pct: number): void {
  const data = `data: ${JSON.stringify({ progress: pct, status: job.status })}\n\n`;
  for (const client of job.clients) {
    try { client.write(data); } catch { /* disconnected */ }
  }
}

function closeClients(job: ExportJob & { clients: Response[] }): void {
  for (const client of job.clients) {
    try { client.end(); } catch { /* ok */ }
  }
  job.clients = [];
}
