import { Router } from 'express';
import { upload } from '../middleware/upload.middleware';
import * as ctrl from '../controllers/audio.controller';

const router = Router();

router.post('/import', upload.single('file'), ctrl.importAudio);
router.get('/peaks/:fileId', ctrl.getPeaks);
router.get('/file/:fileId/raw', ctrl.serveRawFile);
router.get('/segment/:fileId', ctrl.serveSegment);
router.post('/cut', ctrl.cutAudio);
router.post('/trim', ctrl.trimAudio);
router.post('/merge', ctrl.mergeAudio);
router.post('/fade', ctrl.fadeAudio);
router.post('/noise-gate', ctrl.noiseGateAudio);
router.post('/export', ctrl.startExport);
router.get('/export/progress/:jobId', ctrl.exportProgress);
router.get('/export/download/:jobId', ctrl.downloadExport);
router.delete('/file/:fileId', ctrl.deleteFileHandler);
router.post('/session/cleanup', ctrl.sessionCleanup);

export default router;
