import crypto from 'crypto';
import { EventEmitter } from 'events';
import { AnalysisService, AnalysisPhase } from './analysis.service';

export type AnalysisJobStatus =
  | 'queued'
  | 'static_analysis'
  | 'dynamic_analysis'
  | 'ai_optimization'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AnalysisProgressEvent = {
  phase: AnalysisJobStatus;
  message: string;
  timestamp: number;
};

export type AnalysisResult = Awaited<ReturnType<typeof AnalysisService.processContract>>;

export type AnalysisJobRecord = {
  id: string;
  code: string;
  status: AnalysisJobStatus;
  createdAt: number;
  updatedAt: number;
  cancelRequested: boolean;
  error?: string;
  result?: AnalysisResult;
  events: AnalysisProgressEvent[];
};

export type AnalysisJob = Omit<AnalysisJobRecord, 'code'>;

export class AnalysisJobService {
  private static jobs = new Map<string, AnalysisJobRecord>();
  private static emitter = new EventEmitter();

  public static createJob(code: string): AnalysisJob {
    const id = crypto.randomUUID();
    const now = Date.now();
    const job: AnalysisJobRecord = {
      id,
      code,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      cancelRequested: false,
      events: [
        {
          phase: 'queued',
          message: 'Job queued.',
          timestamp: now,
        },
      ],
    };
    this.jobs.set(id, job);
    void this.runJob(id);
    return this.toPublicJob(job);
  }

  public static getJob(id: string): AnalysisJob | undefined {
    const job = this.jobs.get(id);
    return job ? this.toPublicJob(job) : undefined;
  }

  public static getInternalJob(id: string): AnalysisJobRecord | undefined {
    return this.jobs.get(id);
  }

  public static cancelJob(id: string): AnalysisJob | undefined {
    const job = this.jobs.get(id);
    if (!job) {
      return undefined;
    }
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return this.toPublicJob(job);
    }
    this.updateJob(id, {
      cancelRequested: true,
    });
    this.emitProgress(id, {
      phase: job.status,
      message: 'Cancellation requested.',
      timestamp: Date.now(),
    });
    return this.getJob(id);
  }

  public static subscribe(jobId: string, handler: (event: AnalysisProgressEvent) => void): () => void {
    const eventName = this.eventName(jobId);
    this.emitter.on(eventName, handler);
    return () => this.emitter.off(eventName, handler);
  }

  private static async runJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      return;
    }
    if (job.cancelRequested) {
      this.finishCancelled(id);
      return;
    }

    try {
      const result = await AnalysisService.processContract(job.code, (phase: AnalysisPhase, message: string) => {
        const current = this.jobs.get(id);
        if (!current) {
          return;
        }
        if (current.cancelRequested) {
          throw new Error('Analysis cancelled by user.');
        }
        this.updateJob(id, {
          status: phase,
        });
        this.emitProgress(id, {
          phase,
          message,
          timestamp: Date.now(),
        });
      });

      const latest = this.jobs.get(id);
      if (!latest) {
        return;
      }
      if (latest.cancelRequested) {
        this.finishCancelled(id);
        return;
      }

      this.updateJob(id, {
        status: 'completed',
        result,
        error: undefined,
      });
      this.emitProgress(id, {
        phase: 'completed',
        message: 'Analysis completed.',
        timestamp: Date.now(),
      });
    } catch (error: unknown) {
      const latest = this.jobs.get(id);
      if (!latest) {
        return;
      }

      if (latest.cancelRequested || this.isCancelledError(error)) {
        this.finishCancelled(id);
        return;
      }

      const message = error instanceof Error ? error.message : 'Analysis failed';
      this.updateJob(id, {
        status: 'failed',
        error: message,
      });
      this.emitProgress(id, {
        phase: 'failed',
        message,
        timestamp: Date.now(),
      });
    }
  }

  private static finishCancelled(id: string): void {
    this.updateJob(id, {
      status: 'cancelled',
      error: 'Analysis cancelled by user.',
    });
    this.emitProgress(id, {
      phase: 'cancelled',
      message: 'Analysis cancelled.',
      timestamp: Date.now(),
    });
  }

  private static emitProgress(id: string, event: AnalysisProgressEvent): void {
    const current = this.jobs.get(id);
    if (!current) {
      return;
    }
    current.events.push(event);
    current.updatedAt = Date.now();
    this.jobs.set(id, current);
    this.emitter.emit(this.eventName(id), event);
  }

  private static eventName(id: string): string {
    return `analysis-job:${id}`;
  }

  private static toPublicJob(job: AnalysisJobRecord): AnalysisJob {
    const { code: _code, ...rest } = job;
    return rest;
  }

  private static updateJob(id: string, updates: Partial<AnalysisJobRecord>): void {
    const current = this.jobs.get(id);
    if (!current) {
      return;
    }
    this.jobs.set(id, {
      ...current,
      ...updates,
      updatedAt: Date.now(),
    });
  }

  private static isCancelledError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return message.includes('cancel');
  }
}
