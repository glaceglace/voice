import express from 'express';
import path from 'path';
import { corsMiddleware } from './middleware/cors.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import audioRoutes from './routes/audio.routes';
import healthRoutes from './routes/health.routes';

export function createApp(): express.Application {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRoutes);
  app.use('/api/audio', audioRoutes);

  // serve Angular build in production
  const frontendDist = path.join(__dirname, '../../frontend/dist/frontend/browser');
  if (process.env['NODE_ENV'] === 'production') {
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  }

  app.use(errorMiddleware);

  return app;
}
