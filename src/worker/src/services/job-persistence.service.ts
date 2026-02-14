import { AnalysisJobRecord } from './job-store.service';

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export class JobPersistenceService {
  private static pool: Queryable | null = null;
  private static initialized = false;

  public static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    const db = this.getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        id TEXT PRIMARY KEY,
        source_code TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL,
        cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        error TEXT,
        result JSONB,
        retry_of TEXT
      );
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status
      ON analysis_jobs (status);
    `);
    this.initialized = true;
  }

  public static async loadJobs(): Promise<AnalysisJobRecord[]> {
    await this.initialize();
    const db = this.getPool();
    const result = await db.query(`
      SELECT
        id,
        source_code,
        status,
        attempts,
        cancel_requested,
        created_at,
        updated_at,
        error,
        result,
        retry_of
      FROM analysis_jobs;
    `);
    return result.rows.map((row) => this.toJobRecord(row));
  }

  public static async upsertJob(job: AnalysisJobRecord): Promise<void> {
    await this.initialize();
    const db = this.getPool();
    await db.query(
      `
        INSERT INTO analysis_jobs (
          id,
          source_code,
          status,
          attempts,
          cancel_requested,
          created_at,
          updated_at,
          error,
          result,
          retry_of
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO UPDATE SET
          source_code = EXCLUDED.source_code,
          status = EXCLUDED.status,
          attempts = EXCLUDED.attempts,
          cancel_requested = EXCLUDED.cancel_requested,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          error = EXCLUDED.error,
          result = EXCLUDED.result,
          retry_of = EXCLUDED.retry_of
      `,
      [
        job.id,
        job.sourceCode,
        job.status,
        job.attempts,
        job.cancelRequested,
        job.createdAt,
        job.updatedAt,
        job.error || null,
        job.result ? JSON.stringify(job.result) : null,
        job.retryOf || null,
      ]
    );
  }

  private static toJobRecord(row: any): AnalysisJobRecord {
    return {
      id: row.id,
      sourceCode: row.source_code,
      status: row.status,
      attempts: row.attempts,
      cancelRequested: row.cancel_requested,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      error: row.error || undefined,
      result: row.result || undefined,
      retryOf: row.retry_of || undefined,
    };
  }

  private static getPool(): Queryable {
    if (this.pool) {
      return this.pool;
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for worker Postgres persistence.');
    }

    // Use runtime require to avoid type dependency friction in this monorepo.
    const { Pool } = require('pg') as { Pool: new (opts: any) => Queryable };

    const forceSsl =
      (process.env.PGSSLMODE || '').toLowerCase() === 'require' ||
      connectionString.toLowerCase().includes('sslmode=require');

    this.pool = new Pool({
      connectionString,
      ssl: forceSsl ? { rejectUnauthorized: false } : undefined,
    });

    return this.pool;
  }
}
