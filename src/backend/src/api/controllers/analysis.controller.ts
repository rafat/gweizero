import { Request, Response } from 'express';
import { AnalysisService } from '../../services/analysis.service';
import { AnalysisJobService } from '../../services/analysis-job.service';
import { ProofMintService } from '../../services/proof-mint.service';

export const analyzeContract = async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Contract code is required' });
  }

  try {
    console.log('Received contract code, starting analysis...');
    const report = await AnalysisService.processContract(code);
    res.json(report);
  } catch (error: any) {
    console.error('Analysis failed:', error.message);
    res.status(500).json({ error: 'Failed to analyze contract.', details: error.message });
  }
};

export const createAnalyzeJob = async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) {
    return res.status(400).json({ error: 'Contract code is required' });
  }

  const job = AnalysisJobService.createJob(code);
  return res.status(202).json({
    jobId: job.id,
    status: job.status,
  });
};

export const getAnalyzeJob = async (req: Request, res: Response) => {
  const job = AnalysisJobService.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  return res.json(job);
};

export const cancelAnalyzeJob = async (req: Request, res: Response) => {
  const job = AnalysisJobService.cancelJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  return res.json(job);
};

export const streamAnalyzeJob = async (req: Request, res: Response) => {
  const job = AnalysisJobService.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  for (const event of job.events) {
    res.write(`event: progress\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    res.write(`event: done\n`);
    res.write(`data: ${JSON.stringify({ status: job.status })}\n\n`);
    res.end();
    return;
  }

  const unsubscribe = AnalysisJobService.subscribe(job.id, (event) => {
    res.write(`event: progress\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    if (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'cancelled') {
      const latest = AnalysisJobService.getJob(job.id);
      res.write(`event: done\n`);
      res.write(`data: ${JSON.stringify({ status: latest?.status || event.phase })}\n\n`);
      unsubscribe();
      res.end();
    }
  });

  req.on('close', () => {
    unsubscribe();
  });
};

export const getProofPayloadFromJob = async (req: Request, res: Response) => {
  const job = AnalysisJobService.getInternalJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  try {
    const { contractAddress, contractName } = req.body as {
      contractAddress?: string;
      contractName?: string;
    };
    const payload = ProofMintService.buildProofPayload(job, contractAddress, contractName);
    return res.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to build proof payload';
    return res.status(400).json({ error: message });
  }
};

export const mintProofFromJob = async (req: Request, res: Response) => {
  const job = AnalysisJobService.getInternalJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  try {
    const { contractAddress, contractName } = req.body as {
      contractAddress?: string;
      contractName?: string;
    };

    const payload = ProofMintService.buildProofPayload(job, contractAddress, contractName);
    const receipt = await ProofMintService.mintProof(payload);
    return res.json({
      minted: true,
      payload,
      receipt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to mint proof';
    return res.status(400).json({ error: message });
  }
};
