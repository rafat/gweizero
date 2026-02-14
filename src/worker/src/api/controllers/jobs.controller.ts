import { Request, Response } from 'express';
import { JobStoreService } from '../../services/job-store.service';

export const createAnalysisJob = async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Contract code is required' });
  }

  const job = await JobStoreService.createAnalysisJob(code);

  return res.status(202).json({
    jobId: job.id,
    status: job.status,
  });
};

export const getAnalysisJob = async (req: Request, res: Response) => {
  const job = await JobStoreService.getJob(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  return res.json(job);
};

export const cancelAnalysisJob = async (req: Request, res: Response) => {
  const job = await JobStoreService.cancelJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  return res.json(job);
};

export const retryAnalysisJob = async (req: Request, res: Response) => {
  const existing = await JobStoreService.getJob(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (existing.status !== 'failed' && existing.status !== 'cancelled') {
    return res.status(409).json({
      error: 'Only failed or cancelled jobs can be retried.',
      job: existing,
    });
  }

  const retryJob = await JobStoreService.retryJob(req.params.id);
  if (!retryJob) {
    return res.status(500).json({ error: 'Failed to create retry job.' });
  }

  return res.status(202).json({
    jobId: retryJob.id,
    status: retryJob.status,
    retryOf: existing.id,
  });
};

export const health = async (_req: Request, res: Response) => {
  return res.json({ ok: true });
};
