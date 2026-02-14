import { AIOptimizationResponse, AIOptimizerService } from './ai-optimizer.service';
import { GasProfilerService } from './gas-profiler.service';
import { HardhatService } from './hardhat.service';

export type AnalysisPhase = 'static_analysis' | 'dynamic_analysis' | 'ai_optimization';
export type ProgressCallback = (phase: AnalysisPhase, message: string) => void;

type WorkerDynamicProfile = Awaited<ReturnType<typeof HardhatService.getGasProfile>>;

type OptimizationValidation = {
  accepted: boolean;
  reason: string;
  checks: {
    compiled: boolean;
    abiCompatible: boolean;
    deploymentGasRegressionPct: number;
    averageMutableFunctionRegressionPct: number;
    improved: boolean;
  };
};

export class AnalysisService {
  public static async processContract(code: string, onProgress?: ProgressCallback) {
    onProgress?.('static_analysis', 'Parsing contract (static analysis)...');
    const staticProfile = GasProfilerService.analyze(code);

    onProgress?.('dynamic_analysis', 'Getting baseline gas profile (dynamic analysis)...');
    const baselineDynamicProfile = await HardhatService.getGasProfile(code);

    onProgress?.('ai_optimization', 'Generating and validating optimized candidates...');
    const optimizationLoop = await this.generateAcceptedOptimization(
      code,
      baselineDynamicProfile,
      onProgress
    );

    onProgress?.('ai_optimization', 'Analysis complete. Consolidating report...');
    return {
      staticProfile,
      dynamicProfile: baselineDynamicProfile,
      aiOptimizations: optimizationLoop.aiResult,
      optimizedDynamicProfile: optimizationLoop.optimizedDynamicProfile,
      optimizationValidation: optimizationLoop.validation,
      optimizationAttempts: optimizationLoop.attempts,
    };
  }

  private static async generateAcceptedOptimization(
    originalCode: string,
    baselineDynamicProfile: WorkerDynamicProfile,
    onProgress?: ProgressCallback
  ): Promise<{
    aiResult: AIOptimizationResponse;
    optimizedDynamicProfile: WorkerDynamicProfile | null;
    validation: OptimizationValidation;
    attempts: number;
  }> {
    const maxAttempts = this.envInt('AI_ACCEPTANCE_MAX_ATTEMPTS', 3);
    let feedback = '';
    let attempts = 0;

    let latestAIResult: AIOptimizationResponse = {
      ...(await AIOptimizerService.getOptimizations(originalCode, baselineDynamicProfile.gasProfile, {
        feedback: 'Initial optimization pass.',
      })),
    };

    for (let i = 0; i < maxAttempts; i++) {
      attempts += 1;
      if (i > 0) {
        latestAIResult = await AIOptimizerService.getOptimizations(
          originalCode,
          baselineDynamicProfile.gasProfile,
          { feedback }
        );
      }

      const candidateCode = latestAIResult.optimizedContract?.trim() || originalCode;
      if (!candidateCode || candidateCode === originalCode) {
        feedback = 'Candidate is unchanged or empty. Produce a meaningful but safe optimization.';
        onProgress?.('ai_optimization', `Attempt ${attempts}: candidate unchanged, retrying...`);
        continue;
      }

      onProgress?.('ai_optimization', `Attempt ${attempts}: compiling and benchmarking optimized candidate...`);

      try {
        const optimizedDynamicProfile = await HardhatService.getGasProfile(candidateCode);
        const validation = this.validateOptimizedCandidate(
          baselineDynamicProfile,
          optimizedDynamicProfile
        );

        if (validation.accepted) {
          return {
            aiResult: latestAIResult,
            optimizedDynamicProfile,
            validation,
            attempts,
          };
        }

        feedback = `Candidate rejected by acceptance policy: ${validation.reason}. ` +
          `deployment regression=${validation.checks.deploymentGasRegressionPct.toFixed(2)}%, ` +
          `function regression=${validation.checks.averageMutableFunctionRegressionPct.toFixed(2)}%.`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown compile/runtime error';
        feedback = `Candidate failed compile/deploy/gas analysis: ${message}`;
        onProgress?.('ai_optimization', `Attempt ${attempts} failed validation: ${message}`);
      }
    }

    return {
      aiResult: {
        ...latestAIResult,
        optimizedContract: originalCode,
        totalEstimatedSaving: `Rejected by acceptance policy after ${attempts} attempts.`,
        meta: {
          ...latestAIResult.meta,
          warnings: [
            ...(latestAIResult.meta.warnings || []),
            `Final acceptance failed. Last feedback: ${feedback}`,
          ],
        },
      },
      optimizedDynamicProfile: null,
      validation: {
        accepted: false,
        reason: `No candidate passed acceptance after ${attempts} attempts.`,
        checks: {
          compiled: false,
          abiCompatible: false,
          deploymentGasRegressionPct: 0,
          averageMutableFunctionRegressionPct: 0,
          improved: false,
        },
      },
      attempts,
    };
  }

  private static validateOptimizedCandidate(
    baseline: WorkerDynamicProfile,
    optimized: WorkerDynamicProfile
  ): OptimizationValidation {
    const abiCompatible = this.isAbiCompatible(baseline.abi, optimized.abi);
    const deploymentBefore = Number(baseline.gasProfile.deploymentGas || 0);
    const deploymentAfter = Number(optimized.gasProfile.deploymentGas || 0);

    const deploymentGasRegressionPct = this.percentChange(deploymentBefore, deploymentAfter);
    const avgBefore = this.averageFunctionGas(baseline.gasProfile.functions);
    const avgAfter = this.averageFunctionGas(optimized.gasProfile.functions);
    const averageMutableFunctionRegressionPct = this.percentChange(avgBefore, avgAfter);

    const improved = deploymentAfter < deploymentBefore || avgAfter < avgBefore;
    const maxAllowedRegressionPct = this.envInt('AI_MAX_ALLOWED_REGRESSION_PCT', 2);

    if (!abiCompatible) {
      return {
        accepted: false,
        reason: 'ABI compatibility check failed.',
        checks: {
          compiled: true,
          abiCompatible,
          deploymentGasRegressionPct,
          averageMutableFunctionRegressionPct,
          improved,
        },
      };
    }

    if (
      deploymentGasRegressionPct > maxAllowedRegressionPct ||
      averageMutableFunctionRegressionPct > maxAllowedRegressionPct
    ) {
      return {
        accepted: false,
        reason: `Gas regression exceeded threshold (${maxAllowedRegressionPct}%).`,
        checks: {
          compiled: true,
          abiCompatible,
          deploymentGasRegressionPct,
          averageMutableFunctionRegressionPct,
          improved,
        },
      };
    }

    return {
      accepted: true,
      reason: improved ? 'Candidate accepted.' : 'Candidate accepted (neutral gas result).',
      checks: {
        compiled: true,
        abiCompatible,
        deploymentGasRegressionPct,
        averageMutableFunctionRegressionPct,
        improved,
      },
    };
  }

  private static isAbiCompatible(baselineAbi: unknown[], optimizedAbi: unknown[]): boolean {
    const baseline = this.functionSignatures(baselineAbi);
    const optimized = this.functionSignatures(optimizedAbi);
    if (baseline.size !== optimized.size) {
      return false;
    }
    for (const signature of baseline) {
      if (!optimized.has(signature)) {
        return false;
      }
    }
    return true;
  }

  private static functionSignatures(abi: unknown[]): Set<string> {
    const set = new Set<string>();
    for (const item of abi as Array<Record<string, unknown>>) {
      if (item.type !== 'function') {
        continue;
      }
      const name = String(item.name || '');
      const stateMutability = String(item.stateMutability || '');
      const inputs = Array.isArray(item.inputs)
        ? (item.inputs as Array<Record<string, unknown>>).map((i) => String(i.type || 'unknown')).join(',')
        : '';
      const outputs = Array.isArray(item.outputs)
        ? (item.outputs as Array<Record<string, unknown>>).map((o) => String(o.type || 'unknown')).join(',')
        : '';
      set.add(`${name}(${inputs})->(${outputs})@${stateMutability}`);
    }
    return set;
  }

  private static averageFunctionGas(functions: Record<string, string>): number {
    const numeric = Object.values(functions)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (numeric.length === 0) {
      return 0;
    }
    const total = numeric.reduce((a, b) => a + b, 0);
    return total / numeric.length;
  }

  private static percentChange(before: number, after: number): number {
    if (!before || before <= 0) {
      return 0;
    }
    return ((after - before) / before) * 100;
  }

  private static envInt(envName: string, fallback: number): number {
    const raw = process.env[envName];
    if (!raw) {
      return fallback;
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  }
}
