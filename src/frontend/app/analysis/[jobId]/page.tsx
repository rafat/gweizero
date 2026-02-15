type PageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function AnalysisJobPage({ params }: PageProps) {
  const { jobId } = await params;

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <div className="rounded-2xl border border-line bg-surface/70 p-6 backdrop-blur">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">Analysis Job</p>
        <h1 className="text-2xl font-semibold">Job ID: {jobId}</h1>
        <p className="mt-3 text-muted">
          Milestone A complete. Next milestone will implement live SSE streaming, phase visualization, and full HUD
          analytics on this page.
        </p>
      </div>
    </main>
  );
}
