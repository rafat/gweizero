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
  public static async processContract(code: string, onProgress?: ProgressCallback, jobId?: string) {
    onProgress?.('static_analysis', 'Parsing contract (static analysis)...');
    const staticProfile = GasProfilerService.analyze(code);

    onProgress?.('dynamic_analysis', 'Getting baseline gas profile (dynamic analysis)...');
    const baselineDynamicProfile = await HardhatService.getGasProfile(code);

    onProgress?.('ai_optimization', 'Generating and validating optimized candidates...');
    const optimizationLoop = await this.generateAcceptedOptimization(
      code,
      baselineDynamicProfile,
      onProgress,
      jobId
    );

    onProgress?.('ai_optimization', 'Analysis complete. Consolidating report...');
    return {
      originalContract: code,
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
    onProgress?: ProgressCallback,
    jobId?: string
  ): Promise<{
    aiResult: AIOptimizationResponse;
    optimizedDynamicProfile: WorkerDynamicProfile | null;
    validation: OptimizationValidation;
    attempts: number;
  }> {
    const maxAttempts = this.envInt('AI_ACCEPTANCE_MAX_ATTEMPTS', 3);
    let attempts = 0;

    // Run AI optimization ONCE
    onProgress?.('ai_optimization', 'Running AI optimization...');
    const aiResult = await AIOptimizerService.getOptimizations(originalCode, baselineDynamicProfile.gasProfile, {
      feedback: 'Initial optimization pass.',
      jobId,
      onProgress: (message) => onProgress?.('ai_optimization', message),
    });

    const candidateCode = aiResult.optimizedContract?.trim() || originalCode;
    if (!candidateCode || candidateCode === originalCode) {
      onProgress?.('ai_optimization', 'AI returned unchanged code, skipping validation.');
      return {
        aiResult,
        optimizedDynamicProfile: null,
        validation: {
          accepted: false,
          reason: 'AI returned unchanged code.',
          checks: {
            compiled: false,
            abiCompatible: false,
            deploymentGasRegressionPct: 0,
            averageMutableFunctionRegressionPct: 0,
            improved: false,
          },
        },
        attempts: 1,
      };
    }

    // Retry compilation/validation up to maxAttempts times
    for (let i = 0; i < maxAttempts; i++) {
      attempts += 1;
      onProgress?.('ai_optimization', `Attempt ${attempts}: compiling and benchmarking optimized candidate...`);

      try {
        const optimizedDynamicProfile = await HardhatService.getGasProfile(candidateCode);
        const validation = this.validateOptimizedCandidate(
          baselineDynamicProfile,
          optimizedDynamicProfile
        );

        if (validation.accepted) {
          onProgress?.('ai_optimization', `Validation passed! Optimization accepted.`);
          return {
            aiResult,
            optimizedDynamicProfile,
            validation,
            attempts,
          };
        }

        onProgress?.('ai_optimization', `Attempt ${attempts} failed validation: ${validation.reason}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown compile/runtime error';
        onProgress?.('ai_optimization', `Attempt ${attempts} failed validation: ${message}`);
      }
    }

    return {
      aiResult: {
        ...aiResult,
        optimizedContract: originalCode,
        totalEstimatedSaving: `Rejected by acceptance policy after ${attempts} attempts.`,
        meta: {
          ...aiResult.meta,
          warnings: [
            ...(aiResult.meta.warnings || []),
            `Final acceptance failed after ${attempts} attempts.`,
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
    const maxAllowedDeploymentRegressionPct = this.envInt('AI_MAX_DEPLOYMENT_REGRESSION_PCT', 15);

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

    if (averageMutableFunctionRegressionPct > maxAllowedRegressionPct) {
      return {
        accepted: false,
        reason: `Mutable-function gas regression exceeded threshold (${maxAllowedRegressionPct}%).`,
        checks: {
          compiled: true,
          abiCompatible,
          deploymentGasRegressionPct,
          averageMutableFunctionRegressionPct,
          improved,
        },
      };
    }

    if (deploymentGasRegressionPct > maxAllowedDeploymentRegressionPct) {
      return {
        accepted: false,
        reason: `Deployment gas regression exceeded secondary threshold (${maxAllowedDeploymentRegressionPct}%).`,
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

  private static averageFunctionGas(
    functions: Record<
      string,
      | {
          status: 'measured';
          gasUsed: string;
          stateMutability: string;
        }
      | {
          status: 'unmeasured';
          reason: string;
          stateMutability: string;
        }
    >
  ): number {
    const numeric = Object.values(functions)
      .filter(
        (entry): entry is { status: 'measured'; gasUsed: string; stateMutability: string } =>
          entry.status === 'measured' &&
          (entry.stateMutability === 'nonpayable' || entry.stateMutability === 'payable')
      )
      .map((entry) => Number(entry.gasUsed))
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
