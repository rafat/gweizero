import crypto from 'crypto';
import { JobPersistenceService } from './job-persistence.service';
import { WorkerAnalysisService, WorkerGasProfileResult } from './worker-analysis.service';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type AnalysisJobRecord = {
  id: string;
  sourceCode: string;
  status: JobStatus;
  attempts: number;
  cancelRequested: boolean;
  createdAt: number;
  updatedAt: number;
  error?: string;
  result?: WorkerGasProfileResult;
  retryOf?: string;
};

export type AnalysisJob = Omit<AnalysisJobRecord, 'sourceCode'>;

export class JobStoreService {
  private static jobs = new Map<string, AnalysisJobRecord>();
  private static controllers = new Map<string, AbortController>();
  private static initialized = false;
  private static writeChain: Promise<void> = Promise.resolve();

  public static async createAnalysisJob(code: string): Promise<AnalysisJob> {
    await this.ensureInitialized();

    const id = crypto.randomUUID();
    const now = Date.now();
    const job: AnalysisJobRecord = {
      id,
      sourceCode: code,
      status: 'queued',
      attempts: 1,
      cancelRequested: false,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(id, job);
    await this.persistJob(job);
    void this.processJob(id);
    return this.toPublicJob(job);
  }

  public static async getJob(id: string): Promise<AnalysisJob | undefined> {
    await this.ensureInitialized();
    const job = this.jobs.get(id);
    return job ? this.toPublicJob(job) : undefined;
  }

  public static async cancelJob(id: string): Promise<AnalysisJob | undefined> {
    await this.ensureInitialized();
    const job = this.jobs.get(id);
    if (!job) {
      return undefined;
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return this.toPublicJob(job);
    }

    const updated: AnalysisJobRecord = {
      ...job,
      cancelRequested: true,
      updatedAt: Date.now(),
      error: 'Job cancelled by user.',
    };

    if (job.status === 'queued') {
      updated.status = 'cancelled';
    }

    this.jobs.set(id, updated);
    await this.persistJob(updated);

    const controller = this.controllers.get(id);
    if (controller) {
      controller.abort();
    }

    return this.toPublicJob(updated);
  }

  public static async retryJob(id: string): Promise<AnalysisJob | undefined> {
    await this.ensureInitialized();
    const previous = this.jobs.get(id);
    if (!previous) {
      return undefined;
    }

    if (previous.status !== 'failed' && previous.status !== 'cancelled') {
      return this.toPublicJob(previous);
    }

    const retryId = crypto.randomUUID();
    const now = Date.now();
    const retryJob: AnalysisJobRecord = {
      id: retryId,
      sourceCode: previous.sourceCode,
      status: 'queued',
      attempts: previous.attempts + 1,
      cancelRequested: false,
      createdAt: now,
      updatedAt: now,
      retryOf: previous.id,
    };

    this.jobs.set(retryId, retryJob);
    await this.persistJob(retryJob);
    void this.processJob(retryId);
    return this.toPublicJob(retryJob);
  }

  private static async processJob(id: string): Promise<void> {
    const current = this.jobs.get(id);
    if (!current || current.cancelRequested || current.status === 'cancelled') {
      return;
    }

    const controller = new AbortController();
    this.controllers.set(id, controller);

    this.jobs.set(id, {
      ...current,
      status: 'processing',
      updatedAt: Date.now(),
      error: undefined,
    });
    await this.persistCurrent(id);

    try {
      const result = await WorkerAnalysisService.getGasProfile(current.sourceCode, id, controller.signal);
      const done = this.jobs.get(id);
      if (!done) {
        return;
      }

      if (done.cancelRequested) {
        this.jobs.set(id, {
          ...done,
          status: 'cancelled',
          updatedAt: Date.now(),
          error: 'Job cancelled by user.',
        });
      } else {
        this.jobs.set(id, {
          ...done,
          status: 'completed',
          result,
          updatedAt: Date.now(),
          error: undefined,
        });
      }
      await this.persistCurrent(id);
    } catch (error: unknown) {
      const failed = this.jobs.get(id);
      if (!failed) {
        return;
      }

      if (failed.cancelRequested || this.isAbortError(error)) {
        this.jobs.set(id, {
          ...failed,
          status: 'cancelled',
          updatedAt: Date.now(),
          error: 'Job cancelled by user.',
        });
      } else {
        const message = error instanceof Error ? error.message : 'Unknown worker error';
        this.jobs.set(id, {
          ...failed,
          status: 'failed',
          error: message,
          updatedAt: Date.now(),
        });
      }
      await this.persistCurrent(id);
    } finally {
      this.controllers.delete(id);
    }
  }

  private static async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const persisted = await JobPersistenceService.loadJobs();
    for (const job of persisted) {
      this.jobs.set(job.id, job);
    }

    this.initialized = true;
  }

  private static async persistCurrent(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      return;
    }
    await this.persistJob(job);
  }

  private static async persistJob(job: AnalysisJobRecord): Promise<void> {
    this.writeChain = this.writeChain.then(() => JobPersistenceService.upsertJob(job));
    await this.writeChain;
  }

  private static toPublicJob(job: AnalysisJobRecord): AnalysisJob {
    const { sourceCode: _sourceCode, ...publicJob } = job;
    return publicJob;
  }

  private static isAbortError(error: unknown): boolean {
    if (error instanceof Error && error.name === 'AbortError') {
      return true;
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return message.includes('aborted') || message.includes('cancel');
  }
}
