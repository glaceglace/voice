import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable, map, filter } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UploadProgress {
  progress: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiBase;

  constructor(private http: HttpClient) {}

  uploadFile(file: File | Blob, filename = 'recording.webm'): Observable<{ progress: number } | { fileId: string; originalName: string; durationSeconds: number; sampleRate: number; channels: number; format: string }> {
    const form = new FormData();
    if (file instanceof File) {
      form.append('file', file, file.name);
    } else {
      form.append('file', file, filename);
    }
    return this.http.post<{ fileId: string; originalName: string; durationSeconds: number; sampleRate: number; channels: number; format: string }>(
      `${this.base}/audio/import`,
      form,
      { reportProgress: true, observe: 'events' },
    ).pipe(
      filter(e => e.type === HttpEventType.UploadProgress || e.type === HttpEventType.Response),
      map(e => {
        if (e.type === HttpEventType.UploadProgress) {
          const total = e.total ?? 1;
          return { progress: Math.round((e.loaded / total) * 100) };
        }
        return (e as { body: { fileId: string; originalName: string; durationSeconds: number; sampleRate: number; channels: number; format: string } }).body;
      }),
    );
  }

  getPeaks(fileId: string, resolution: number, start?: number, end?: number): Observable<{ fileId: string; peaks: { min: number; max: number }[]; resolution: number }> {
    let url = `${this.base}/audio/peaks/${fileId}?resolution=${resolution}`;
    if (start !== undefined) url += `&start=${start}`;
    if (end !== undefined) url += `&end=${end}`;
    return this.http.get<{ fileId: string; peaks: { min: number; max: number }[]; resolution: number }>(url);
  }

  cut(fileId: string, start: number, end: number): Observable<{ fileId: string; durationSeconds: number }> {
    return this.http.post<{ fileId: string; durationSeconds: number }>(`${this.base}/audio/cut`, { fileId, start, end });
  }

  trim(fileId: string, silenceThreshold: number, minSilenceDuration: number): Observable<{ fileId: string; durationSeconds: number }> {
    return this.http.post<{ fileId: string; durationSeconds: number }>(`${this.base}/audio/trim`, { fileId, silenceThreshold, minSilenceDuration });
  }

  merge(fileIds: string[], crossfadeDuration = 0): Observable<{ fileId: string; durationSeconds: number }> {
    return this.http.post<{ fileId: string; durationSeconds: number }>(`${this.base}/audio/merge`, { fileIds, crossfadeDuration });
  }

  fade(fileId: string, fadeInDuration: number, fadeOutDuration: number, curve: 'linear' | 'logarithmic' = 'linear'): Observable<{ fileId: string; durationSeconds: number }> {
    return this.http.post<{ fileId: string; durationSeconds: number }>(`${this.base}/audio/fade`, { fileId, fadeInDuration, fadeOutDuration, curve });
  }

  noiseGate(fileId: string, thresholdDb: number, attackMs: number, releaseMs: number): Observable<{ fileId: string; durationSeconds: number }> {
    return this.http.post<{ fileId: string; durationSeconds: number }>(`${this.base}/audio/noise-gate`, { fileId, thresholdDb, attackMs, releaseMs });
  }

  startExport(segments: { fileId: string; startTime: number; volume: number }[], format: string, sampleRate?: number, bitrate?: number): Observable<{ jobId: string }> {
    return this.http.post<{ jobId: string }>(`${this.base}/audio/export`, { segments, format, sampleRate, bitrate });
  }

  downloadExport(jobId: string): Observable<Blob> {
    return this.http.get(`${this.base}/audio/export/download/${jobId}`, { responseType: 'blob' });
  }

  deleteFile(fileId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/audio/file/${fileId}`);
  }

  sessionCleanup(): Observable<void> {
    return this.http.post<void>(`${this.base}/audio/session/cleanup`, {});
  }
}
