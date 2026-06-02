import path from 'path';
import fs from 'fs';

// load .env manually (no dotenv dependency)
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  uploadDir: process.env['UPLOAD_DIR'] ?? '/tmp/voice-editor',
  ffmpegPath: process.env['FFMPEG_PATH'] ?? '',
  corsOrigin: process.env['CORS_ORIGIN'] ?? 'http://localhost:4200',
};
