import { AnalysisJobHud } from "@/features/analysis/components/analysis-job-hud";

type PageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function AnalysisJobPage({ params }: PageProps) {
  const { jobId } = await params;
  return <AnalysisJobHud jobId={jobId} />;
}
