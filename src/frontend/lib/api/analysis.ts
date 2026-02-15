export type CreateAnalysisJobResponse = {
  jobId: string;
  status: string;
};

export type AnalysisPhaseStatus =
  | "queued"
  | "static_analysis"
  | "dynamic_analysis"
  | "ai_optimization"
  | "completed"
  | "failed"
  | "cancelled";

export type AnalysisProgressEvent = {
  phase: AnalysisPhaseStatus;
  message: string;
  timestamp: number;
};

export type AnalysisJobResponse = {
  id: string;
  status: AnalysisPhaseStatus;
  createdAt: number;
  updatedAt: number;
  cancelRequested: boolean;
  error?: string;
  events: AnalysisProgressEvent[];
  result?: {
    optimizationValidation?: {
      accepted: boolean;
      reason: string;
    };
    optimizationAttempts?: number;
    dynamicProfile?: {
      gasProfile?: {
        deploymentGas?: string;
      };
    };
    optimizedDynamicProfile?: {
      gasProfile?: {
        deploymentGas?: string;
      };
    };
  };
};

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3001";

export async function createAnalysisJob(code: string): Promise<CreateAnalysisJobResponse> {
  const response = await fetch(`${BASE_URL}/api/analyze/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create analysis job (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function getAnalysisJob(jobId: string): Promise<AnalysisJobResponse> {
  const response = await fetch(`${BASE_URL}/api/analyze/jobs/${jobId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch analysis job (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function cancelAnalysisJob(jobId: string): Promise<AnalysisJobResponse> {
  const response = await fetch(`${BASE_URL}/api/analyze/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to cancel analysis job (${response.status}): ${errorText}`);
  }

  return response.json();
}

export function analysisEventsUrl(jobId: string): string {
  return `${BASE_URL}/api/analyze/jobs/${jobId}/events`;
}

export function isTerminalStatus(status: AnalysisPhaseStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
