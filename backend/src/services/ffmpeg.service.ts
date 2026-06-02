import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { config } from '../config';
import type { PeakData, InternalOpResult } from '../types/audio.types';
import { sessionDir } from './storage.service';
import { v4 as uuidv4 } from 'uuid';

if (config.ffmpegPath) {
  ffmpeg.setFfmpegPath(config.ffmpegPath);
}

function outPath(ext: string): string {
  return path.join(sessionDir(), `${uuidv4()}_op.${ext}`);
}

function extOf(filePath: string): string {
  return path.extname(filePath).slice(1) || 'wav';
}

function runFfmpeg(cmd: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

export async function probeDuration(filePath: string): Promise<{ durationSeconds: number; sampleRate: number; channels: number; format: string }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err);
      const stream = meta.streams.find(s => s.codec_type === 'audio');
      const fmtDur = parseFloat(String(meta.format.duration ?? ''));
      const strmDur = parseFloat(String(stream?.duration ?? ''));
      const durationSeconds = (isFinite(fmtDur) && fmtDur > 0) ? fmtDur
                            : (isFinite(strmDur) && strmDur > 0) ? strmDur
                            : 0;
      resolve({
        durationSeconds,
        sampleRate: parseInt(String(stream?.sample_rate ?? '44100'), 10),
        channels: stream?.channels ?? 1,
        format: meta.format.format_name?.split(',')[0] ?? 'unknown',
      });
    });
  });
}

export async function cut(inputPath: string, start: number, end: number): Promise<InternalOpResult> {
  const ext = extOf(inputPath);
  const output = outPath(ext);
  const duration = end - start;

  await runFfmpeg(
    ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(duration)
      .outputOptions(['-c copy'])
      .output(output)
  );

  const probe = await probeDuration(output);
  return { outputPath: output, durationSeconds: probe.durationSeconds };
}

export async function trim(inputPath: string, silenceThreshold: number, minSilenceDuration: number): Promise<InternalOpResult> {
  const ext = extOf(inputPath);
  const output = outPath(ext);

  await runFfmpeg(
    ffmpeg(inputPath)
      .audioFilters(`silenceremove=start_periods=1:start_silence=${minSilenceDuration}:start_threshold=${silenceThreshold}dB:stop_periods=1:stop_silence=${minSilenceDuration}:stop_threshold=${silenceThreshold}dB`)
      .output(output)
  );

  const probe = await probeDuration(output);
  return { outputPath: output, durationSeconds: probe.durationSeconds };
}

export async function merge(inputPaths: string[], crossfadeDuration: number): Promise<InternalOpResult> {
  const output = outPath('wav');

  if (crossfadeDuration > 0 && inputPaths.length === 2) {
    const duration1 = (await probeDuration(inputPaths[0])).durationSeconds;
    const offset = duration1 - crossfadeDuration;
    const cmd = ffmpeg();
    for (const p of inputPaths) cmd.input(p);
    await runFfmpeg(
      cmd
        .complexFilter([
          `[0]afade=t=out:st=${offset}:d=${crossfadeDuration}[a0]`,
          `[1]afade=t=in:st=0:d=${crossfadeDuration}[a1]`,
          `[a0][a1]amix=inputs=2:duration=longest[out]`,
        ], 'out')
        .output(output)
    );
  } else {
    // simple concat via filter_complex
    const cmd = ffmpeg();
    for (const p of inputPaths) cmd.input(p);
    const inputs = inputPaths.map((_, i) => `[${i}:a]`).join('');
    await runFfmpeg(
      cmd
        .complexFilter([`${inputs}concat=n=${inputPaths.length}:v=0:a=1[out]`], 'out')
        .output(output)
    );
  }

  const probe = await probeDuration(output);
  return { outputPath: output, durationSeconds: probe.durationSeconds };
}

export async function fade(
  inputPath: string,
  fadeInDuration: number,
  fadeOutDuration: number,
  curve: string,
  totalDuration: number,
): Promise<InternalOpResult> {
  const ext = extOf(inputPath);
  const output = outPath(ext);
  const filters: string[] = [];

  if (fadeInDuration > 0) {
    const type = curve === 'logarithmic' ? 'log' : 'tri';
    filters.push(`afade=t=in:st=0:d=${fadeInDuration}:curve=${type}`);
  }
  if (fadeOutDuration > 0) {
    const type = curve === 'logarithmic' ? 'log' : 'tri';
    const startTime = totalDuration - fadeOutDuration;
    filters.push(`afade=t=out:st=${startTime}:d=${fadeOutDuration}:curve=${type}`);
  }

  const cmd = ffmpeg(inputPath);
  if (filters.length > 0) cmd.audioFilters(filters);
  cmd.output(output);
  await runFfmpeg(cmd);

  const probe = await probeDuration(output);
  return { outputPath: output, durationSeconds: probe.durationSeconds };
}

export async function normalizeAudio(inputPath: string): Promise<InternalOpResult> {
  const output = outPath('wav');
  await runFfmpeg(ffmpeg(inputPath).output(output));
  const probe = await probeDuration(output);
  return { outputPath: output, durationSeconds: probe.durationSeconds };
}

export async function noiseGate(
  inputPath: string,
  thresholdDb: number,
  attackMs: number,
  releaseMs: number,
): Promise<InternalOpResult> {
  const ext = extOf(inputPath);
  const output = outPath(ext);

  await runFfmpeg(
    ffmpeg(inputPath)
      .audioFilters(`agate=threshold=${thresholdDb}dB:attack=${attackMs}:release=${releaseMs}`)
      .output(output)
  );

  const probe = await probeDuration(output);
  return { outputPath: output, durationSeconds: probe.durationSeconds };
}

function probeFile(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) reject(err);
      else resolve(meta);
    });
  });
}

export async function extractPeaks(
  inputPath: string,
  resolution: number,
  start?: number,
  end?: number,
): Promise<PeakData> {
  const { PassThrough } = await import('stream');
  const meta = await probeFile(inputPath);

  const duration = parseFloat(String(meta.format.duration ?? '0'));
  const startSec = start ?? 0;
  const endSec = end ?? duration;
  const segDuration = endSec - startSec;

  return new Promise((resolve, reject) => {
    const passThrough = new PassThrough();
    const chunks: Buffer[] = [];

    const cmd = ffmpeg(inputPath)
      .setStartTime(startSec)
      .setDuration(segDuration)
      .format('s16le')
      .audioChannels(1)
      .audioFrequency(8000)
      .output(passThrough as unknown as string, { end: true })
      .on('error', (err: Error) => reject(err));

    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passThrough.on('error', (err: Error) => reject(err));
    passThrough.on('end', () => {
      const buf = Buffer.concat(chunks);
      const samples = buf.length / 2;
      const blockSize = Math.max(1, Math.floor(samples / resolution));
      const peaks: Array<{ min: number; max: number }> = [];

      for (let i = 0; i < resolution; i++) {
        let min = Infinity;
        let max = -Infinity;
        const base = i * blockSize * 2;
        for (let j = 0; j < blockSize; j++) {
          const offset = base + j * 2;
          if (offset + 1 >= buf.length) break;
          const sample = buf.readInt16LE(offset) / 32768;
          if (sample < min) min = sample;
          if (sample > max) max = sample;
        }
        if (min === Infinity) { min = 0; max = 0; }
        peaks.push({ min, max });
      }

      resolve({ fileId: path.basename(inputPath), peaks, resolution });
    });

    cmd.run();
  });
}

export async function exportMix(
  segments: Array<{ filePath: string; volume: number; startTime: number }>,
  format: string,
  outputPath: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  const cmd = ffmpeg();
  for (const seg of segments) cmd.input(seg.filePath);

  const perTrack = segments.map((seg, i) => {
    const ms = Math.round(seg.startTime * 1000);
    return `[${i}:a]volume=${seg.volume},adelay=${ms}|${ms}[a${i}]`;
  });
  const mixInputs = segments.map((_, i) => `[a${i}]`).join('');
  perTrack.push(`${mixInputs}amix=inputs=${segments.length}:normalize=0:duration=longest[out]`);
  const filterComplex = perTrack.join(';');

  await new Promise<void>((resolve, reject) => {
    cmd
      .complexFilter(filterComplex, 'out')
      .outputOptions(formatOptions(format))
      .output(outputPath)
      .on('progress', (p: { percent?: number }) => onProgress(Math.round(p.percent ?? 0)))
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .run();
  });
}

function formatOptions(format: string): string[] {
  switch (format) {
    case 'mp3': return ['-codec:a libmp3lame', '-q:a 2'];
    case 'flac': return ['-codec:a flac'];
    case 'ogg': return ['-codec:a libvorbis', '-q:a 4'];
    case 'm4a':
    case 'aac': return ['-codec:a aac', '-b:a 192k'];
    default: return []; // wav: pcm_s16le default
  }
}
