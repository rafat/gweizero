import { Router } from 'express';
import {
  cancelAnalysisJob,
  createAnalysisJob,
  getAnalysisJob,
  health,
  retryAnalysisJob,
} from '../controllers/jobs.controller';

const router = Router();

router.get('/health', health);
router.post('/analyze', createAnalysisJob);
router.get('/:id', getAnalysisJob);
router.post('/:id/cancel', cancelAnalysisJob);
router.post('/:id/retry', retryAnalysisJob);

export default router;
