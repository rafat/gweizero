export type CreateAnalysisJobResponse = {
  jobId: string;
  status: string;
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
