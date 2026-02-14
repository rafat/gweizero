type WorkerJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

type WorkerGasProfile = {
  deploymentGas: string;
  functions: Record<string, string>;
};

type WorkerResult = {
  gasProfile: WorkerGasProfile;
  abi: unknown[];
  bytecode: string;
  contractName: string;
};

type WorkerJobResponse = {
  id: string;
  status: WorkerJobStatus;
  result?: WorkerResult;
  error?: string;
};

type CreateJobResponse = {
  jobId: string;
  status: WorkerJobStatus;
};

export class HardhatService {
  public static async getGasProfile(code: string) {
    const workerUrl = process.env.COMPILATION_WORKER_URL || 'http://127.0.0.1:3010';
    const pollIntervalMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000', 10);
    const timeoutMs = parseInt(process.env.WORKER_TIMEOUT_MS || '180000', 10);

    const createResponse = await fetch(`${workerUrl}/jobs/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!createResponse.ok) {
      throw new Error(`Worker rejected analysis request: HTTP ${createResponse.status}`);
    }

    const createPayload = (await createResponse.json()) as CreateJobResponse;
    if (!createPayload.jobId) {
      throw new Error('Worker response did not include a job id.');
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await this.sleep(pollIntervalMs);
      const statusResponse = await fetch(`${workerUrl}/jobs/${createPayload.jobId}`);

      if (statusResponse.status === 404) {
        throw new Error('Worker job was not found.');
      }

      if (!statusResponse.ok) {
        throw new Error(`Worker status request failed: HTTP ${statusResponse.status}`);
      }

      const payload = (await statusResponse.json()) as WorkerJobResponse;
      if (payload.status === 'completed') {
        if (!payload.result) {
          throw new Error('Worker completed without returning result.');
        }
        return payload.result;
      }

      if (payload.status === 'failed') {
        throw new Error(payload.error || 'Worker analysis failed.');
      }

      if (payload.status === 'cancelled') {
        throw new Error(payload.error || 'Worker analysis cancelled.');
      }
    }

    throw new Error(`Worker analysis timed out after ${timeoutMs}ms.`);
  }

  private static async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
