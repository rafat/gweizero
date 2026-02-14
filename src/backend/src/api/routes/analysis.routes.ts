import { Router } from 'express';
import {
  analyzeContract,
  cancelAnalyzeJob,
  createAnalyzeJob,
  getAnalyzeJob,
  getProofPayloadFromJob,
  mintProofFromJob,
  streamAnalyzeJob,
} from '../controllers/analysis.controller';

const router = Router();

router.post('/analyze', analyzeContract);
router.post('/analyze/jobs', createAnalyzeJob);
router.get('/analyze/jobs/:id', getAnalyzeJob);
router.post('/analyze/jobs/:id/cancel', cancelAnalyzeJob);
router.get('/analyze/jobs/:id/events', streamAnalyzeJob);
router.post('/analyze/jobs/:id/proof-payload', getProofPayloadFromJob);
router.post('/analyze/jobs/:id/mint-proof', mintProofFromJob);

export default router;
