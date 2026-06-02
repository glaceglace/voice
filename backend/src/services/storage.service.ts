import fs from 'fs';
import path from 'path';
import { config } from '../config';
import type { FileMetadata } from '../types/audio.types';

const SESSION_DIR = path.join(config.uploadDir, 'sessions');
const EXPORTS_DIR = path.join(config.uploadDir, 'exports');
const PURGE_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const FILE_TTL_MS = 30 * 60 * 1000;         // 30 minutes

const registry = new Map<string, FileMetadata>();

export function initStorage(): void {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  setInterval(purgeStaleFiles, PURGE_INTERVAL_MS);
}

export function registerFile(fileId: string, filePath: string, originalName: string): void {
  registry.set(fileId, {
    fileId,
    filePath,
    originalName,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  });
}

export function getFilePath(fileId: string): string | undefined {
  const meta = registry.get(fileId);
  if (!meta) return undefined;
  meta.lastAccessedAt = Date.now();
  return meta.filePath;
}

export function deleteFile(fileId: string): void {
  const meta = registry.get(fileId);
  if (!meta) return;
  registry.delete(fileId);
  try { fs.unlinkSync(meta.filePath); } catch { /* already gone */ }
}

export function sessionDir(): string {
  return SESSION_DIR;
}

export function exportsDir(): string {
  return EXPORTS_DIR;
}

export function cleanupAllFiles(): void {
  for (const [id] of registry) {
    deleteFile(id);
  }
}

function purgeStaleFiles(): void {
  const cutoff = Date.now() - FILE_TTL_MS;
  for (const [id, meta] of registry) {
    if (meta.lastAccessedAt < cutoff) {
      deleteFile(id);
    }
  }
}
