import { config } from './config';
import { createApp } from './app';
import { initStorage } from './services/storage.service';

initStorage();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Voice Editor backend running on http://localhost:${config.port}`);
  console.log(`Upload dir: ${config.uploadDir}`);
});
